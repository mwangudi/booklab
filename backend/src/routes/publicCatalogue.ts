import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAudit } from '../lib/audit.js';

/**
 * The website's catalogue and order requests. PUBLIC — no sign-in.
 *
 * Only what a customer needs is exposed: products the shop holds in stock (any
 * branch), by name, code, category and unit. No prices, no quantities, no branches.
 */

const requestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40).regex(/^[0-9+()\-\s]+$/, 'Enter a phone number'),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  organisation: z.string().trim().max(160).optional(),
  location: z.string().trim().min(2).max(200),
  note: z.string().trim().max(2000).optional(),
  /** The quotation form's free-text list (a booklist, reagents, page counts…). */
  listText: z.string().trim().max(5000).optional(),
  preferredBranch: z.enum(['Luanda', 'Kapsabet', 'Mumias']).optional(),
  items: z.array(z.object({ bookId: z.number().int(), quantity: z.number().int().min(1).max(100_000) })).max(200).default([]),
  /** Left empty by people; bots fill every field they see. */
  website: z.string().max(0).optional(),
}).refine((b) => b.items.length > 0 || (b.listText ?? '').length >= 3, {
  message: 'Add items from the catalogue, or type what you need.',
  path: ['items'],
});

/** Products with stock on hand somewhere, as the website may show them. */
async function inStockIds(app: FastifyInstance): Promise<Set<number>> {
  const rows = await app.prisma.stock.groupBy({ by: ['bookId'], where: { quantity: { gt: 0 } }, _sum: { quantity: true } });
  return new Set(rows.filter((r) => (r._sum.quantity ?? 0) > 0).map((r) => r.bookId));
}

export async function publicCatalogueRoutes(app: FastifyInstance) {
  app.get('/catalogue', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_req, reply) => {
    const ids = await inStockIds(app);
    const books = await app.prisma.book.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true, sku: true, title: true, category: true, unit: true },
      orderBy: { title: 'asc' },
    });
    // Stock changes all day; a minute's caching is plenty for a catalogue.
    reply.header('Cache-Control', 'public, max-age=60');
    return { items: books, count: books.length };
  });

  app.post('/requests', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = requestSchema.parse(req.body);
    if (body.website) return reply.code(400).send({ error: 'Request not accepted.' });

    // One line per product, however the basket was built.
    const qty = new Map<number, number>();
    for (const it of body.items) qty.set(it.bookId, (qty.get(it.bookId) ?? 0) + it.quantity);

    const ids = await inStockIds(app);
    const books = await app.prisma.book.findMany({
      where: { id: { in: [...qty.keys()] }, deletedAt: null },
      select: { id: true, title: true },
    });
    const ok = books.filter((b) => ids.has(b.id));
    if (ok.length !== qty.size) {
      return reply.code(400).send({ error: 'Some items are no longer in stock. Refresh the catalogue and try again.' });
    }

    // Numbers run REQ-0001, REQ-0002, …; a clash from two requests at once just retries.
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await app.prisma.customerRequest.findFirst({ orderBy: { id: 'desc' }, select: { number: true } });
      const next = (Number(last?.number.replace(/\D/g, '') ?? 0) || 0) + 1 + attempt;
      const number = `REQ-${String(next).padStart(4, '0')}`;
      try {
        const created = await app.prisma.customerRequest.create({
          data: {
            number,
            name: body.name,
            phone: body.phone,
            email: body.email || null,
            organisation: body.organisation || null,
            location: body.location,
            note: body.note || null,
            listText: body.listText || null,
            preferredBranch: body.preferredBranch ?? null,
            ip: req.ip,
            items: { create: ok.map((b) => ({ bookId: b.id, title: b.title, quantity: qty.get(b.id)! })) },
          },
          select: { id: true, number: true },
        });
        await writeAudit(app.prisma, {
          entity: 'customerRequest', entityId: created.id, action: 'CREATE', ip: req.ip,
          details: { number, name: body.name, organisation: body.organisation ?? null, lines: ok.length, typedList: !!body.listText },
        });
        return reply.code(201).send({ number: created.number });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    return reply.code(503).send({ error: 'Please try again in a moment.' });
  });
}
