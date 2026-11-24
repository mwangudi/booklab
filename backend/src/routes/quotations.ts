import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, branchScope, isAdmin, ownsBranchRecord } from '../middleware/authGuard.js';
import { requireAnyCapability, requireCapability } from '../middleware/permissions.js';
import { asVatMode } from '../lib/enums.js';
import { auditRequest } from '../lib/audit.js';
import { SYNC_ROLE } from '../lib/outbox.js';
import { idFromParam, newRef, nextInSeries } from '../lib/docNumber.js';
import { cashierPriceProblem, itemFields, kenyaYear, lineTotalFits, priceLines, withFreshNumber, type LineInput } from './invoices.js';

/**
 * Quotations: a price offer to a customer, made on its own (not from an invoice).
 * A quotation moves no stock and owes nothing; it is numbered QTN-2026-0001.
 * They live on the main system only: a branch laptop does not sync them, so it
 * refuses to make one rather than keep it where head office never sees it.
 */
/** A date the server can read ("2026-11-24"); anything else is a 400, not a crash. */
const dateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date.');

const quotationSchema = z.object({
  customerId: z.number().int(),
  branchId: z.number().int().nullable().optional(),
  priceTier: z.enum(['RETAIL', 'WHOLESALE', 'SCHOOL']).default('SCHOOL'),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED']).optional(),
  chargeVat: z.boolean().optional(),
  vatMode: z.enum(['EXCLUSIVE', 'INCLUSIVE']).optional(),
  issueDate: dateString.optional(),
  validDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(itemFields.omit({ id: true }).refine(...lineTotalFits)).default([]),
});
const quotationUpdateSchema = quotationSchema.partial();
const listQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED']).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

const n = (v: unknown) => Number(v ?? 0);

/**
 * Price the lines as invoices do, but keep each line's own VAT rate even while VAT is not
 * charged: amounts are worked out at 0%, so turning VAT back on later restores the right
 * rates instead of leaving every line at 0.
 */
function priceQuotation(items: LineInput[], vatMode: 'EXCLUSIVE' | 'INCLUSIVE', chargeVat: boolean) {
  const priced = priceLines(items, vatMode, chargeVat);
  return { ...priced, lines: priced.lines.map((l, i) => ({ ...l, vatRate: items[i].vatRate ?? 16 })) };
}
/** Why the products or branch named are not usable, or null when they are. */
async function referenceProblem(
  prisma: FastifyInstance['prisma'],
  items: Array<{ bookId?: number | null }> | undefined,
  branchId: number | null | undefined,
): Promise<string | null> {
  const ids = [...new Set((items ?? []).map((i) => i.bookId).filter((x): x is number => x != null))];
  if (ids.length) {
    const found = await prisma.book.count({ where: { id: { in: ids } } });
    if (found !== ids.length) return 'One of the products is no longer in the catalogue. Pick it again.';
  }
  if (branchId != null && !(await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    return 'Choose a valid branch.';
  }
  return null;
}

const BRANCH_REFUSAL = 'Quotations are made on the main system (www.booklabbookshop.co.ke), not on a branch laptop.';

export async function quotationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  const withItems = {
    customer: true,
    branch: { select: { id: true, name: true, location: true } },
    items: { orderBy: { sortOrder: 'asc' as const } },
  };

  const quotationIdFrom = (param: string) =>
    idFromParam(param, (ref) => app.prisma.quotation.findUnique({ where: { ref }, select: { id: true } }));

  /** Next number in this year's company-wide series: QTN-2026-0001. */
  async function nextNumber(): Promise<string> {
    const year = kenyaYear();
    const rows = await app.prisma.quotation.findMany({ where: { number: { startsWith: `QTN-${year}-` } }, select: { number: true } });
    return nextInSeries('QTN', year, rows.map((r) => r.number));
  }

  /** The quotation a URL names, if this user may see it; replies 404 otherwise. */
  async function load(req: Parameters<typeof ownsBranchRecord>[0], param: string) {
    const id = await quotationIdFrom(param);
    if (id == null) return null;
    const q = await app.prisma.quotation.findUnique({ where: { id }, include: withItems });
    if (!q || q.deletedAt || !ownsBranchRecord(req, q.branchId)) return null;
    return q;
  }

  app.get('/', { preHandler: requireAnyCapability('customer.view', 'invoice.create') }, async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the list filters: status, customer, branch or dates.' });
    const { status, customerId, from, to, branchId } = parsed.data;
    const scoped = branchScope(req, reply, branchId);
    return app.prisma.quotation.findMany({
      where: {
        deletedAt: null,
        ...(scoped == null ? {} : { OR: [{ branchId: scoped }, { branchId: null }] }),
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        issueDate: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      include: { customer: true, branch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  });

  app.get('/:id', { preHandler: requireAnyCapability('customer.view', 'invoice.create') }, async (req, reply) => {
    const q = await load(req, (req.params as { id: string }).id);
    if (!q) return reply.code(404).send({ error: 'Quotation not found' });
    return q;
  });

  app.post('/', { preHandler: requireCapability('invoice.create') }, async (req, reply) => {
    if (SYNC_ROLE === 'branch') return reply.code(409).send({ error: BRANCH_REFUSAL });
    const body = quotationSchema.parse(req.body);
    const customer = await app.prisma.customer.findUnique({ where: { id: body.customerId } });
    if (!customer || customer.deletedAt) return reply.code(400).send({ error: 'Choose a valid customer.' });
    if (body.items.length === 0) return reply.code(400).send({ error: 'Add at least one item.' });
    const refs = await referenceProblem(app.prisma, body.items, isAdmin(req) ? body.branchId : null);
    if (refs) return reply.code(400).send({ error: refs });

    const chargeVat = body.chargeVat ?? customer.chargeVat;
    const vatMode = asVatMode(body.vatMode ?? customer.vatMode);
    const priced = priceQuotation(body.items, vatMode, chargeVat);
    // As with invoices, a manager quotes for their own branch; only an admin picks another.
    const branchId = isAdmin(req) ? body.branchId ?? req.user.branchId ?? null : req.user.branchId ?? null;
    if (req.user.role === 'CASHIER') {
      const problem = await cashierPriceProblem(app.prisma, branchId, body.priceTier, body.items);
      if (problem) return reply.code(400).send({ error: problem });
    }

    const created = await withFreshNumber(async () => app.prisma.quotation.create({
      data: {
        number: await nextNumber(),
        ref: newRef(),
        customerId: body.customerId,
        branchId,
        status: body.status ?? 'DRAFT',
        priceTier: body.priceTier,
        chargeVat,
        vatMode,
        issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
        validDays: body.validDays ?? 30,
        notes: body.notes ?? null,
        subtotal: priced.subtotal,
        vatTotal: priced.vatTotal,
        total: priced.total,
        createdById: req.user.id,
        items: { create: priced.lines },
      },
      include: withItems,
    }));
    await auditRequest(app.prisma, req, {
      entity: 'quotation', entityId: created.id, branchId: created.branchId, action: 'CREATE',
      details: { number: created.number, customer: customer.name, total: priced.total, lines: priced.lines.length },
    });
    return reply.code(201).send(created);
  });

  app.patch('/:id', { preHandler: requireCapability('invoice.create') }, async (req, reply) => {
    if (SYNC_ROLE === 'branch') return reply.code(409).send({ error: BRANCH_REFUSAL });
    const before = await load(req, (req.params as { id: string }).id);
    if (!before) return reply.code(404).send({ error: 'Quotation not found' });
    const body = quotationUpdateSchema.parse(req.body);

    if (body.customerId !== undefined && body.customerId !== before.customerId) {
      const c = await app.prisma.customer.findUnique({ where: { id: body.customerId } });
      if (!c || c.deletedAt) return reply.code(400).send({ error: 'Choose a valid customer.' });
    }
    if (body.items !== undefined && body.items.length === 0) return reply.code(400).send({ error: 'Add at least one item.' });
    const refs = await referenceProblem(app.prisma, body.items, isAdmin(req) ? body.branchId : null);
    if (refs) return reply.code(400).send({ error: refs });

    const chargeVat = body.chargeVat ?? before.chargeVat;
    const vatMode = asVatMode(body.vatMode ?? before.vatMode);
    const branchId = body.branchId !== undefined && isAdmin(req) ? body.branchId : before.branchId;
    const priceTier = body.priceTier ?? before.priceTier;
    // Changing the VAT terms reprices the saved lines even when the lines are not resent.
    const source = body.items ?? (body.chargeVat !== undefined || body.vatMode !== undefined
      ? before.items.map((i) => ({ bookId: i.bookId, description: i.description, unit: i.unit, quantity: n(i.quantity), unitPrice: n(i.unitPrice), vatRate: n(i.vatRate) }))
      : null);
    // A cashier's prices are checked against the tier whenever the lines or the tier change.
    const toCheck = body.items ?? (body.priceTier !== undefined
      ? before.items.map((i) => ({ bookId: i.bookId, description: i.description, unitPrice: n(i.unitPrice) }))
      : null);
    if (toCheck && req.user.role === 'CASHIER') {
      const problem = await cashierPriceProblem(app.prisma, branchId, priceTier, toCheck);
      if (problem) return reply.code(400).send({ error: problem });
    }
    const priced = source ? priceQuotation(source, vatMode, chargeVat) : null;

    const updated = await app.prisma.$transaction(async (tx) => {
      if (priced) {
        await tx.quotationItem.deleteMany({ where: { quotationId: before.id } });
        await tx.quotationItem.createMany({ data: priced.lines.map((l) => ({ ...l, quotationId: before.id })) });
      }
      await tx.quotation.update({
        where: { id: before.id },
        data: {
          ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
          ...(body.branchId !== undefined && isAdmin(req) ? { branchId: body.branchId } : {}),
          ...(body.priceTier !== undefined ? { priceTier: body.priceTier } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.chargeVat !== undefined ? { chargeVat } : {}),
          ...(body.vatMode !== undefined ? { vatMode } : {}),
          ...(body.issueDate !== undefined ? { issueDate: new Date(body.issueDate) } : {}),
          ...(body.validDays !== undefined ? { validDays: body.validDays } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(priced ? { subtotal: priced.subtotal, vatTotal: priced.vatTotal, total: priced.total } : {}),
        },
      });
      return tx.quotation.findUniqueOrThrow({ where: { id: before.id }, include: withItems });
    });
    await auditRequest(app.prisma, req, {
      entity: 'quotation', entityId: before.id, branchId: updated.branchId, action: 'UPDATE',
      details: { number: updated.number, status: updated.status, total: n(updated.total), totalBefore: n(before.total) },
    });
    return updated;
  });

  app.delete('/:id', { preHandler: requireCapability('invoice.create') }, async (req, reply) => {
    if (SYNC_ROLE === 'branch') return reply.code(409).send({ error: BRANCH_REFUSAL });
    const q = await load(req, (req.params as { id: string }).id);
    if (!q) return reply.code(404).send({ error: 'Quotation not found' });
    // A quotation the customer has seen is a record of what was offered: a manager removes it.
    if (q.status !== 'DRAFT' && req.user.role === 'CASHIER') {
      return reply.code(403).send({ error: 'Only a manager can delete a quotation that has been sent.' });
    }
    await app.prisma.quotation.update({ where: { id: q.id }, data: { deletedAt: new Date() } });
    await auditRequest(app.prisma, req, {
      entity: 'quotation', entityId: q.id, branchId: q.branchId, action: 'DELETE', details: { number: q.number },
    });
    return { ok: true };
  });
}
