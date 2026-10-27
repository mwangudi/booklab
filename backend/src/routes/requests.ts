import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../middleware/authGuard.js';
import { requireAnyCapability, requireCapability } from '../middleware/permissions.js';
import { auditRequest } from '../lib/audit.js';

/**
 * Requests customers sent from the website catalogue. Anyone who can see customers
 * or raise invoices can read them; turning one into an invoice lives with the
 * invoice routes (POST /api/invoices/from-request/:id).
 */
export async function requestRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  const read = { preHandler: requireAnyCapability('customer.view', 'invoice.create') };

  app.get('/', read, async (req) => {
    const { status } = req.query as { status?: string };
    return app.prisma.customerRequest.findMany({
      where: status ? { status: status as never } : undefined,
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  });

  /** For the menu and dashboard: how many are waiting. */
  app.get('/summary', read, async () => ({
    new: await app.prisma.customerRequest.count({ where: { status: 'NEW' } }),
  }));

  app.get('/:id', read, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid request id' });
    const r = await app.prisma.customerRequest.findUnique({
      where: { id },
      include: { items: { include: { book: { select: { sku: true, title: true, unit: true, deletedAt: true } } } } },
    });
    if (!r) return reply.code(404).send({ error: 'Request not found' });
    const [handler, invoice, stock] = await Promise.all([
      r.handledById ? app.prisma.user.findUnique({ where: { id: r.handledById }, select: { name: true } }) : null,
      r.invoiceId ? app.prisma.invoice.findUnique({ where: { id: r.invoiceId }, select: { id: true, number: true, status: true } }) : null,
      app.prisma.stock.groupBy({ by: ['bookId'], where: { bookId: { in: r.items.map((i) => i.bookId) } }, _sum: { quantity: true } }),
    ]);
    // Staff see what the shop actually holds, to judge what can be supplied.
    const held = new Map(stock.map((s) => [s.bookId, s._sum.quantity ?? 0]));
    return {
      ...r,
      handledBy: handler?.name ?? null,
      invoice,
      items: r.items.map((i) => ({ ...i, onHand: held.get(i.bookId) ?? 0 })),
    };
  });

  app.patch('/:id', { preHandler: requireCapability('invoice.create') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED', 'CANCELLED']) }).parse(req.body);
    const before = await app.prisma.customerRequest.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Request not found' });
    if (before.status === 'INVOICED') return reply.code(409).send({ error: 'This request already has an invoice.' });
    const updated = await app.prisma.customerRequest.update({ where: { id }, data: { status: body.status, handledById: req.user.id } });
    await auditRequest(app.prisma, req, {
      entity: 'customerRequest', entityId: id, action: 'STATUS',
      details: { number: before.number, from: before.status, to: body.status },
    });
    return updated;
  });
}
