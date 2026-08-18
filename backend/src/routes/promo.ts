import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { auditRequest } from '../lib/audit.js';

// nginx caps request bodies at 5m, and base64 inflates by a third, so anything
// larger than this could never reach us anyway. The browser downscales before
// uploading, so real pictures land around 200-400 KB.
const MAX_BYTES = 3 * 1024 * 1024;
const BODY_LIMIT = 6 * 1024 * 1024;

/**
 * Identify the picture from its own bytes rather than trusting what the client
 * claimed, because we serve it back with that type. SVG is excluded on purpose:
 * it is a document that can carry script, so a stored SVG would be stored XSS.
 */
function sniffImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function decodeImage(input: string): { buf: Buffer; mimeType: string } {
  const match = /^data:[\w/+.-]+;base64,(.*)$/s.exec(input.trim());
  const raw = (match ? match[1] : input).trim();
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0) throw badRequest('That picture could not be read.');
  if (buf.length > MAX_BYTES) throw badRequest('That picture is too large. Please use one under 3 MB.');
  const mimeType = sniffImage(buf);
  if (!mimeType) throw badRequest('Only JPEG, PNG or WebP pictures can be used.');
  return { buf, mimeType };
}

const createSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  subtitle: z.string().max(300).nullable().optional(),
  active: z.boolean().optional(),
  imageBase64: z.string().min(1),
});

const updateSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  subtitle: z.string().max(300).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  imageBase64: z.string().min(1).optional(),
});

const adminOnly = { preHandler: [authGuard, requireRole('ADMIN')] };

export async function promoRoutes(app: FastifyInstance) {
  /* ------------------------------------------------------------- public */
  // The login screen is not signed in, so these two are deliberately open.
  // They expose only the captions an admin chose to publish.

  app.get('/', async () => {
    const slides = await app.prisma.promoSlide.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, subtitle: true, sortOrder: true, updatedAt: true },
      take: 20,
    });
    return slides.map(({ updatedAt, ...s }) => ({ ...s, v: updatedAt.getTime() }));
  });

  app.get('/:id/image', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid id' });
    const slide = await app.prisma.promoSlide.findUnique({ where: { id } });
    if (!slide) return reply.code(404).send({ error: 'Not found' });
    // Callers append ?v=<updatedAt>, so a given URL really is immutable.
    return reply
      .header('Content-Type', slide.mimeType)
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(Buffer.from(slide.image));
  });

  /* -------------------------------------------------------------- admin */

  app.get('/manage', adminOnly, async () => {
    const slides = await app.prisma.promoSlide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, subtitle: true, sortOrder: true, active: true, updatedAt: true },
    });
    return slides.map(({ updatedAt, ...s }) => ({ ...s, v: updatedAt.getTime() }));
  });

  app.post('/', { ...adminOnly, bodyLimit: BODY_LIMIT }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const { buf, mimeType } = decodeImage(body.imageBase64);
    const last = await app.prisma.promoSlide.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const slide = await app.prisma.promoSlide.create({
      data: {
        title: body.title?.trim() || null,
        subtitle: body.subtitle?.trim() || null,
        active: body.active ?? true,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        mimeType,
        image: buf,
      },
      select: { id: true, title: true, subtitle: true, sortOrder: true, active: true, updatedAt: true },
    });
    await auditRequest(app.prisma, req, {
      entity: 'promo.slide',
      entityId: slide.id,
      action: 'CREATE',
      details: { title: slide.title, bytes: buf.length, mimeType },
    });
    return reply.code(201).send({ ...slide, v: slide.updatedAt.getTime() });
  });

  app.put('/:id', { ...adminOnly, bodyLimit: BODY_LIMIT }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = updateSchema.parse(req.body);
    const existing = await app.prisma.promoSlide.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title?.trim() || null;
    if (body.subtitle !== undefined) data.subtitle = body.subtitle?.trim() || null;
    if (body.active !== undefined) data.active = body.active;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.imageBase64) {
      const { buf, mimeType } = decodeImage(body.imageBase64);
      data.image = buf;
      data.mimeType = mimeType;
    }

    const slide = await app.prisma.promoSlide.update({
      where: { id },
      data,
      select: { id: true, title: true, subtitle: true, sortOrder: true, active: true, updatedAt: true },
    });
    await auditRequest(app.prisma, req, {
      entity: 'promo.slide',
      entityId: id,
      action: 'UPDATE',
      details: { title: slide.title, active: slide.active, imageReplaced: Boolean(body.imageBase64) },
    });
    return { ...slide, v: slide.updatedAt.getTime() };
  });

  app.delete('/:id', adminOnly, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = await app.prisma.promoSlide.findUnique({ where: { id }, select: { title: true } });
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    await app.prisma.promoSlide.delete({ where: { id } });
    await auditRequest(app.prisma, req, {
      entity: 'promo.slide',
      entityId: id,
      action: 'DELETE',
      details: { title: existing.title },
    });
    return reply.code(204).send();
  });

  /** Persist a whole new running order in one go, so the list can be dragged about. */
  app.post('/reorder', adminOnly, async (req) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).max(50) }).parse(req.body);
    await app.prisma.$transaction(
      ids.map((id, index) => app.prisma.promoSlide.update({ where: { id }, data: { sortOrder: index } })),
    );
    await auditRequest(app.prisma, req, { entity: 'promo.slide', entityId: 0, action: 'UPDATE', details: { reordered: ids } });
    return { ok: true };
  });
}
