import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole, isAdmin } from '../middleware/authGuard.js';
import { auditRequest, diff } from '../lib/audit.js';

const branchSchema = z.object({
  name: z.string().min(1),
  /// Prefixes documents raised here, so it has to stay short and stable.
  code: z.string().trim().min(2).max(6).regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only').transform((s) => s.toUpperCase()),
  location: z.string().min(1),
});

export async function branchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  // Non-admins only see their assigned branch.
  app.get('/', async (req) => {
    if (isAdmin(req)) return app.prisma.branch.findMany({ orderBy: { name: 'asc' } });
    if (req.user?.branchId == null) return [];
    return app.prisma.branch.findMany({ where: { id: req.user.branchId }, orderBy: { name: 'asc' } });
  });

  app.post('/', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const body = branchSchema.parse(req.body);
    const created = await app.prisma.branch.create({ data: body });
    await auditRequest(app.prisma, req, { entity: 'branch', entityId: created.id, branchId: created.id, action: 'CREATE', details: body });
    reply.code(201).send(created);
  });

  app.patch('/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = branchSchema.partial().parse(req.body);
    const before = await app.prisma.branch.findUnique({ where: { id: Number(id) } });
    if (!before) return reply.code(404).send({ error: 'Branch not found' });
    const updated = await app.prisma.branch.update({ where: { id: Number(id) }, data: body });
    await auditRequest(app.prisma, req, {
      entity: 'branch',
      entityId: updated.id,
      branchId: updated.id,
      action: 'UPDATE',
      details: { changes: diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>) },
    });
    return updated;
  });
}
