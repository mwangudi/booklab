import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole, branchScope, enforceWriteBranch } from '../middleware/authGuard.js';
import { SYNC_ROLE, enqueueOutbox, recordMovement } from '../lib/outbox.js';
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
const stockTakeSchema = z.object({
  branchId: z.number().int(),
  note: z.string().max(200).optional(),
  items: z
    .array(z.object({ sku: z.string().min(1), counted: z.number().int().min(0) }))
    .min(1)
    .max(5000),
});
const LOW = 5;
/// Window used to rank best sellers at the till.
const POPULAR_DAYS = 60;

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  // Full catalogue for a branch: every product is returned, merged with this
  // branch's stock rows. Items not yet stocked here come back with quantity 0
  // and no price override — so every store item is available in every branch.
  app.get('/branch/:branchId', async (req, reply) => {
    const { branchId } = req.params as { branchId: string };
    const scoped = branchScope(req, reply, Number(branchId));
    const since = new Date();
    since.setDate(since.getDate() - POPULAR_DAYS);
    const [books, stock, sold] = await Promise.all([
      app.prisma.book.findMany({ where: { deletedAt: null }, orderBy: { title: 'asc' } }),
      app.prisma.stock.findMany({ where: { branchId: scoped } }),
      // Units moved at this branch recently — drives the "top sellers first"
      // ordering at the till. Voided sales must not count towards popularity.
      app.prisma.saleItem.groupBy({
        by: ['bookId'],
        where: { sale: { branchId: scoped, voidedAt: null, createdAt: { gte: since } } },
        _sum: { quantity: true },
      }),
    ]);
    const byBook = new Map(stock.map((s) => [s.bookId, s]));
    const soldBy = new Map(sold.map((r) => [r.bookId, r._sum.quantity ?? 0]));
    return books.map((book) => {
      const existing = byBook.get(book.id);
      const base = existing
        ? { ...existing, book }
        : { id: -book.id, branchId: scoped, bookId: book.id, quantity: 0, price: null, book };
      return { ...base, sold: soldBy.get(book.id) ?? 0 };
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
        await recordMovement(tx, {
          branchId,
          bookId: body.bookId,
          delta,
          type: 'ADJUST',
          note: body.note?.trim() || `Stock take: ${before} -> ${body.quantity}`,
          userId: req.user.id,
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
      await recordMovement(tx, { branchId, bookId: body.bookId, delta: body.quantity, type: 'INTAKE', userId: req.user.id });
      const stock = await tx.stock.upsert({
        where: { branchId_bookId: { branchId, bookId: body.bookId } },
        create: { branchId, bookId: body.bookId, quantity: body.quantity },
        update: { quantity: { increment: body.quantity } },
      });
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

  // Sheet for a monthly count: every stocked product with its system quantity.
  app.get('/take-sheet', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { branchId } = req.query as { branchId?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    if (scoped == null) return reply.code(400).send({ error: 'Choose a branch to count.' });
    const [books, stock] = await Promise.all([
      app.prisma.book.findMany({ where: { deletedAt: null }, orderBy: { title: 'asc' } }),
      app.prisma.stock.findMany({ where: { branchId: scoped } }),
    ]);
    const qty = new Map(stock.map((s) => [s.bookId, s.quantity]));
    return books.map((b) => ({
      sku: b.sku,
      title: b.title,
      category: b.category ?? '',
      unit: b.unit,
      systemQty: qty.get(b.id) ?? 0,
    }));
  });

  /**
   * Apply a counted stock take. Each difference becomes an attributable ADJUST
   * movement, so the count is fully explained in the stock history.
   */
  app.post('/take', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = stockTakeSchema.parse(req.body);
    const branchId = enforceWriteBranch(req, reply, body.branchId);

    const skus = body.items.map((i) => i.sku.trim());
    const books = await app.prisma.book.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
    const bookBySku = new Map(books.map((b) => [b.sku, b.id]));

    const note = body.note?.trim() || `Stock take ${new Date().toISOString().slice(0, 10)}`;
    const results = { counted: 0, adjusted: 0, unchanged: 0, unknown: [] as string[], netUnits: 0 };

    for (const item of body.items) {
      const sku = item.sku.trim();
      const bookId = bookBySku.get(sku);
      if (!bookId) {
        results.unknown.push(sku);
        continue;
      }
      results.counted += 1;
      const existing = await app.prisma.stock.findUnique({ where: { branchId_bookId: { branchId, bookId } } });
      const before = existing?.quantity ?? 0;
      const delta = item.counted - before;
      if (delta === 0) {
        results.unchanged += 1;
        continue;
      }
      await app.prisma.$transaction(async (tx) => {
        await tx.stock.upsert({
          where: { branchId_bookId: { branchId, bookId } },
          create: { branchId, bookId, quantity: item.counted },
          update: { quantity: item.counted },
        });
        await recordMovement(tx, {
          branchId,
          bookId,
          delta,
          type: 'ADJUST',
          note: `${note}: ${before} -> ${item.counted}`,
          userId: req.user.id,
        });
      });
      results.adjusted += 1;
      results.netUnits += delta;
    }

    await writeAudit(app.prisma, {
      ...actor(req),
      branchId,
      entity: 'stock.quantity',
      action: 'STOCK_TAKE_BULK',
      details: { note, counted: results.counted, adjusted: results.adjusted, netUnits: results.netUnits, unknown: results.unknown.length },
    });
    return results;
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
      await recordMovement(tx, {
        branchId: fromBranchId, bookId: body.bookId, delta: -body.quantity, type: 'TRANSFER_OUT', note, userId: req.user.id, originBranchId: fromBranchId,
      });
      await recordMovement(tx, {
        branchId: body.toBranchId, bookId: body.bookId, delta: body.quantity, type: 'TRANSFER_IN', note, userId: req.user.id, originBranchId: fromBranchId,
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
