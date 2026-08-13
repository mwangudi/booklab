import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { auditRequest } from '../lib/audit.js';

/**
 * Sync engine (cloud master side).
 *   POST /token  (admin)  → mint a per-branch service token.
 *   POST /push   (branch) → ingest branch events (sale, stockMovement, expense) idempotently.
 *   GET  /pull   (branch) → master-data changes (branch, book, user) since a cursor.
 * Foreign keys travel as the related row's uuid and are resolved to local ids on ingest.
 */

type SyncClaims = { id: number; role: string; branchId: number | null; type?: string; jti?: string };

/**
 * A branch token is long-lived, so possession alone is not enough: the `jti` it
 * carries must still be an active `SyncToken`. That is what makes a lost laptop
 * revocable without rotating the server secret.
 */
async function syncGuard(this: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const c = req.user as SyncClaims;
  if (c.type !== 'branch-sync' && c.role !== 'ADMIN') return reply.code(403).send({ error: 'Forbidden: sync access only' });
  if (c.type !== 'branch-sync') return;

  if (!c.jti) return reply.code(403).send({ error: 'This sync token predates revocation support. Issue a new one.' });
  const record = await this.prisma.syncToken.findUnique({ where: { jti: c.jti }, select: { id: true, active: true, branchId: true } });
  if (!record || !record.active) return reply.code(403).send({ error: 'This sync token has been revoked.' });
  if (record.branchId !== c.branchId) return reply.code(403).send({ error: 'Sync token does not match its branch.' });
  await this.prisma.syncToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
}

function tokenBranchId(req: FastifyRequest): number | null {
  const c = req.user as SyncClaims;
  return c.type === 'branch-sync' ? c.branchId : null;
}

const EVENT_ENTITIES = ['sale', 'stockMovement', 'expense', 'invoice', 'goodsReceipt', 'customerPayment', 'supplierPayment', 'auditLog'] as const;
const pushSchema = z.object({
  events: z
    .array(z.object({ entity: z.enum(EVENT_ENTITIES), uuid: z.string().min(1), op: z.enum(['upsert', 'delete']).default('upsert'), data: z.record(z.any()) }))
    .min(1)
    .max(1000),
});

type IngestResult = 'applied' | 'updated' | 'duplicate';

export async function syncRoutes(app: FastifyInstance) {
  const guard = syncGuard.bind(app);

  app.post('/token', { preHandler: [authGuard, requireRole('ADMIN')] }, async (req, reply) => {
    const body = z.object({ branchId: z.number().int(), label: z.string().trim().min(1).max(80).default('Branch laptop') }).parse(req.body);
    const branch = await app.prisma.branch.findUnique({ where: { id: body.branchId }, select: { id: true, name: true } });
    if (!branch) return reply.code(404).send({ error: 'Branch not found' });

    const jti = randomUUID();
    const record = await app.prisma.syncToken.create({
      data: { jti, branchId: branch.id, label: body.label, createdById: req.user.id },
    });
    const token = app.jwt.sign(
      { id: -1, role: 'SYNC', branchId: branch.id, type: 'branch-sync' } as unknown as { id: number; role: string; branchId: number | null },
      { expiresIn: '3650d', jti },
    );
    await auditRequest(app.prisma, req, {
      entity: 'syncToken', entityId: record.id, branchId: branch.id, action: 'ISSUE',
      details: { branch: branch.name, label: body.label },
    });
    return { id: record.id, branchId: branch.id, branchName: branch.name, label: record.label, token };
  });

  app.get('/tokens', { preHandler: [authGuard, requireRole('ADMIN')] }, async () =>
    app.prisma.syncToken.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { branch: { select: { name: true, code: true } } },
    }),
  );

  app.post('/tokens/:id/revoke', { preHandler: [authGuard, requireRole('ADMIN')] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const before = await app.prisma.syncToken.findUnique({ where: { id }, include: { branch: { select: { name: true } } } });
    if (!before) return reply.code(404).send({ error: 'Sync token not found' });
    if (!before.active) return reply.code(409).send({ error: 'That token is already revoked.' });
    const updated = await app.prisma.syncToken.update({
      where: { id },
      data: { active: false, revokedAt: new Date(), revokedById: req.user.id },
    });
    await auditRequest(app.prisma, req, {
      entity: 'syncToken', entityId: id, branchId: before.branchId, action: 'REVOKE',
      details: { branch: before.branch.name, label: before.label },
    });
    return updated;
  });

  app.post('/push', { preHandler: guard }, async (req) => {
    const body = pushSchema.parse(req.body);
    const allowedBranch = tokenBranchId(req);
    const results: Array<{ uuid: string; status: IngestResult | 'error'; error?: string }> = [];
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
      updated: results.filter((r) => r.status === 'updated').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  });

  app.get('/pull', { preHandler: guard }, async (req) => {
    const { since, limit } = req.query as { since?: string; limit?: string };
    const sinceDate = since ? new Date(since) : undefined;
    const take = Math.min(Number(limit) || 500, 1000);
    const where = sinceDate ? { updatedAt: { gt: sinceDate } } : {};
    const serverTime = new Date().toISOString();
    const branchId = tokenBranchId(req);

    const [branches, books, users, stock, customers, suppliers] = await Promise.all([
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
      app.prisma.customer.findMany({ where, take, orderBy: { updatedAt: 'asc' } }),
      app.prisma.supplier.findMany({ where, take, orderBy: { updatedAt: 'asc' } }),
    ]);

    return {
      serverTime,
      entities: {
        branch: branches.map((b) => ({ uuid: b.uuid, name: b.name, code: b.code, location: b.location, createdAt: b.createdAt, updatedAt: b.updatedAt, deletedAt: b.deletedAt })),
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
        customer: customers.map((c) => ({
          uuid: c.uuid, name: c.name, type: c.type, contactPerson: c.contactPerson, phone: c.phone, email: c.email,
          address: c.address, kraPin: c.kraPin, paymentTermsDays: c.paymentTermsDays, openingBalance: String(c.openingBalance),
          chargeVat: c.chargeVat, vatMode: c.vatMode,
          createdAt: c.createdAt, updatedAt: c.updatedAt, deletedAt: c.deletedAt,
        })),
        supplier: suppliers.map((s) => ({
          uuid: s.uuid, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email,
          address: s.address, kraPin: s.kraPin, paymentTermsDays: s.paymentTermsDays, openingBalance: String(s.openingBalance),
          createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt,
        })),
      },
    };
  });
}

type Tx = Prisma.TransactionClient;

async function idByUuid(tx: Tx, model: 'branch' | 'user' | 'book' | 'customer' | 'supplier', uuid: string | null | undefined): Promise<number | null> {
  if (!uuid) return null;
  const row = await (tx as any)[model].findUnique({ where: { uuid }, select: { id: true } });
  return row?.id ?? null;
}

function assertBranch(allowed: number | null, branchId: number) {
  if (allowed != null && allowed !== branchId) throw new Error('Event branch does not match token branch');
}

async function ingestEvent(tx: Tx, entity: (typeof EVENT_ENTITIES)[number], uuid: string, data: Record<string, any>, allowed: number | null): Promise<IngestResult> {
  if (entity === 'sale') return ingestSale(tx, uuid, data, allowed);
  if (entity === 'stockMovement') return ingestMovement(tx, uuid, data, allowed);
  if (entity === 'invoice') return ingestInvoice(tx, uuid, data, allowed);
  if (entity === 'goodsReceipt') return ingestGoodsReceipt(tx, uuid, data, allowed);
  if (entity === 'customerPayment') return ingestCustomerPayment(tx, uuid, data);
  if (entity === 'supplierPayment') return ingestSupplierPayment(tx, uuid, data);
  if (entity === 'auditLog') return ingestAuditLog(tx, uuid, data);
  return ingestExpense(tx, uuid, data, allowed);
}

async function ingestSale(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<IngestResult> {
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

async function ingestMovement(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<IngestResult> {
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

async function ingestExpense(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<IngestResult> {
  if (await tx.expense.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const branchId = data.branchUuid ? await idByUuid(tx, 'branch', data.branchUuid) : null;
  if (branchId != null) assertBranch(allowed, branchId);
  await tx.expense.create({
    data: { uuid, branchId: branchId ?? undefined, originBranchId: branchId ?? undefined, category: data.category ?? 'MISC', description: data.description ?? null, amount: data.amount, incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined },
  });
  return 'applied';
}

/**
 * Documents differ from sales: a draft is edited before it is issued, so the same
 * uuid legitimately arrives more than once and the branch that raised it is the
 * authority. They are upserted, and lines are replaced wholesale.
 *
 * Stock is deliberately NOT touched here. Posting a receipt or delivering an
 * invoice writes its own StockMovement and Sale events, which travel separately —
 * applying stock here as well would count the goods twice.
 */
async function ingestInvoice(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<IngestResult> {
  const branchId = data.branchUuid ? await idByUuid(tx, 'branch', data.branchUuid) : null;
  if (branchId != null) assertBranch(allowed, branchId);
  const customerId = await idByUuid(tx, 'customer', data.customerUuid);
  if (customerId == null) throw new Error('Unknown customerUuid');
  const saleId = data.saleUuid ? (await tx.sale.findUnique({ where: { uuid: data.saleUuid }, select: { id: true } }))?.id ?? null : null;

  const fields = {
    number: data.number,
    deliveryNoteNo: data.deliveryNoteNo ?? null,
    customerId,
    branchId,
    status: data.status ?? 'DRAFT',
    priceTier: data.priceTier ?? 'SCHOOL',
    issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : null,
    receivedBy: data.receivedBy ?? null,
    receivedIdNo: data.receivedIdNo ?? null,
    receivedDesignation: data.receivedDesignation ?? null,
    notes: data.notes ?? null,
    chargeVat: data.chargeVat ?? true,
    vatMode: data.vatMode ?? 'EXCLUSIVE',
    subtotal: data.subtotal ?? 0,
    vatTotal: data.vatTotal ?? 0,
    total: data.total ?? 0,
    saleId,
    deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
  };

  const existing = await tx.invoice.findUnique({ where: { uuid }, select: { id: true } });
  const inv = existing
    ? await tx.invoice.update({ where: { id: existing.id }, data: fields })
    : await tx.invoice.create({ data: { uuid, ...fields, createdAt: data.createdAt ? new Date(data.createdAt) : undefined } });

  await tx.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
  for (const [i, it] of (Array.isArray(data.items) ? data.items : []).entries()) {
    const bookId = it.bookUuid ? await idByUuid(tx, 'book', it.bookUuid) : null;
    await tx.invoiceItem.create({
      data: {
        uuid: it.uuid, invoiceId: inv.id, bookId, description: it.description, unit: it.unit ?? 'Piece',
        quantity: it.quantity, unitPrice: it.unitPrice, vatRate: it.vatRate ?? 0,
        netAmount: it.netAmount ?? 0, vatAmount: it.vatAmount ?? 0, total: it.total ?? 0,
        sortOrder: it.sortOrder ?? i,
      },
    });
  }
  return existing ? 'updated' : 'applied';
}

async function ingestGoodsReceipt(tx: Tx, uuid: string, data: Record<string, any>, allowed: number | null): Promise<IngestResult> {
  const branchId = await idByUuid(tx, 'branch', data.branchUuid);
  if (branchId == null) throw new Error('Unknown branchUuid');
  assertBranch(allowed, branchId);
  const supplierId = await idByUuid(tx, 'supplier', data.supplierUuid);
  if (supplierId == null) throw new Error('Unknown supplierUuid');

  const fields = {
    number: data.number,
    supplierId,
    branchId,
    deliveryNoteNo: data.deliveryNoteNo ?? null,
    invoiceNo: data.invoiceNo ?? null,
    receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
    status: data.status ?? 'DRAFT',
    notes: data.notes ?? null,
    totalCost: data.totalCost ?? 0,
    postedAt: data.postedAt ? new Date(data.postedAt) : null,
    deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
  };

  const existing = await tx.goodsReceipt.findUnique({ where: { uuid }, select: { id: true } });
  const grn = existing
    ? await tx.goodsReceipt.update({ where: { id: existing.id }, data: fields })
    : await tx.goodsReceipt.create({ data: { uuid, ...fields, createdAt: data.createdAt ? new Date(data.createdAt) : undefined } });

  await tx.goodsReceiptItem.deleteMany({ where: { receiptId: grn.id } });
  for (const [i, it] of (Array.isArray(data.items) ? data.items : []).entries()) {
    const bookId = await idByUuid(tx, 'book', it.bookUuid);
    if (bookId == null) throw new Error(`Unknown bookUuid: ${it.bookUuid}`);
    await tx.goodsReceiptItem.create({
      data: {
        uuid: it.uuid, receiptId: grn.id, bookId, description: it.description, unit: it.unit ?? 'Piece',
        quantity: it.quantity, unitCost: it.unitCost ?? 0, total: it.total ?? 0, sortOrder: it.sortOrder ?? i,
      },
    });
  }
  return existing ? 'updated' : 'applied';
}

async function ingestCustomerPayment(tx: Tx, uuid: string, data: Record<string, any>): Promise<IngestResult> {
  if (await tx.customerPayment.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const customerId = await idByUuid(tx, 'customer', data.customerUuid);
  if (customerId == null) throw new Error('Unknown customerUuid');
  const invoiceId = data.invoiceUuid ? (await tx.invoice.findUnique({ where: { uuid: data.invoiceUuid }, select: { id: true } }))?.id ?? null : null;
  await tx.customerPayment.create({
    data: {
      uuid, customerId, invoiceId, amount: data.amount, method: data.method ?? 'BANK_TRANSFER',
      reference: data.reference ?? null, note: data.note ?? null,
      paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
    },
  });
  return 'applied';
}

async function ingestSupplierPayment(tx: Tx, uuid: string, data: Record<string, any>): Promise<IngestResult> {
  if (await tx.supplierPayment.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const supplierId = await idByUuid(tx, 'supplier', data.supplierUuid);
  if (supplierId == null) throw new Error('Unknown supplierUuid');
  const receiptId = data.receiptUuid ? (await tx.goodsReceipt.findUnique({ where: { uuid: data.receiptUuid }, select: { id: true } }))?.id ?? null : null;
  await tx.supplierPayment.create({
    data: {
      uuid, supplierId, receiptId, amount: data.amount, method: data.method ?? 'BANK_TRANSFER',
      reference: data.reference ?? null, note: data.note ?? null,
      paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
    },
  });
  return 'applied';
}

/**
 * The trail is append-only, so an audit entry is written once and any repeat is
 * a duplicate. `entityId` is left as the branch recorded it: local ids differ
 * from the cloud's, and rewriting them would be a guess.
 */
async function ingestAuditLog(tx: Tx, uuid: string, data: Record<string, any>): Promise<IngestResult> {
  if (await tx.auditLog.findUnique({ where: { uuid }, select: { id: true } })) return 'duplicate';
  const [userId, branchId] = await Promise.all([
    idByUuid(tx, 'user', data.userUuid),
    idByUuid(tx, 'branch', data.branchUuid),
  ]);
  await tx.auditLog.create({
    data: {
      uuid, userId, branchId,
      entity: data.entity,
      entityId: data.entityId ?? null,
      action: data.action,
      details: data.details ?? null,
      ip: data.ip ?? null,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });
  return 'applied';
}
