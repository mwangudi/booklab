import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole, branchScope, enforceWriteBranch } from '../middleware/authGuard.js';
import { SYNC_ROLE, enqueueOutbox } from '../lib/outbox.js';
import { actor, auditRequest, writeAudit } from '../lib/audit.js';

const stockSetSchema = z.object({ branchId: z.number().int(), bookId: z.number().int(), quantity: z.number().int(), note: z.string().max(200).optional() });
const priceSetSchema = z.object({ branchId: z.number().int(), bookId: z.number().int(), price: z.number().nonnegative().nullable() });
const intakeSchema = z.object({ branchId: z.number().int(), bookId: z.number().int(), quantity: z.number().int().positive() });
const transferSchema = z.object({
  fromBranchId: z.number().int(),
  toBranchId: z.number().int(),
  bookId: z.number().int(),
  quantity: z.number().int().positive(),
  note: z.string().max(200).optional(),
});
const LOW = 5;

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  // Full catalogue for a branch: every product is returned, merged with this
  // branch's stock rows. Items not yet stocked here come back with quantity 0
  // and no price override — so every store item is available in every branch.
  app.get('/branch/:branchId', async (req, reply) => {
    const { branchId } = req.params as { branchId: string };
    const scoped = branchScope(req, reply, Number(branchId));
    const [books, stock] = await Promise.all([
      app.prisma.book.findMany({ where: { deletedAt: null }, orderBy: { title: 'asc' } }),
      app.prisma.stock.findMany({ where: { branchId: scoped } }),
    ]);
    const byBook = new Map(stock.map((s) => [s.bookId, s]));
    return books.map((book) => {
      const existing = byBook.get(book.id);
      return existing
        ? { ...existing, book }
        : { id: -book.id, branchId: scoped, bookId: book.id, quantity: 0, price: null, book };
    });
  });

  // Per-branch valuation summary (retail + cost value, low/out counts).
  app.get('/valuation', async (req, reply) => {
    const scoped = branchScope(req, reply, undefined);
    const branchWhere = scoped == null ? {} : { id: scoped };
    const branches = await app.prisma.branch.findMany({ where: branchWhere, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    const perBranch = await Promise.all(
      branches.map(async (b) => {
        const rows = await app.prisma.stock.findMany({ where: { branchId: b.id, book: { deletedAt: null } }, include: { book: { select: { unitPrice: true, costPrice: true } } } });
        let units = 0, retailValue = 0, costValue = 0, lowCount = 0, outCount = 0;
        for (const r of rows) {
          units += r.quantity;
          retailValue += r.quantity * Number(r.price ?? r.book.unitPrice);
          costValue += r.quantity * Number(r.book.costPrice);
          if (r.quantity <= 0) outCount += 1;
          else if (r.quantity < LOW) lowCount += 1;
        }
        return { branchId: b.id, name: b.name, skuCount: rows.length, units, retailValue, costValue, lowCount, outCount };
      }),
    );
    const totals = perBranch.reduce(
      (a, b) => ({ skuCount: a.skuCount + b.skuCount, units: a.units + b.units, retailValue: a.retailValue + b.retailValue, costValue: a.costValue + b.costValue, lowCount: a.lowCount + b.lowCount, outCount: a.outCount + b.outCount }),
      { skuCount: 0, units: 0, retailValue: 0, costValue: 0, lowCount: 0, outCount: 0 },
    );
    return { totals, branches: perBranch.sort((a, b) => b.retailValue - a.retailValue) };
  });

  // Set absolute quantity (stock take). Logs the difference as an attributable ADJUST movement.
  app.put('/', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = stockSetSchema.parse(req.body);
    const branchId = enforceWriteBranch(req, reply, body.branchId);
    return app.prisma.$transaction(async (tx) => {
      const existing = await tx.stock.findUnique({ where: { branchId_bookId: { branchId, bookId: body.bookId } } });
      const before = existing?.quantity ?? 0;
      const delta = body.quantity - before;
      const updated = await tx.stock.upsert({
        where: { branchId_bookId: { branchId, bookId: body.bookId } },
        create: { branchId, bookId: body.bookId, quantity: body.quantity },
        update: { quantity: body.quantity },
      });
      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            branchId,
            bookId: body.bookId,
            delta,
            type: 'ADJUST',
            note: body.note?.trim() || `Stock take: ${before} -> ${body.quantity}`,
            userId: req.user.id,
            originBranchId: branchId,
          },
        });
        await writeAudit(tx, {
          ...actor(req),
          branchId,
          entity: 'stock.quantity',
          entityId: body.bookId,
          action: 'STOCK_TAKE',
          details: { from: before, to: body.quantity, delta, note: body.note?.trim() || null },
        });
      }
      return updated;
    });
  });

  // Set a per-branch selling price override. Pass price=null to clear it (falls back to the catalogue price).
  app.put('/price', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = priceSetSchema.parse(req.body);
    const branchId = enforceWriteBranch(req, reply, body.branchId);
    const existing = await app.prisma.stock.findUnique({ where: { branchId_bookId: { branchId, bookId: body.bookId } } });
    const updated = await app.prisma.stock.upsert({
      where: { branchId_bookId: { branchId, bookId: body.bookId } },
      create: { branchId, bookId: body.bookId, quantity: 0, price: body.price },
      update: { price: body.price },
    });
    await writeAudit(app.prisma, {
      ...actor(req),
      branchId,
      entity: 'stock.price',
      entityId: body.bookId,
      action: body.price == null ? 'CLEAR_PRICE' : 'SET_PRICE',
      details: { from: existing?.price == null ? null : Number(existing.price), to: body.price },
    });
    return updated;
  });

  // Receive stock (increment) as a movement event. Syncs idempotently to the cloud.
  app.post('/intake', { preHandler: requireRole('ADMIN', 'MANAGER', 'CASHIER') }, async (req, reply) => {
    const body = intakeSchema.parse(req.body);
    const branchId = enforceWriteBranch(req, reply, body.branchId);
    const result = await app.prisma.$transaction(async (tx) => {
      const move = await tx.stockMovement.create({
        data: { branchId, bookId: body.bookId, delta: body.quantity, type: 'INTAKE', originBranchId: branchId, userId: req.user.id },
        include: { book: { select: { uuid: true } }, branch: { select: { uuid: true } } },
      });
      const stock = await tx.stock.upsert({
        where: { branchId_bookId: { branchId, bookId: body.bookId } },
        create: { branchId, bookId: body.bookId, quantity: body.quantity },
        update: { quantity: { increment: body.quantity } },
      });
      if (SYNC_ROLE === 'branch') {
        await enqueueOutbox(tx, 'stockMovement', move.uuid, {
          branchUuid: move.branch.uuid,
          bookUuid: move.book.uuid,
          delta: move.delta,
          type: move.type,
          note: move.note,
          createdAt: move.createdAt,
        });
      }
      return stock;
    });
    await auditRequest(app.prisma, req, {
      branchId,
      entity: 'stock.quantity',
      entityId: body.bookId,
      action: 'INTAKE',
      details: { quantity: body.quantity },
    });
    return result;
  });

  // Stock movement history — the audit trail behind every quantity change.
  app.get('/movements', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { branchId, bookId, from, to, limit } = req.query as {
      branchId?: string; bookId?: string; from?: string; to?: string; limit?: string;
    };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    const rows = await app.prisma.stockMovement.findMany({
      where: {
        branchId: scoped,
        bookId: bookId ? Number(bookId) : undefined,
        createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      include: {
        book: { select: { title: true, sku: true } },
        branch: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 500, 2000),
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      branch: r.branch.name,
      title: r.book.title,
      sku: r.book.sku,
      delta: r.delta,
      type: r.type,
      note: r.note,
      user: r.user?.name ?? 'System',
    }));
  });

  // Move stock between branches. Recorded as a paired OUT/IN movement.
  app.post('/transfer', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = transferSchema.parse(req.body);
    if (body.fromBranchId === body.toBranchId) return reply.code(400).send({ error: 'Choose two different branches.' });
    // Managers may only send stock out of their own branch; admins may move any.
    const fromBranchId = enforceWriteBranch(req, reply, body.fromBranchId);

    const source = await app.prisma.stock.findUnique({ where: { branchId_bookId: { branchId: fromBranchId, bookId: body.bookId } } });
    if (!source || source.quantity < body.quantity) {
      return reply.code(400).send({ error: `Not enough stock to transfer. On hand: ${source?.quantity ?? 0}.` });
    }
    const target = await app.prisma.branch.findUnique({ where: { id: body.toBranchId }, select: { id: true } });
    if (!target) return reply.code(404).send({ error: 'Destination branch not found' });

    return app.prisma.$transaction(async (tx) => {
      const out = await tx.stock.update({
        where: { branchId_bookId: { branchId: fromBranchId, bookId: body.bookId } },
        data: { quantity: { decrement: body.quantity } },
      });
      await tx.stock.upsert({
        where: { branchId_bookId: { branchId: body.toBranchId, bookId: body.bookId } },
        create: { branchId: body.toBranchId, bookId: body.bookId, quantity: body.quantity },
        update: { quantity: { increment: body.quantity } },
      });
      const note = body.note?.trim() || 'Branch transfer';
      await tx.stockMovement.create({
        data: { branchId: fromBranchId, bookId: body.bookId, delta: -body.quantity, type: 'TRANSFER_OUT', note, userId: req.user.id, originBranchId: fromBranchId },
      });
      await tx.stockMovement.create({
        data: { branchId: body.toBranchId, bookId: body.bookId, delta: body.quantity, type: 'TRANSFER_IN', note, userId: req.user.id, originBranchId: fromBranchId },
      });
      await writeAudit(tx, {
        ...actor(req),
        branchId: fromBranchId,
        entity: 'stock.transfer',
        entityId: body.bookId,
        action: 'TRANSFER',
        details: { from: fromBranchId, to: body.toBranchId, quantity: body.quantity, note },
      });
      return { ok: true, remaining: out.quantity };
    });
  });
}
