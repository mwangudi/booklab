import type { FastifyInstance } from 'fastify';
import type { InvoiceStatus } from '@prisma/client';
import { z } from 'zod';
import { authGuard, requireRole, branchScope } from '../middleware/authGuard.js';
import { auditRequest, diff } from '../lib/audit.js';
import { SYNC_ROLE, enqueueOutbox, recordMovement } from '../lib/outbox.js';
import { HEAD_OFFICE_CODE, nextInSeries, seriesStem } from '../lib/docNumber.js';

const customerSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(['SCHOOL', 'INSTITUTION', 'BUSINESS', 'INDIVIDUAL']).default('SCHOOL'),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  kraPin: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  chargeVat: z.boolean().optional(),
  vatMode: z.enum(['EXCLUSIVE', 'INCLUSIVE']).optional(),
  openingBalance: z.number().optional(),
  openingBalanceDate: z.string().nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  active: z.boolean().default(true),
});
const customerUpdateSchema = customerSchema.partial();

const itemSchema = z.object({
  bookId: z.number().int().nullable().optional(),
  description: z.string().min(1).max(190),
  unit: z.string().min(1).max(40).default('Piece'),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  vatRate: z.number().min(0).max(100).default(16),
});
const invoiceSchema = z.object({
  customerId: z.number().int(),
  branchId: z.number().int().nullable().optional(),
  priceTier: z.enum(['RETAIL', 'WHOLESALE', 'SCHOOL']).default('SCHOOL'),
  chargeVat: z.boolean().optional(),
  vatMode: z.enum(['EXCLUSIVE', 'INCLUSIVE']).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  deliveryNoteNo: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  receivedBy: z.string().max(120).nullable().optional(),
  receivedIdNo: z.string().max(60).nullable().optional(),
  receivedDesignation: z.string().max(120).nullable().optional(),
  items: z.array(itemSchema).default([]),
});
const invoiceUpdateSchema = invoiceSchema.partial();

const n = (v: unknown) => Number(v ?? 0);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

type LineInput = { bookId?: number | null; description: string; unit: string; quantity: number; unitPrice: number; vatRate: number };

/**
 * Split each line into net, VAT and gross. With EXCLUSIVE pricing the captured
 * price is net and VAT is added; with INCLUSIVE it already contains VAT.
 * When the customer is not charged VAT every line is zero-rated.
 */
function priceLines(items: LineInput[], vatMode: 'EXCLUSIVE' | 'INCLUSIVE', chargeVat: boolean) {
  const lines = items.map((it, i) => {
    const rate = chargeVat ? (it.vatRate ?? 16) : 0;
    const raw = round2(it.quantity * it.unitPrice);
    const net = rate > 0 && vatMode === 'INCLUSIVE' ? round2(raw / (1 + rate / 100)) : raw;
    const vat = rate === 0 ? 0 : vatMode === 'INCLUSIVE' ? round2(raw - net) : round2(net * (rate / 100));
    return {
      bookId: it.bookId ?? null,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      vatRate: rate,
      netAmount: net,
      vatAmount: vat,
      total: round2(net + vat),
      sortOrder: i,
    };
  });
  return {
    lines,
    subtotal: round2(lines.reduce((s, l) => s + l.netAmount, 0)),
    vatTotal: round2(lines.reduce((s, l) => s + l.vatAmount, 0)),
    total: round2(lines.reduce((s, l) => s + l.total, 0)),
  };
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  /** Next document number for the branch raising it, e.g. INV-KAP-0007. */
  async function branchCode(branchId: number | null): Promise<string> {
    if (branchId == null) return HEAD_OFFICE_CODE;
    const b = await app.prisma.branch.findUnique({ where: { id: branchId }, select: { code: true } });
    return b?.code ?? HEAD_OFFICE_CODE;
  }

  async function nextNumber(prefix: 'INV' | 'DN', branchId: number | null): Promise<string> {
    const code = await branchCode(branchId);
    const stem = seriesStem(prefix, code);
    if (prefix === 'INV') {
      const rows = await app.prisma.invoice.findMany({ where: { number: { startsWith: stem } }, select: { number: true } });
      return nextInSeries(prefix, code, rows.map((r) => r.number));
    }
    const rows = await app.prisma.invoice.findMany({ where: { deliveryNoteNo: { startsWith: stem } }, select: { deliveryNoteNo: true } });
    return nextInSeries(prefix, code, rows.map((r) => r.deliveryNoteNo));
  }

  const withItems = {
    customer: true,
    branch: { select: { id: true, name: true, location: true } },
    items: { orderBy: { sortOrder: 'asc' as const } },
  };

  /* --------------------------------------------------------- customers */

  app.get('/customers', async (req) => {
    const { q, archived } = req.query as { q?: string; archived?: string };
    const scope = archived === 'only' ? { NOT: { deletedAt: null } } : archived === 'all' ? {} : { deletedAt: null };
    return app.prisma.customer.findMany({
      where: { ...scope, ...(q ? { name: { contains: q } } : {}) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { invoices: true } } },
      take: 500,
    });
  });

  app.post('/customers', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = customerSchema.parse(req.body);
    const created = await app.prisma.customer.create({
      data: {
        ...body,
        email: body.email || null,
        openingBalanceDate: body.openingBalanceDate ? new Date(body.openingBalanceDate) : null,
      },
    });
    await auditRequest(app.prisma, req, {
      entity: 'customer', entityId: created.id, action: 'CREATE', details: { name: created.name, type: created.type },
    });
    return reply.code(201).send(created);
  });

  app.patch('/customers/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid customer id' });
    const body = customerUpdateSchema.parse(req.body);
    const before = await app.prisma.customer.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Customer not found' });
    const updated = await app.prisma.customer.update({
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
      entity: 'customer', entityId: id, action: 'UPDATE',
      details: { name: before.name, changes: diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>) },
    });
    return updated;
  });

  app.delete('/customers/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const cust = await app.prisma.customer.findUnique({ where: { id } });
    if (!cust) return reply.code(404).send({ error: 'Customer not found' });
    if (cust.deletedAt) return reply.code(409).send({ error: 'This customer is already archived.' });
    const archived = await app.prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await auditRequest(app.prisma, req, { entity: 'customer', entityId: id, action: 'ARCHIVE', details: { name: cust.name } });
    return archived;
  });

  app.post('/customers/:id/restore', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const cust = await app.prisma.customer.findUnique({ where: { id } });
    if (!cust) return reply.code(404).send({ error: 'Customer not found' });
    if (!cust.deletedAt) return reply.code(409).send({ error: 'This customer is not archived.' });
    const restored = await app.prisma.customer.update({ where: { id }, data: { deletedAt: null, active: true } });
    await auditRequest(app.prisma, req, { entity: 'customer', entityId: id, action: 'RESTORE', details: { name: cust.name } });
    return restored;
  });

  /* ---------------------------------------------------------- invoices */

  app.get('/', async (req, reply) => {
    const { status, customerId, from, to, branchId } = req.query as {
      status?: string; customerId?: string; from?: string; to?: string; branchId?: string;
    };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    return app.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        ...(scoped == null ? {} : { OR: [{ branchId: scoped }, { branchId: null }] }),
        ...(status ? { status: status as never } : {}),
        ...(customerId ? { customerId: Number(customerId) } : {}),
        issueDate: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      include: { customer: true, branch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { issueDate: 'desc' },
      take: 500,
    });
  });

  app.get('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid invoice id' });
    const inv = await app.prisma.invoice.findUnique({ where: { id }, include: withItems });
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: 'Invoice not found' });
    return inv;
  });

  app.post('/', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = invoiceSchema.parse(req.body);
    const customer = await app.prisma.customer.findUnique({ where: { id: body.customerId } });
    if (!customer) return reply.code(400).send({ error: 'Choose a valid customer.' });

    // VAT settings default to the customer's, but the invoice can override them.
    const chargeVat = body.chargeVat ?? customer.chargeVat;
    const vatMode = body.vatMode ?? customer.vatMode;
    const priced = priceLines(body.items, vatMode, chargeVat);
    const branchId = body.branchId ?? req.user.branchId ?? null;

    const created = await app.prisma.invoice.create({
      data: {
        number: await nextNumber('INV', branchId),
        customerId: body.customerId,
        branchId,
        priceTier: body.priceTier,
        chargeVat,
        vatMode,
        issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        deliveryNoteNo: body.deliveryNoteNo ?? null,
        notes: body.notes ?? null,
        subtotal: priced.subtotal,
        vatTotal: priced.vatTotal,
        total: priced.total,
        createdById: req.user.id,
        items: { create: priced.lines },
      },
      include: withItems,
    });
    await auditRequest(app.prisma, req, {
      entity: 'invoice', entityId: created.id, branchId: created.branchId, action: 'CREATE',
      details: { number: created.number, customer: customer.name, total: priced.total, vat: priced.vatTotal, lines: priced.lines.length },
    });
    return reply.code(201).send(created);
  });

  app.patch('/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid invoice id' });
    const body = invoiceUpdateSchema.parse(req.body);
    const before = await app.prisma.invoice.findUnique({ where: { id } });
    if (!before || before.deletedAt) return reply.code(404).send({ error: 'Invoice not found' });
    // Once goods are booked out the document is a financial record.
    if (before.status === 'DELIVERED' || before.status === 'PAID') {
      return reply.code(409).send({ error: 'A delivered or paid invoice can no longer be edited.' });
    }

    // Re-price whenever the lines or the VAT settings change.
    const chargeVat = body.chargeVat ?? before.chargeVat;
    const vatMode = body.vatMode ?? before.vatMode;
    let totals: { subtotal: number; vatTotal: number; total: number } | undefined;
    if (body.items || body.chargeVat !== undefined || body.vatMode !== undefined) {
      const source =
        body.items ??
        (await app.prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: 'asc' } })).map((i) => ({
          bookId: i.bookId,
          description: i.description,
          unit: i.unit,
          quantity: n(i.quantity),
          unitPrice: n(i.unitPrice),
          vatRate: n(i.vatRate),
        }));
      const priced = priceLines(source, vatMode, chargeVat);
      totals = { subtotal: priced.subtotal, vatTotal: priced.vatTotal, total: priced.total };
      await app.prisma.$transaction([
        app.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
        ...(priced.lines.length
          ? [app.prisma.invoiceItem.createMany({ data: priced.lines.map((l) => ({ ...l, invoiceId: id })) })]
          : []),
      ]);
    }

    const updated = await app.prisma.invoice.update({
      where: { id },
      data: {
        ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
        ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
        ...(body.priceTier !== undefined ? { priceTier: body.priceTier } : {}),
        ...(body.chargeVat !== undefined ? { chargeVat } : {}),
        ...(body.vatMode !== undefined ? { vatMode } : {}),
        ...(body.issueDate !== undefined ? { issueDate: new Date(body.issueDate) } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
        ...(body.deliveryNoteNo !== undefined ? { deliveryNoteNo: body.deliveryNoteNo } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.receivedBy !== undefined ? { receivedBy: body.receivedBy } : {}),
        ...(body.receivedIdNo !== undefined ? { receivedIdNo: body.receivedIdNo } : {}),
        ...(body.receivedDesignation !== undefined ? { receivedDesignation: body.receivedDesignation } : {}),
        ...(totals ?? {}),
      },
      include: withItems,
    });
    await auditRequest(app.prisma, req, {
      entity: 'invoice', entityId: id, branchId: updated.branchId, action: 'UPDATE',
      details: { number: updated.number, total: n(updated.total) },
    });
    return updated;
  });

  app.delete('/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const inv = await app.prisma.invoice.findUnique({ where: { id } });
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status === 'DELIVERED' || inv.status === 'PAID') {
      return reply.code(409).send({ error: 'A delivered or paid invoice cannot be deleted. Cancel it instead.' });
    }
    await app.prisma.invoice.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELLED' } });
    await auditRequest(app.prisma, req, {
      entity: 'invoice', entityId: id, branchId: inv.branchId, action: 'CANCEL', details: { number: inv.number },
    });
    return { ok: true };
  });

  /** Issue the invoice — it stops being a draft and gets a delivery note number. */
  app.post('/:id/issue', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const inv = await app.prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status !== 'DRAFT') return reply.code(409).send({ error: 'Only a draft invoice can be issued.' });
    if (inv.items.length === 0) return reply.code(400).send({ error: 'Add at least one item before issuing.' });

    const updated = await app.prisma.invoice.update({
      where: { id },
      data: { status: 'ISSUED', deliveryNoteNo: inv.deliveryNoteNo ?? (await nextNumber('DN', inv.branchId)) },
      include: withItems,
    });
    await auditRequest(app.prisma, req, {
      entity: 'invoice', entityId: id, branchId: inv.branchId, action: 'ISSUE',
      details: { number: inv.number, deliveryNote: updated.deliveryNoteNo, total: n(inv.total) },
    });
    return updated;
  });

  /**
   * Confirm delivery. Catalogue lines are booked out as a real sale so stock,
   * COGS and revenue all flow through the normal reporting.
   */
  app.post('/:id/deliver', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({
      receivedBy: z.string().max(120).optional(),
      receivedIdNo: z.string().max(60).optional(),
      receivedDesignation: z.string().max(120).optional(),
    }).parse(req.body ?? {});

    const inv = await app.prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status === 'DELIVERED' || inv.status === 'PAID') return reply.code(409).send({ error: 'This invoice has already been delivered.' });
    if (inv.status === 'CANCELLED') return reply.code(409).send({ error: 'This invoice was cancelled.' });

    const branchId = inv.branchId ?? req.user.branchId;
    if (branchId == null) return reply.code(400).send({ error: 'Set a branch on the invoice before delivering.' });

    const stockLines = inv.items.filter((i) => i.bookId != null && Number(i.quantity) > 0);
    const books = await app.prisma.book.findMany({
      where: { id: { in: stockLines.map((i) => i.bookId!) } },
      select: { id: true, costPrice: true },
    });
    const costById = new Map(books.map((b) => [b.id, Number(b.costPrice)]));

    const result = await app.prisma.$transaction(async (tx) => {
      let saleId: number | null = null;
      if (stockLines.length > 0) {
        const sale = await tx.sale.create({
          data: {
            branchId,
            userId: req.user.id,
            originBranchId: branchId,
            paymentMethod: 'CASH',
            priceTier: inv.priceTier,
            subtotal: n(inv.total),
            total: n(inv.total),
            items: {
              create: stockLines.map((i) => ({
                bookId: i.bookId!,
                quantity: Math.round(Number(i.quantity)),
                unitPrice: n(i.unitPrice),
                costPrice: costById.get(i.bookId!) ?? 0,
              })),
            },
          },
          select: { id: true, uuid: true, createdAt: true, items: { select: { uuid: true, bookId: true, quantity: true, unitPrice: true, costPrice: true } } },
        });
        saleId = sale.id;

        if (SYNC_ROLE === 'branch') {
          const [b, u, bks] = await Promise.all([
            tx.branch.findUnique({ where: { id: branchId }, select: { uuid: true } }),
            tx.user.findUnique({ where: { id: req.user.id }, select: { uuid: true } }),
            tx.book.findMany({ where: { id: { in: sale.items.map((i) => i.bookId) } }, select: { id: true, uuid: true } }),
          ]);
          const bookUuid = new Map(bks.map((x) => [x.id, x.uuid]));
          await enqueueOutbox(tx, 'sale', sale.uuid, {
            branchUuid: b?.uuid, userUuid: u?.uuid,
            subtotal: n(inv.total), discount: 0, discountReason: null, total: n(inv.total),
            paymentMethod: 'CASH', priceTier: inv.priceTier, createdAt: sale.createdAt,
            items: sale.items.map((i) => ({
              uuid: i.uuid, bookUuid: bookUuid.get(i.bookId), quantity: i.quantity,
              unitPrice: Number(i.unitPrice), costPrice: Number(i.costPrice),
            })),
          });
        }

        for (const i of stockLines) {
          const qty = Math.round(Number(i.quantity));
          await tx.stock.upsert({
            where: { branchId_bookId: { branchId, bookId: i.bookId! } },
            create: { branchId, bookId: i.bookId!, quantity: -qty },
            update: { quantity: { decrement: qty } },
          });
          await recordMovement(tx, {
            branchId,
            bookId: i.bookId!,
            delta: -qty,
            type: 'SALE',
            note: `Invoice ${inv.number}`,
            userId: req.user.id,
          });
        }
      }
      return tx.invoice.update({
        where: { id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          saleId,
          branchId,
          deliveryNoteNo: inv.deliveryNoteNo ?? undefined,
          receivedBy: body.receivedBy ?? inv.receivedBy,
          receivedIdNo: body.receivedIdNo ?? inv.receivedIdNo,
          receivedDesignation: body.receivedDesignation ?? inv.receivedDesignation,
        },
        include: withItems,
      });
    });

    await auditRequest(app.prisma, req, {
      entity: 'invoice', entityId: id, branchId, action: 'DELIVER',
      details: { number: inv.number, total: n(inv.total), receivedBy: body.receivedBy ?? null, saleId: result.saleId },
    });
    return result;
  });

  app.post('/:id/paid', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const inv = await app.prisma.invoice.findUnique({ where: { id } });
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status === 'PAID') return reply.code(409).send({ error: 'This invoice is already marked paid.' });
    const updated = await app.prisma.invoice.update({ where: { id }, data: { status: 'PAID' }, include: withItems });
    await auditRequest(app.prisma, req, {
      entity: 'invoice', entityId: id, branchId: inv.branchId, action: 'MARK_PAID',
      details: { number: inv.number, total: n(inv.total) },
    });
    return updated;
  });

  /* ---------------------------------------------------------- payments */

  const paymentSchema = z.object({
    customerId: z.number().int(),
    invoiceId: z.number().int().nullable().optional(),
    amount: z.number().positive(),
    paidAt: z.string().optional(),
    method: z.enum(['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CARD']).default('BANK_TRANSFER'),
    reference: z.string().max(60).nullable().optional(),
    note: z.string().max(190).nullable().optional(),
  });

  app.get('/payments', async (req) => {
    const { customerId, from, to } = req.query as { customerId?: string; from?: string; to?: string };
    return app.prisma.customerPayment.findMany({
      where: {
        deletedAt: null,
        customerId: customerId ? Number(customerId) : undefined,
        paidAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      include: { customer: { select: { name: true } }, invoice: { select: { number: true } } },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });
  });

  app.post('/payments', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = paymentSchema.parse(req.body);
    const customer = await app.prisma.customer.findUnique({ where: { id: body.customerId } });
    if (!customer) return reply.code(400).send({ error: 'Choose a valid customer.' });

    const created = await app.prisma.customerPayment.create({
      data: {
        customerId: body.customerId,
        invoiceId: body.invoiceId ?? null,
        amount: body.amount,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        method: body.method,
        reference: body.reference ?? null,
        note: body.note ?? null,
        createdById: req.user.id,
      },
    });

    // Settle the invoice automatically once it is fully covered.
    if (body.invoiceId) {
      const inv = await app.prisma.invoice.findUnique({ where: { id: body.invoiceId }, include: { payments: true } });
      if (inv) {
        const paid = inv.payments.filter((p) => !p.deletedAt).reduce((s, p) => s + n(p.amount), 0);
        if (paid + 0.01 >= n(inv.total) && inv.status !== 'PAID' && inv.status !== 'CANCELLED') {
          await app.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID' } });
        }
      }
    }

    await auditRequest(app.prisma, req, {
      entity: 'customer.payment', entityId: created.id, action: 'CREATE',
      details: { customer: customer.name, amount: body.amount, method: body.method, reference: body.reference ?? null },
    });
    return reply.code(201).send(created);
  });

  app.delete('/payments/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const pay = await app.prisma.customerPayment.findUnique({ where: { id } });
    if (!pay || pay.deletedAt) return reply.code(404).send({ error: 'Payment not found' });
    await app.prisma.customerPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditRequest(app.prisma, req, {
      entity: 'customer.payment', entityId: id, action: 'REVERSE', details: { amount: n(pay.amount) },
    });
    return { ok: true };
  });

  /* --------------------------------------------------------- statement */

  /**
   * Customer statement over a period: brought-forward balance, every invoice and
   * receipt with a running balance, and the outstanding amount split into
   * ageing buckets.
   */
  app.get('/customers/:id/statement', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid customer id' });
    const { from, to } = req.query as { from?: string; to?: string };

    const customer = await app.prisma.customer.findUnique({ where: { id } });
    if (!customer) return reply.code(404).send({ error: 'Customer not found' });

    const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const end = to ? new Date(to) : new Date();

    // Drafts and cancelled invoices are not debts.
    const billableStatuses: InvoiceStatus[] = ['ISSUED', 'DELIVERED', 'PAID'];
    const billable = { customerId: id, deletedAt: null, status: { in: billableStatuses } };
    const [invoicesBefore, paymentsBefore, invoices, payments] = await Promise.all([
      app.prisma.invoice.findMany({ where: { ...billable, issueDate: { lt: start } }, select: { total: true } }),
      app.prisma.customerPayment.findMany({ where: { customerId: id, deletedAt: null, paidAt: { lt: start } }, select: { amount: true } }),
      app.prisma.invoice.findMany({
        where: { ...billable, issueDate: { gte: start, lte: end } },
        select: { id: true, number: true, issueDate: true, dueDate: true, total: true, status: true },
        orderBy: { issueDate: 'asc' },
      }),
      app.prisma.customerPayment.findMany({
        where: { customerId: id, deletedAt: null, paidAt: { gte: start, lte: end } },
        select: { id: true, amount: true, paidAt: true, method: true, reference: true, invoice: { select: { number: true } } },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    const openingBalance = round2(
      n(customer.openingBalance) +
        invoicesBefore.reduce((s, i) => s + n(i.total), 0) -
        paymentsBefore.reduce((s, p) => s + n(p.amount), 0),
    );

    type Row = { date: Date; kind: 'INVOICE' | 'PAYMENT'; label: string; amount: number; balance: number };
    const rows: Row[] = [
      ...invoices.map((i) => ({ date: i.issueDate, kind: 'INVOICE' as const, label: `INV #${i.number}`, amount: n(i.total), balance: 0 })),
      ...payments.map((p) => ({
        date: p.paidAt,
        kind: 'PAYMENT' as const,
        label: `PMT${p.reference ? ` #${p.reference}` : ''}${p.invoice ? ` (${p.invoice.number})` : ''}`,
        amount: -n(p.amount),
        balance: 0,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = openingBalance;
    for (const r of rows) {
      running = round2(running + r.amount);
      r.balance = running;
    }
    const closingBalance = running;

    // Age what is still outstanding by how long each invoice has been due.
    const allOpen = await app.prisma.invoice.findMany({
      where: { ...billable, NOT: { status: 'PAID' } },
      select: { id: true, number: true, issueDate: true, dueDate: true, total: true, payments: { where: { deletedAt: null }, select: { amount: true } } },
    });
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
    const today = new Date();
    for (const inv of allOpen) {
      const outstanding = round2(n(inv.total) - inv.payments.reduce((s, p) => s + n(p.amount), 0));
      if (outstanding <= 0) continue;
      const due = inv.dueDate ?? new Date(inv.issueDate.getTime() + customer.paymentTermsDays * 864e5);
      const overdue = Math.floor((today.getTime() - due.getTime()) / 864e5);
      if (overdue <= 0) buckets.current += outstanding;
      else if (overdue <= 30) buckets.d1_30 += outstanding;
      else if (overdue <= 60) buckets.d31_60 += outstanding;
      else if (overdue <= 90) buckets.d61_90 += outstanding;
      else buckets.over90 += outstanding;
    }

    return {
      customer,
      period: { from: start.toISOString(), to: end.toISOString() },
      openingBalance,
      closingBalance,
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
        invoiced: round2(invoices.reduce((s, i) => s + n(i.total), 0)),
        received: round2(payments.reduce((s, p) => s + n(p.amount), 0)),
      },
    };
  });

  /** Every credit customer with what they owe — the receivables list. */
  app.get('/customers/balances', async () => {
    const customers = await app.prisma.customer.findMany({
      where: { deletedAt: null },
      include: {
        invoices: { where: { deletedAt: null, status: { in: ['ISSUED', 'DELIVERED', 'PAID'] as InvoiceStatus[] } }, select: { total: true } },
        payments: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: { name: 'asc' },
    });
    return customers.map((c) => {
      const invoiced = c.invoices.reduce((s, i) => s + n(i.total), 0);
      const received = c.payments.reduce((s, p) => s + n(p.amount), 0);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        contactPerson: c.contactPerson,
        invoices: c.invoices.length,
        invoiced: round2(invoiced),
        received: round2(received),
        balance: round2(n(c.openingBalance) + invoiced - received),
      };
    });
  });
}
