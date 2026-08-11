import type { FastifyInstance } from 'fastify';
import type { GoodsReceiptStatus } from '@prisma/client';
import { z } from 'zod';
import { authGuard, requireRole, branchScope, enforceWriteBranch } from '../middleware/authGuard.js';
import { auditRequest, diff } from '../lib/audit.js';

const supplierSchema = z.object({
  name: z.string().min(1).max(160),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  kraPin: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  openingBalance: z.number().optional(),
  openingBalanceDate: z.string().nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  active: z.boolean().default(true),
});

const receiptItemSchema = z.object({
  bookId: z.number().int(),
  description: z.string().max(190).optional(),
  unit: z.string().max(40).optional(),
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
});
const receiptSchema = z.object({
  supplierId: z.number().int(),
  branchId: z.number().int(),
  deliveryNoteNo: z.string().max(60).nullable().optional(),
  invoiceNo: z.string().max(60).nullable().optional(),
  receivedAt: z.string().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(receiptItemSchema).default([]),
});

const n = (v: unknown) => Number(v ?? 0);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export async function goodsReceiptRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  const withItems = {
    supplier: true,
    branch: { select: { id: true, name: true } },
    items: { orderBy: { sortOrder: 'asc' as const }, include: { book: { select: { sku: true, title: true, unit: true } } } },
  };

  /* --------------------------------------------------------- suppliers */

  app.get('/suppliers', async (req) => {
    const { archived } = req.query as { archived?: string };
    const scope = archived === 'only' ? { NOT: { deletedAt: null } } : archived === 'all' ? {} : { deletedAt: null };
    return app.prisma.supplier.findMany({
      where: scope,
      orderBy: { name: 'asc' },
      include: { _count: { select: { receipts: true } } },
      take: 500,
    });
  });

  app.post('/suppliers', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = supplierSchema.parse(req.body);
    const created = await app.prisma.supplier.create({
      data: {
        ...body,
        email: body.email || null,
        openingBalanceDate: body.openingBalanceDate ? new Date(body.openingBalanceDate) : null,
      },
    });
    await auditRequest(app.prisma, req, { entity: 'supplier', entityId: created.id, action: 'CREATE', details: { name: created.name } });
    return reply.code(201).send(created);
  });

  app.patch('/suppliers/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = supplierSchema.partial().parse(req.body);
    const before = await app.prisma.supplier.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Supplier not found' });
    const updated = await app.prisma.supplier.update({
      where: { id },
      data: {
        ...body,
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.openingBalanceDate !== undefined
          ? { openingBalanceDate: body.openingBalanceDate ? new Date(body.openingBalanceDate) : null }
          : {}),
      },
    });
    await auditRequest(app.prisma, req, {
      entity: 'supplier', entityId: id, action: 'UPDATE',
      details: { name: before.name, changes: diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>) },
    });
    return updated;
  });

  app.delete('/suppliers/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const s = await app.prisma.supplier.findUnique({ where: { id } });
    if (!s) return reply.code(404).send({ error: 'Supplier not found' });
    if (s.deletedAt) return reply.code(409).send({ error: 'This supplier is already archived.' });
    const archived = await app.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await auditRequest(app.prisma, req, { entity: 'supplier', entityId: id, action: 'ARCHIVE', details: { name: s.name } });
    return archived;
  });

  app.post('/suppliers/:id/restore', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const s = await app.prisma.supplier.findUnique({ where: { id } });
    if (!s) return reply.code(404).send({ error: 'Supplier not found' });
    const restored = await app.prisma.supplier.update({ where: { id }, data: { deletedAt: null, active: true } });
    await auditRequest(app.prisma, req, { entity: 'supplier', entityId: id, action: 'RESTORE', details: { name: s.name } });
    return restored;
  });

  /* ---------------------------------------------------- goods receipts */

  async function nextNumber(): Promise<string> {
    const last = await app.prisma.goodsReceipt.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    return `GRN-${String((last?.id ?? 0) + 1).padStart(4, '0')}`;
  }

  app.get('/', async (req, reply) => {
    const { status, supplierId, branchId, from, to } = req.query as {
      status?: string; supplierId?: string; branchId?: string; from?: string; to?: string;
    };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    return app.prisma.goodsReceipt.findMany({
      where: {
        deletedAt: null,
        branchId: scoped,
        ...(status ? { status: status as never } : {}),
        ...(supplierId ? { supplierId: Number(supplierId) } : {}),
        receivedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      include: { supplier: true, branch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });
  });

  app.get('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid receipt id' });
    const grn = await app.prisma.goodsReceipt.findUnique({ where: { id }, include: withItems });
    if (!grn || grn.deletedAt) return reply.code(404).send({ error: 'Goods receipt not found' });
    return grn;
  });

  app.post('/', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = receiptSchema.parse(req.body);
    const branchId = enforceWriteBranch(req, reply, body.branchId);
    const supplier = await app.prisma.supplier.findUnique({ where: { id: body.supplierId } });
    if (!supplier) return reply.code(400).send({ error: 'Choose a valid supplier.' });

    const books = await app.prisma.book.findMany({
      where: { id: { in: body.items.map((i) => i.bookId) } },
      select: { id: true, title: true, unit: true },
    });
    const bookById = new Map(books.map((b) => [b.id, b]));

    const lines = body.items.map((it, i) => ({
      bookId: it.bookId,
      description: it.description || bookById.get(it.bookId)?.title || `Item ${it.bookId}`,
      unit: it.unit || bookById.get(it.bookId)?.unit || 'Piece',
      quantity: it.quantity,
      unitCost: it.unitCost,
      total: round2(it.quantity * it.unitCost),
      sortOrder: i,
    }));

    const created = await app.prisma.goodsReceipt.create({
      data: {
        number: await nextNumber(),
        supplierId: body.supplierId,
        branchId,
        deliveryNoteNo: body.deliveryNoteNo ?? null,
        invoiceNo: body.invoiceNo ?? null,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
        notes: body.notes ?? null,
        totalCost: round2(lines.reduce((s, l) => s + l.total, 0)),
        createdById: req.user.id,
        items: { create: lines },
      },
      include: withItems,
    });
    await auditRequest(app.prisma, req, {
      entity: 'goods.receipt', entityId: created.id, branchId, action: 'CREATE',
      details: { number: created.number, supplier: supplier.name, deliveryNote: body.deliveryNoteNo, lines: lines.length },
    });
    return reply.code(201).send(created);
  });

  app.patch('/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = receiptSchema.partial().parse(req.body);
    const before = await app.prisma.goodsReceipt.findUnique({ where: { id } });
    if (!before || before.deletedAt) return reply.code(404).send({ error: 'Goods receipt not found' });
    if (before.status === 'POSTED') return reply.code(409).send({ error: 'A posted goods receipt can no longer be edited.' });

    let totalCost: number | undefined;
    if (body.items) {
      const books = await app.prisma.book.findMany({
        where: { id: { in: body.items.map((i) => i.bookId) } },
        select: { id: true, title: true, unit: true },
      });
      const bookById = new Map(books.map((b) => [b.id, b]));
      const lines = body.items.map((it, i) => ({
        receiptId: id,
        bookId: it.bookId,
        description: it.description || bookById.get(it.bookId)?.title || `Item ${it.bookId}`,
        unit: it.unit || bookById.get(it.bookId)?.unit || 'Piece',
        quantity: it.quantity,
        unitCost: it.unitCost,
        total: round2(it.quantity * it.unitCost),
        sortOrder: i,
      }));
      totalCost = round2(lines.reduce((s, l) => s + l.total, 0));
      await app.prisma.$transaction([
        app.prisma.goodsReceiptItem.deleteMany({ where: { receiptId: id } }),
        ...(lines.length ? [app.prisma.goodsReceiptItem.createMany({ data: lines })] : []),
      ]);
    }

    const updated = await app.prisma.goodsReceipt.update({
      where: { id },
      data: {
        ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
        ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
        ...(body.deliveryNoteNo !== undefined ? { deliveryNoteNo: body.deliveryNoteNo } : {}),
        ...(body.invoiceNo !== undefined ? { invoiceNo: body.invoiceNo } : {}),
        ...(body.receivedAt !== undefined ? { receivedAt: new Date(body.receivedAt) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(totalCost !== undefined ? { totalCost } : {}),
      },
      include: withItems,
    });
    await auditRequest(app.prisma, req, {
      entity: 'goods.receipt', entityId: id, branchId: updated.branchId, action: 'UPDATE',
      details: { number: updated.number, totalCost: n(updated.totalCost) },
    });
    return updated;
  });

  /** Post the receipt: stock goes up and each line becomes an intake movement. */
  app.post('/:id/post', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { updateCost } = z.object({ updateCost: z.boolean().default(true) }).parse(req.body ?? {});

    const grn = await app.prisma.goodsReceipt.findUnique({ where: { id }, include: { items: true, supplier: true } });
    if (!grn || grn.deletedAt) return reply.code(404).send({ error: 'Goods receipt not found' });
    if (grn.status === 'POSTED') return reply.code(409).send({ error: 'This goods receipt has already been posted.' });
    if (grn.items.length === 0) return reply.code(400).send({ error: 'Add at least one item before posting.' });

    const posted = await app.prisma.$transaction(async (tx) => {
      for (const it of grn.items) {
        await tx.stock.upsert({
          where: { branchId_bookId: { branchId: grn.branchId, bookId: it.bookId } },
          create: { branchId: grn.branchId, bookId: it.bookId, quantity: it.quantity },
          update: { quantity: { increment: it.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            branchId: grn.branchId,
            bookId: it.bookId,
            delta: it.quantity,
            type: 'INTAKE',
            note: `${grn.number}${grn.deliveryNoteNo ? ` · DN ${grn.deliveryNoteNo}` : ''} · ${grn.supplier.name}`,
            userId: req.user.id,
            originBranchId: grn.branchId,
          },
        });
        // Keep costing current so margins reflect the latest buying price.
        if (updateCost && n(it.unitCost) > 0) {
          await tx.book.update({ where: { id: it.bookId }, data: { costPrice: it.unitCost } });
        }
      }
      return tx.goodsReceipt.update({
        where: { id },
        data: { status: 'POSTED', postedAt: new Date(), postedById: req.user.id },
        include: withItems,
      });
    });

    await auditRequest(app.prisma, req, {
      entity: 'goods.receipt', entityId: id, branchId: grn.branchId, action: 'POST',
      details: {
        number: grn.number,
        supplier: grn.supplier.name,
        units: grn.items.reduce((s, i) => s + i.quantity, 0),
        totalCost: n(grn.totalCost),
        costPricesUpdated: updateCost,
      },
    });
    return posted;
  });

  app.delete('/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const grn = await app.prisma.goodsReceipt.findUnique({ where: { id } });
    if (!grn || grn.deletedAt) return reply.code(404).send({ error: 'Goods receipt not found' });
    if (grn.status === 'POSTED') return reply.code(409).send({ error: 'A posted goods receipt cannot be deleted.' });
    await app.prisma.goodsReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditRequest(app.prisma, req, {
      entity: 'goods.receipt', entityId: id, branchId: grn.branchId, action: 'DELETE_DRAFT', details: { number: grn.number },
    });
    return { ok: true };
  });

  /* ------------------------------------------------- supplier payments */

  const payoutSchema = z.object({
    supplierId: z.number().int(),
    receiptId: z.number().int().nullable().optional(),
    amount: z.number().positive(),
    paidAt: z.string().optional(),
    method: z.enum(['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CARD']).default('BANK_TRANSFER'),
    reference: z.string().max(60).nullable().optional(),
    note: z.string().max(190).nullable().optional(),
  });

  app.get('/payments', async (req) => {
    const { supplierId, from, to } = req.query as { supplierId?: string; from?: string; to?: string };
    return app.prisma.supplierPayment.findMany({
      where: {
        deletedAt: null,
        supplierId: supplierId ? Number(supplierId) : undefined,
        paidAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      include: { supplier: { select: { name: true } }, receipt: { select: { number: true } } },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });
  });

  app.post('/payments', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = payoutSchema.parse(req.body);
    const supplier = await app.prisma.supplier.findUnique({ where: { id: body.supplierId } });
    if (!supplier) return reply.code(400).send({ error: 'Choose a valid supplier.' });

    const created = await app.prisma.supplierPayment.create({
      data: {
        supplierId: body.supplierId,
        receiptId: body.receiptId ?? null,
        amount: body.amount,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        method: body.method,
        reference: body.reference ?? null,
        note: body.note ?? null,
        createdById: req.user.id,
      },
    });
    await auditRequest(app.prisma, req, {
      entity: 'supplier.payment', entityId: created.id, action: 'CREATE',
      details: { supplier: supplier.name, amount: body.amount, method: body.method, reference: body.reference ?? null },
    });
    return reply.code(201).send(created);
  });

  app.delete('/payments/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const pay = await app.prisma.supplierPayment.findUnique({ where: { id } });
    if (!pay || pay.deletedAt) return reply.code(404).send({ error: 'Payment not found' });
    await app.prisma.supplierPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditRequest(app.prisma, req, {
      entity: 'supplier.payment', entityId: id, action: 'REVERSE', details: { amount: n(pay.amount) },
    });
    return { ok: true };
  });

  /* ------------------------------------------------ supplier statement */

  /**
   * What we owe a supplier over a period — the mirror of a customer statement,
   * so it can be reconciled line by line against the statement they send us.
   * Only posted receipts are debts; drafts have not been accepted yet.
   */
  app.get('/suppliers/:id/statement', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid supplier id' });
    const { from, to } = req.query as { from?: string; to?: string };

    const supplier = await app.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return reply.code(404).send({ error: 'Supplier not found' });

    const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const end = to ? new Date(to) : new Date();
    const posted: GoodsReceiptStatus[] = ['POSTED'];
    const billable = { supplierId: id, deletedAt: null, status: { in: posted } };

    const [before, paidBefore, receipts, payments] = await Promise.all([
      app.prisma.goodsReceipt.findMany({ where: { ...billable, receivedAt: { lt: start } }, select: { totalCost: true } }),
      app.prisma.supplierPayment.findMany({ where: { supplierId: id, deletedAt: null, paidAt: { lt: start } }, select: { amount: true } }),
      app.prisma.goodsReceipt.findMany({
        where: { ...billable, receivedAt: { gte: start, lte: end } },
        select: { id: true, number: true, invoiceNo: true, deliveryNoteNo: true, receivedAt: true, totalCost: true },
        orderBy: { receivedAt: 'asc' },
      }),
      app.prisma.supplierPayment.findMany({
        where: { supplierId: id, deletedAt: null, paidAt: { gte: start, lte: end } },
        select: { id: true, amount: true, paidAt: true, method: true, reference: true, receipt: { select: { number: true } } },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    const openingBalance = round2(
      n(supplier.openingBalance) +
        before.reduce((s, r) => s + n(r.totalCost), 0) -
        paidBefore.reduce((s, p) => s + n(p.amount), 0),
    );

    type Row = { date: Date; kind: 'BILL' | 'PAYMENT'; label: string; amount: number; balance: number };
    const rows: Row[] = [
      ...receipts.map((r) => ({
        date: r.receivedAt,
        kind: 'BILL' as const,
        label: `INV #${r.invoiceNo ?? r.number}`,
        amount: n(r.totalCost),
        balance: 0,
      })),
      ...payments.map((p) => ({
        date: p.paidAt,
        kind: 'PAYMENT' as const,
        label: `PMT${p.reference ? ` #${p.reference}` : ''}${p.receipt ? ` (${p.receipt.number})` : ''}`,
        amount: -n(p.amount),
        balance: 0,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = openingBalance;
    for (const r of rows) {
      running = round2(running + r.amount);
      r.balance = running;
    }

    // Age the outstanding balance by how long each receipt has been due.
    const allPosted = await app.prisma.goodsReceipt.findMany({
      where: billable,
      select: { id: true, receivedAt: true, totalCost: true, payments: { where: { deletedAt: null }, select: { amount: true } } },
    });
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
    const now = new Date();
    for (const r of allPosted) {
      const outstanding = round2(n(r.totalCost) - r.payments.reduce((s, p) => s + n(p.amount), 0));
      if (outstanding <= 0) continue;
      const due = new Date(r.receivedAt.getTime() + supplier.paymentTermsDays * 864e5);
      const overdue = Math.floor((now.getTime() - due.getTime()) / 864e5);
      if (overdue <= 0) buckets.current += outstanding;
      else if (overdue <= 30) buckets.d1_30 += outstanding;
      else if (overdue <= 60) buckets.d31_60 += outstanding;
      else if (overdue <= 90) buckets.d61_90 += outstanding;
      else buckets.over90 += outstanding;
    }

    return {
      supplier,
      period: { from: start.toISOString(), to: end.toISOString() },
      openingBalance,
      closingBalance: running,
      amountDue: round2(Object.values(buckets).reduce((s, v) => s + v, 0)),
      ageing: {
        current: round2(buckets.current),
        d1_30: round2(buckets.d1_30),
        d31_60: round2(buckets.d31_60),
        d61_90: round2(buckets.d61_90),
        over90: round2(buckets.over90),
      },
      rows: rows.map((r) => ({ date: r.date.toISOString(), kind: r.kind, label: r.label, amount: r.amount, balance: r.balance })),
      totals: {
        billed: round2(receipts.reduce((s, r) => s + n(r.totalCost), 0)),
        paid: round2(payments.reduce((s, p) => s + n(p.amount), 0)),
      },
    };
  });

  /** Every supplier with what we owe them — the payables list. */
  app.get('/suppliers/balances', async () => {
    const suppliers = await app.prisma.supplier.findMany({
      where: { deletedAt: null },
      include: {
        receipts: { where: { deletedAt: null, status: 'POSTED' }, select: { totalCost: true } },
        payments: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: { name: 'asc' },
    });
    return suppliers.map((s) => {
      const billed = s.receipts.reduce((a, r) => a + n(r.totalCost), 0);
      const paid = s.payments.reduce((a, p) => a + n(p.amount), 0);
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        contactPerson: s.contactPerson,
        receipts: s.receipts.length,
        billed: round2(billed),
        paid: round2(paid),
        balance: round2(n(s.openingBalance) + billed - paid),
      };
    });
  });
}
