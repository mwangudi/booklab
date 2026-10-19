import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authGuard, requireRole, branchScope, enforceWriteBranch } from '../middleware/authGuard.js';
import { SYNC_ROLE, enqueueOutbox } from '../lib/outbox.js';
import { actor, writeAudit } from '../lib/audit.js';
import { CASHIER_TIERS, cashierMaxDiscountPct } from '../lib/salesPolicy.js';
import { can } from '../middleware/permissions.js';

const saleSchema = z.object({
  branchId: z.number().int().optional(),
  paymentMethod: z.enum(['CASH', 'MPESA', 'CARD']).default('CASH'),
  priceTier: z.enum(['RETAIL', 'WHOLESALE', 'SCHOOL']).default('RETAIL'),
  mpesaRef: z.string().optional(),
  discount: z.number().nonnegative().default(0),
  discountReason: z.string().max(190).optional(),
  items: z
    .array(z.object({ bookId: z.number().int(), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative() }))
    .min(1),
  /**
   * Supplied by a till that recorded this sale offline. Replaying the same id
   * returns the sale that already exists instead of ringing it up again, so a
   * retry on a flaky connection cannot charge the customer twice.
   */
  uuid: z.string().uuid().optional(),
  /**
   * Set by the till on a sale it queued while offline. The goods have already
   * left the shop, so a stock shortfall is recorded rather than refused — the
   * till drops a refused sale, and the takings would vanish with it.
   */
  recordedOffline: z.boolean().optional(),
});

/** Raised inside the sale transaction when a line's stock ran out after the pre-check. */
class StockRaceError extends Error {}

const voidSchema = z.object({ reason: z.string().trim().min(3).max(200) });

/** Who rang a sale up. Never `user: true` — that would send the password hash. */
const SALE_USER = { select: { id: true, name: true } } as const;

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export async function saleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  app.get('/', async (req, reply) => {
    const { branchId, from, to } = req.query as { branchId?: string; from?: string; to?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    return app.prisma.sale.findMany({
      where: { branchId: scoped, createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } },
      include: { items: { include: { book: true } }, branch: true, user: SALE_USER, voidedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  app.post('/', async (req, reply) => {
    const body = saleSchema.parse(req.body);
    const branchId = enforceWriteBranch(req, reply, body.branchId);

    if (body.uuid) {
      const already = await app.prisma.sale.findUnique({
        where: { uuid: body.uuid },
        include: { items: { include: { book: true } }, branch: true, user: SALE_USER },
      });
      // Replay only into the same branch; a uuid must not reveal another branch's sale.
      if (already && already.branchId !== branchId) return reply.code(409).send({ error: 'Sale id already used' });
      if (already) return reply.code(200).send(already);
    }

    const subtotal = round2(body.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
    const discount = round2(Math.min(body.discount, subtotal));
    if (body.discount > subtotal + 0.01) {
      return reply.code(400).send({ error: 'The discount cannot be more than the sale total.' });
    }
    const total = round2(subtotal - discount);

    // Lower price tiers and discounts past the cap are capabilities: managers hold both
    // by default, and an admin can grant either to a person (Administration → Permissions).
    if (!(CASHIER_TIERS as readonly string[]).includes(body.priceTier) && !(await can(app.prisma, req.user, 'sale.tierPrice'))) {
      await writeAudit(app.prisma, { ...actor(req), branchId, entity: 'sale', action: 'TIER_BLOCKED', details: { priceTier: body.priceTier, subtotal } });
      return reply.code(403).send({ error: 'Wholesale and school prices need permission. Sell at retail, or ask a manager.' });
    }
    if (discount > 0 && !(await can(app.prisma, req.user, 'sale.discount'))) {
      const maxPct = cashierMaxDiscountPct();
      if (discount > round2((subtotal * maxPct) / 100) + 0.01) {
        await writeAudit(app.prisma, { ...actor(req), branchId, entity: 'sale', action: 'DISCOUNT_BLOCKED', details: { discount, subtotal, maxPct } });
        return reply.code(403).send({ error: `You can discount at most ${maxPct}% of the sale (${round2((subtotal * maxPct) / 100).toFixed(2)}). Ask a manager for more.` });
      }
    }

    // Snapshot each book's current cost for accurate historical P&L.
    const books = await app.prisma.book.findMany({
      where: { id: { in: body.items.map((i) => i.bookId) } },
      select: { id: true, uuid: true, title: true, costPrice: true, unitPrice: true, priceWholesale: true, priceSchool: true },
    });
    const bookById = new Map(books.map((b) => [b.id, b]));

    // The till may charge above the configured price but never below it.
    const overrides = await app.prisma.stock.findMany({
      where: { branchId, bookId: { in: body.items.map((i) => i.bookId) } },
      select: { bookId: true, quantity: true, price: true, priceWholesale: true, priceSchool: true, costPrice: true },
    });
    const overrideByBook = new Map(overrides.map((o) => [o.bookId, o]));
    const underpriced: string[] = [];
    const unpriced: string[] = [];
    for (const item of body.items) {
      const book = bookById.get(item.bookId);
      if (!book) return reply.code(400).send({ error: `Unknown product in the sale (id ${item.bookId}).` });
      const branchPrices = overrideByBook.get(item.bookId);
      // A branch price beats the catalogue at every tier; anything the branch has
      // not set falls back to the catalogue, and the tiers fall back to retail.
      const retail = Number(branchPrices?.price ?? book.unitPrice);
      const floor =
        body.priceTier === 'WHOLESALE' ? Number(branchPrices?.priceWholesale ?? book.priceWholesale ?? retail)
        : body.priceTier === 'SCHOOL' ? Number(branchPrices?.priceSchool ?? book.priceSchool ?? retail)
        : retail;
      // A floor of zero means nobody has priced this product, and the check
      // below would wave anything through — including giving it away.
      if (floor <= 0) {
        unpriced.push(book.title);
        continue;
      }
      // Tolerate rounding noise from the client, but nothing more.
      if (item.unitPrice < floor - 0.01) underpriced.push(`${book.title} (minimum ${floor.toFixed(2)})`);
    }
    if (unpriced.length > 0) {
      return reply.code(400).send({
        error: `No price is set for: ${unpriced.join('; ')}. Set a price before selling.`,
      });
    }
    if (underpriced.length > 0) {
      return reply.code(400).send({ error: `These items are priced below the set price: ${underpriced.join('; ')}.` });
    }

    // Never sell what the branch does not have. The till already limits the basket
    // to what it last saw on the shelf; this catches a stale screen, and the
    // conditional decrement below catches two tills selling the last copy at once.
    const offline = body.recordedOffline === true;
    const wanted = new Map<number, number>();
    for (const i of body.items) wanted.set(i.bookId, (wanted.get(i.bookId) ?? 0) + i.quantity);
    const short = [...wanted].filter(([bookId, qty]) => (overrideByBook.get(bookId)?.quantity ?? 0) < qty);
    if (short.length > 0 && !offline) {
      const detail = short
        .map(([bookId, qty]) => `${bookById.get(bookId)?.title ?? `#${bookId}`} (asked ${qty}, on hand ${overrideByBook.get(bookId)?.quantity ?? 0})`)
        .join('; ');
      return reply.code(400).send({ error: `Not enough stock — ${detail}. Refresh the till.` });
    }
    const oversold: Array<{ bookId: number; quantity: number }> = [];

    let alreadyExisted = false;
    const sale = await app.prisma
      .$transaction(async (tx) => {
        const created = await tx.sale.create({
        data: {
          uuid: body.uuid,
          branchId,
          userId: req.user.id,
          originBranchId: branchId,
          paymentMethod: body.paymentMethod,
          priceTier: body.priceTier,
          mpesaRef: body.mpesaRef,
          subtotal,
          discount,
          discountReason: discount > 0 ? body.discountReason?.trim() || null : null,
          total,
          items: {
            create: body.items.map((i) => ({
              bookId: i.bookId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              // What this branch paid, when it has its own cost.
              costPrice: Number(overrideByBook.get(i.bookId)?.costPrice ?? bookById.get(i.bookId)?.costPrice ?? 0),
            })),
          },
        },
        include: { items: true },
      });

      for (const item of body.items) {
        const { count } = await tx.stock.updateMany({
          where: { branchId, bookId: item.bookId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (count === 0) {
          if (!offline) throw new StockRaceError();
          // Already handed over while offline: record it, and let the shortfall show.
          await tx.stock.upsert({
            where: { branchId_bookId: { branchId, bookId: item.bookId } },
            create: { branchId, bookId: item.bookId, quantity: -item.quantity },
            update: { quantity: { decrement: item.quantity } },
          });
          oversold.push({ bookId: item.bookId, quantity: item.quantity });
        }
        // Audit trail: every stock change is an explicit, attributable event.
        await tx.stockMovement.create({
          data: {
            branchId,
            bookId: item.bookId,
            delta: -item.quantity,
            type: 'SALE',
            note: `Sale #${created.id}`,
            userId: req.user.id,
            originBranchId: branchId,
          },
        });
      }

      if (SYNC_ROLE === 'branch') {
        const [branch, user] = await Promise.all([
          tx.branch.findUnique({ where: { id: branchId }, select: { uuid: true } }),
          tx.user.findUnique({ where: { id: req.user.id }, select: { uuid: true } }),
        ]);
        await enqueueOutbox(tx, 'sale', created.uuid, {
          branchUuid: branch?.uuid,
          userUuid: user?.uuid,
          subtotal,
          discount,
          discountReason: created.discountReason,
          total,
          paymentMethod: created.paymentMethod,
          priceTier: created.priceTier,
          mpesaRef: created.mpesaRef,
          createdAt: created.createdAt,
          items: created.items.map((i) => ({
            uuid: i.uuid,
            bookUuid: bookById.get(i.bookId)?.uuid,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            costPrice: Number(i.costPrice),
          })),
        });
      }
      return created;
      })
      .catch(async (e) => {
        // Two replays of the same offline sale can both pass the existence check
        // above and race to here. The unique index is the real arbiter: whichever
        // loses returns the sale the winner created rather than failing.
        if (body.uuid && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const existing = await app.prisma.sale.findUnique({
            where: { uuid: body.uuid },
            include: { items: { include: { book: true } }, branch: true, user: SALE_USER },
          });
          if (existing && existing.branchId === branchId) {
            alreadyExisted = true;
            return existing;
          }
        }
        throw e;
      })
      .catch((e) => {
        if (e instanceof StockRaceError) return null;
        throw e;
      });
    if (!sale) {
      return reply.code(400).send({ error: 'Not enough stock — another sale took the last units. Refresh the till.' });
    }

    // A replay must not be audited or counted a second time.
    if (alreadyExisted) return reply.code(200).send(sale);

    await writeAudit(app.prisma, {
      ...actor(req),
      branchId,
      entity: 'sale',
      entityId: sale.id,
      action: 'CREATE',
      details: { total, subtotal, discount, discountReason: body.discountReason ?? null, paymentMethod: body.paymentMethod, priceTier: body.priceTier, lines: body.items.length, ...(offline ? { recordedOffline: true } : {}) },
    });
    if (oversold.length > 0) {
      await writeAudit(app.prisma, { ...actor(req), branchId, entity: 'sale', entityId: sale.id, action: 'OVERSOLD_OFFLINE', details: { lines: oversold } });
    }
    reply.code(201).send(sale);
  });

  // Reprint a receipt. Any cashier may reprint a sale from their own branch —
  // customers lose receipts — but every copy is counted and audited, and the
  // paper is marked as a duplicate so it cannot pass as an original.
  app.post('/:id/reprint', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid sale id' });

    const sale = await app.prisma.sale.findUnique({ where: { id }, select: { id: true, branchId: true, total: true } });
    if (!sale) return reply.code(404).send({ error: 'Sale not found' });
    branchScope(req, reply, sale.branchId);

    const updated = await app.prisma.sale.update({
      where: { id },
      data: { reprintCount: { increment: 1 } },
      include: {
        items: { include: { book: true } },
        branch: true,
        user: SALE_USER,
        voidedBy: { select: { id: true, name: true } },
      },
    });

    await writeAudit(app.prisma, {
      ...actor(req),
      branchId: sale.branchId,
      entity: 'sale',
      entityId: id,
      action: 'REPRINT',
      details: { copy: updated.reprintCount, total: Number(sale.total) },
    });

    return updated;
  });

  // Reverse a sale: restores stock, keeps the record, and excludes it from revenue.
  app.post('/:id/void', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid sale id' });
    const { reason } = voidSchema.parse(req.body ?? {});

    const sale = await app.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) return reply.code(404).send({ error: 'Sale not found' });
    // Managers may only void sales made at their own branch.
    branchScope(req, reply, sale.branchId);
    if (sale.voidedAt) return reply.code(409).send({ error: 'This sale has already been voided.' });

    const voided = await app.prisma.$transaction(async (tx) => {
      // Claim the void inside the transaction. Two managers voiding at once would
      // otherwise both pass the check above and return the stock twice.
      const { count } = await tx.sale.updateMany({
        where: { id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: req.user.id, voidReason: reason },
      });
      if (count === 0) return null;
      const updated = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: { items: true, branch: true, user: SALE_USER, voidedBy: { select: { id: true, name: true } } },
      });
      for (const item of sale.items) {
        await tx.stock.upsert({
          where: { branchId_bookId: { branchId: sale.branchId, bookId: item.bookId } },
          create: { branchId: sale.branchId, bookId: item.bookId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            branchId: sale.branchId,
            bookId: item.bookId,
            delta: item.quantity,
            type: 'VOID',
            note: `Void of sale #${id}: ${reason}`,
            userId: req.user.id,
            originBranchId: sale.branchId,
          },
        });
      }
      // On a branch, tell the cloud: without this a void made on the laptop stayed
      // there, and the cloud kept the revenue and never returned the stock. The event
      // has its own id because the runner matches results by uuid and the sale's own
      // event may be in the same batch.
      if (SYNC_ROLE === 'branch') {
        const voider = await tx.user.findUnique({ where: { id: req.user.id }, select: { uuid: true } });
        await enqueueOutbox(tx, 'saleVoid', randomUUID(), {
          saleUuid: sale.uuid,
          voidedByUuid: voider?.uuid ?? null,
          reason,
          voidedAt: updated.voidedAt,
        });
      }
      await writeAudit(tx, {
        userId: req.user.id,
        branchId: sale.branchId,
        entity: 'sale',
        entityId: id,
        action: 'VOID',
        details: { reason, total: Number(sale.total), items: sale.items.length },
      });
      return updated;
    });
    if (!voided) return reply.code(409).send({ error: 'This sale has already been voided.' });

    return voided;
  });

  // Today's sales by branch (admin = all, others = own). Voided sales are excluded.
  app.get('/today-by-branch', async (req, reply) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const scoped = branchScope(req, reply, undefined);
    const branchWhere = scoped == null ? {} : { id: scoped };
    const branches = await app.prisma.branch.findMany({ where: branchWhere, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    return Promise.all(
      branches.map(async (b) => {
        const agg = await app.prisma.sale.aggregate({ where: { branchId: b.id, createdAt: { gte: startOfDay }, voidedAt: null }, _sum: { total: true }, _count: { _all: true } });
        return { branchId: b.id, name: b.name, txn: agg._count._all, net: Number(agg._sum.total ?? 0) };
      }),
    );
  });
}
