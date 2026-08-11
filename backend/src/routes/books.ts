import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { auditRequest, diff } from '../lib/audit.js';

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  isbn: z.string().optional(),
  sku: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().min(1).max(40).default('Piece'),
  unitPrice: z.number().nonnegative(),
  priceWholesale: z.number().nonnegative().nullable().optional(),
  priceSchool: z.number().nonnegative().nullable().optional(),
  costPrice: z.number().nonnegative(),
});
const bookUpdateSchema = bookSchema.partial();

const importItemSchema = z.object({
  title: z.string().min(1),
  category: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  author: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  unitPrice: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  priceWholesale: z.number().nonnegative().nullable().optional(),
  priceSchool: z.number().nonnegative().nullable().optional(),
});
const importSchema = z.object({ items: z.array(importItemSchema).min(1).max(5000) });

export async function bookRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  // Archived (soft-deleted) products stay in the database so historical sales
  // keep their detail, but they are hidden unless explicitly requested.
  app.get('/', async (req) => {
    const { q, archived } = req.query as { q?: string; archived?: string };
    const scope = archived === 'only' ? { NOT: { deletedAt: null } } : archived === 'all' ? {} : { deletedAt: null };
    return app.prisma.book.findMany({
      where: {
        ...scope,
        ...(q
          ? { OR: [{ title: { contains: q } }, { author: { contains: q } }, { sku: { contains: q } }, { isbn: { contains: q } }] }
          : {}),
      },
      orderBy: { title: 'asc' },
      take: 500,
    });
  });

  app.post('/', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = bookSchema.parse(req.body);
    try {
      const created = await app.prisma.book.create({ data: body });
      await auditRequest(app.prisma, req, {
        entity: 'book',
        entityId: created.id,
        action: 'CREATE',
        details: { sku: created.sku, title: created.title },
      });
      reply.code(201).send(created);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ error: 'SKU or ISBN already in use' });
      throw e;
    }
  });

  app.patch('/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid book id' });
    const body = bookUpdateSchema.parse(req.body);
    const before = await app.prisma.book.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Book not found' });
    try {
      const updated = await app.prisma.book.update({ where: { id }, data: body });
      await auditRequest(app.prisma, req, {
        entity: 'book',
        entityId: id,
        action: 'UPDATE',
        details: { sku: before.sku, changes: diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>) },
      });
      return updated;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ error: 'SKU or ISBN already in use' });
      return reply.code(404).send({ error: 'Book not found' });
    }
  });

  // Archive a product (soft delete). Sales history and stock rows are preserved.
  app.delete('/:id', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid book id' });
    const book = await app.prisma.book.findUnique({ where: { id } });
    if (!book) return reply.code(404).send({ error: 'Book not found' });
    if (book.deletedAt) return reply.code(409).send({ error: 'This product is already archived.' });

    const onHand = await app.prisma.stock.aggregate({ where: { bookId: id }, _sum: { quantity: true } });
    const remaining = onHand._sum.quantity ?? 0;
    const archived = await app.prisma.book.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditRequest(app.prisma, req, {
      entity: 'book',
      entityId: id,
      action: 'ARCHIVE',
      details: { sku: book.sku, title: book.title, stockOnHand: remaining },
    });
    return { ...archived, stockOnHand: remaining };
  });

  // Bring an archived product back into the live catalogue.
  app.post('/:id/restore', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid book id' });
    const book = await app.prisma.book.findUnique({ where: { id } });
    if (!book) return reply.code(404).send({ error: 'Book not found' });
    if (!book.deletedAt) return reply.code(409).send({ error: 'This product is not archived.' });
    const restored = await app.prisma.book.update({ where: { id }, data: { deletedAt: null } });
    await auditRequest(app.prisma, req, {
      entity: 'book',
      entityId: id,
      action: 'RESTORE',
      details: { sku: book.sku, title: book.title },
    });
    return restored;
  });

  // Bulk import/update the catalogue (e.g. from a CSV). Upserts by SKU when
  // provided, otherwise matches an existing product by title. Missing prices
  // default to 0 so partially-filled sheets still load.
  app.post('/import', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { items } = importSchema.parse(req.body);
    let created = 0;
    let updated = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const data = {
          title: it.title.trim(),
          category: it.category?.trim() || null,
          unit: it.unit?.trim() || 'Piece',
          author: it.author?.trim() || null,
          isbn: it.isbn?.trim() || null,
          unitPrice: it.unitPrice ?? 0,
          costPrice: it.costPrice ?? 0,
          priceWholesale: it.priceWholesale ?? null,
          priceSchool: it.priceSchool ?? null,
          // Re-importing an archived product brings it back into the catalogue.
          deletedAt: null,
        };
        const sku = it.sku?.trim();
        if (sku) {
          const existing = await app.prisma.book.findUnique({ where: { sku } });
          if (existing) {
            await app.prisma.book.update({ where: { sku }, data });
            updated += 1;
          } else {
            await app.prisma.book.create({ data: { ...data, sku } });
            created += 1;
          }
        } else {
          const existing = await app.prisma.book.findFirst({ where: { title: data.title } });
          if (existing) {
            await app.prisma.book.update({ where: { id: existing.id }, data });
            updated += 1;
          } else {
            const gen = `IMP-${Date.now().toString(36)}-${i}`.toUpperCase();
            await app.prisma.book.create({ data: { ...data, sku: gen } });
            created += 1;
          }
        }
      } catch (e) {
        const msg = (e as { code?: string }).code === 'P2002' ? 'Duplicate SKU or ISBN' : (e as Error).message;
        errors.push({ row: i + 1, error: msg });
      }
    }

    await auditRequest(app.prisma, req, {
      entity: 'book',
      action: 'IMPORT',
      details: { total: items.length, created, updated, errors: errors.length },
    });
    return { total: items.length, created, updated, errors };
  });
}
