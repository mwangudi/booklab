import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';

/**
 * Sync engine (cloud master side).
 *   POST /token  (admin)  → mint a per-branch service token.
 *   POST /push   (branch) → ingest branch events (sale, stockMovement, expense) idempotently.
 *   GET  /pull   (branch) → master-data changes (branch, book, user) since a cursor.
 * Foreign keys travel as the related row's uuid and are resolved to local ids on ingest.
 */

type SyncClaims = { id: number; role: string; branchId: number | null; type?: string };

async function syncGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const c = req.user as SyncClaims;
  if (c.type !== 'branch-sync' && c.role !== 'ADMIN') return reply.code(403).send({ error: 'Forbidden: sync access only' });
}

function tokenBranchId(req: FastifyRequest): number | null {
  const c = req.user as SyncClaims;
  return c.type === 'branch-sync' ? c.branchId : null;
}

const EVENT_ENTITIES = ['sale', 'stockMovement', 'expense'] as const;
const pushSchema = z.object({
  events: z
    .array(z.object({ entity: z.enum(EVENT_ENTITIES), uuid: z.string().min(1), op: z.enum(['upsert', 'delete']).default('upsert'), data: z.record(z.any()) }))
    .min(1)
    .max(1000),
});

export async function syncRoutes(app: FastifyInstance) {
  app.post('/token', { preHandler: [authGuard, requireRole('ADMIN')] }, async (req, reply) => {
    const body = z.object({ branchId: z.number().int() }).parse(req.body);
    const branch = await app.prisma.branch.findUnique({ where: { id: body.branchId }, select: { id: true, name: true } });
    if (!branch) return reply.code(404).send({ error: 'Branch not found' });
    const token = app.jwt.sign(
      { id: -1, role: 'SYNC', branchId: branch.id, type: 'branch-sync' } as unknown as { id: number; role: string; branchId: number | null },
      { expiresIn: '3650d' },
    );
    return { branchId: branch.id, branchName: branch.name, token };
  });

  app.post('/push', { preHandler: syncGuard }, async (req) => {
    const body = pushSchema.parse(req.body);
    const allowedBranch = tokenBranchId(req);
    const results: Array<{ uuid: string; status: 'applied' | 'duplicate' | 'error'; error?: string }> = [];
    for (const ev of body.events) {
      try {
        const status = await app.prisma.$transaction((tx) => ingestEvent(tx, ev.entity, ev.uuid, ev.data, allowedBranch));
        results.push({ uuid: ev.uuid, status });
      } catch (e) {
        results.push({ uuid: ev.uuid, status: 'error', error: (e as Error).message });
      }
    }
    return {
      received: body.events.length,
      applied: results.filter((r) => r.status === 'applied').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  });

  app.get('/pull', { preHandler: syncGuard }, async (req) => {
    const { since, limit } = req.query as { since?: string; limit?: string };
    const sinceDate = since ? new Date(since) : undefined;
    const take = Math.min(Number(limit) || 500, 1000);
    const where = sinceDate ? { updatedAt: { gt: sinceDate } } : {};
    const serverTime = new Date().toISOString();
    const branchId = tokenBranchId(req);

    const [branches, books, users, stock] = await Promise.all([
      app.prisma.branch.findMany({ where, take, orderBy: { updatedAt: 'asc' } }),
      app.prisma.book.findMany({ where, take, orderBy: { updatedAt: 'asc' } }),
      app.prisma.user.findMany({ where, take, orderBy: { updatedAt: 'asc' }, include: { branch: { select: { uuid: true } } } }),
      // Stock carries no `updatedAt` — it is derived from movements — so the
      // branch gets a full snapshot of its own shelves, never another branch's.
      branchId == null
        ? Promise.resolve([])
        : app.prisma.stock.findMany({
            where: { branchId },
            orderBy: { id: 'asc' },
            include: { branch: { select: { uuid: true } }, book: { select: { uuid: true } } },
          }),
    ]);

    return {
      serverTime,
      entities: {
        branch: branches.map((b) => ({ uuid: b.uuid, name: b.name, location: b.location, createdAt: b.createdAt, updatedAt: b.updatedAt, deletedAt: b.deletedAt })),
        book: books.map((b) => ({
          uuid: b.uuid, title: b.title, author: b.author, isbn: b.isbn, sku: b.sku, category: b.category,
          unit: b.unit, vatRate: String(b.vatRate),
          unitPrice: String(b.unitPrice),
          priceWholesale: b.priceWholesale == null ? null : String(b.priceWholesale),
          priceSchool: b.priceSchool == null ? null : String(b.priceSchool),
          costPrice: String(b.costPrice),
          createdAt: b.createdAt, updatedAt: b.updatedAt, deletedAt: b.deletedAt,
        })),
        user: users.map((u) => ({ uuid: u.uuid, email: u.email, name: u.name, role: u.role, active: u.active, passwordHash: u.passwordHash, branchUuid: u.branch?.uuid ?? null, createdAt: u.createdAt, updatedAt: u.updatedAt, deletedAt: u.deletedAt })),
        stock: stock.map((s) => ({
          branchUuid: s.branch.uuid, bookUuid: s.book.uuid, quantity: s.quantity,
          price: s.price == null ? null : String(s.price),
        })),
      },
    };
  });
}

type Tx = Prisma.TransactionClient;

async function idByUuid(tx: Tx, model: 'branch' | 'user' | 'book', uuid: string | null | undefined): Promise<number | null> {
  if (!uuid) return null;
  const row = await (tx as any)[model].findUnique({ where: { uuid }, select: { id: true } });
  return row?.id ?? null;
}

function assertBranch(allowed: number | null, branchId: number) {
  if (allowed != null && allowed !== branchId) throw new Error('Event branch does not match token branch');
}

async function ingestEvent(tx: Tx, entity: (typeof EVENT_ENTITIES)[number], uuid: string, data: Record<string, any>, allowed: number | null): Promise<'applied' | 'duplicate'> {
  if (entity === 'sale') return ingestSale(tx, uuid, data, allowed);
  if (entity === 'stockMovement') return ingestMovement(tx, uuid, data, allowed);
  return ingestExpense(tx, uuid, data, allowed);
}

async function ingestSale(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<'applied' | 'duplicate'> {
  if (await tx.sale.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const branchId = await idByUuid(tx, 'branch', data.branchUuid);
  const userId = await idByUuid(tx, 'user', data.userUuid);
  if (branchId == null) throw new Error('Unknown branchUuid');
  if (userId == null) throw new Error('Unknown userUuid');
  assertBranch(allowed, branchId);

  const items: Array<{ uuid?: string; bookId: number; quantity: number; unitPrice: number; costPrice: number }> = [];
  for (const it of Array.isArray(data.items) ? data.items : []) {
    const bookId = await idByUuid(tx, 'book', it.bookUuid);
    if (bookId == null) throw new Error(`Unknown bookUuid: ${it.bookUuid}`);
    items.push({ uuid: it.uuid, bookId, quantity: it.quantity, unitPrice: it.unitPrice, costPrice: it.costPrice ?? 0 });
  }

  await tx.sale.create({
    data: {
      uuid, branchId, userId, originBranchId: branchId,
      subtotal: data.subtotal ?? data.total,
      discount: data.discount ?? 0,
      discountReason: data.discountReason ?? null,
      total: data.total,
      paymentMethod: data.paymentMethod ?? 'CASH',
      priceTier: data.priceTier ?? 'RETAIL',
      mpesaRef: data.mpesaRef ?? null,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
      items: { create: items.map((r) => ({ uuid: r.uuid, bookId: r.bookId, quantity: r.quantity, unitPrice: r.unitPrice, costPrice: r.costPrice })) },
    },
  });
  for (const r of items) {
    await tx.stock.upsert({
      where: { branchId_bookId: { branchId, bookId: r.bookId } },
      create: { branchId, bookId: r.bookId, quantity: -r.quantity },
      update: { quantity: { decrement: r.quantity } },
    });
  }
  return 'applied';
}

async function ingestMovement(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<'applied' | 'duplicate'> {
  if (await tx.stockMovement.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const branchId = await idByUuid(tx, 'branch', data.branchUuid);
  const bookId = await idByUuid(tx, 'book', data.bookUuid);
  if (branchId == null) throw new Error('Unknown branchUuid');
  if (bookId == null) throw new Error('Unknown bookUuid');
  assertBranch(allowed, branchId);

  await tx.stockMovement.create({
    data: { uuid, branchId, bookId, originBranchId: branchId, delta: data.delta, type: data.type ?? 'INTAKE', note: data.note ?? null, createdAt: data.createdAt ? new Date(data.createdAt) : undefined },
  });
  const current = await tx.stock.findUnique({ where: { branchId_bookId: { branchId, bookId } } });
  const newQty = Math.max(0, (current?.quantity ?? 0) + Number(data.delta));
  await tx.stock.upsert({
    where: { branchId_bookId: { branchId, bookId } },
    create: { branchId, bookId, quantity: newQty },
    update: { quantity: newQty },
  });
  return 'applied';
}

async function ingestExpense(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<'applied' | 'duplicate'> {
  if (await tx.expense.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const branchId = data.branchUuid ? await idByUuid(tx, 'branch', data.branchUuid) : null;
  if (branchId != null) assertBranch(allowed, branchId);
  await tx.expense.create({
    data: { uuid, branchId: branchId ?? undefined, originBranchId: branchId ?? undefined, category: data.category ?? 'MISC', description: data.description ?? null, amount: data.amount, incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined },
  });
  return 'applied';
}
