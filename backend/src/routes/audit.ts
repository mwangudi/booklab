import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../middleware/authGuard.js';

/**
 * Read-only view of the system audit trail. Admin-only: the log records who did
 * what, from which address, across every branch.
 */
export async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  app.get('/', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { entity, action, userId, from, to, q, limit } = req.query as {
      entity?: string; action?: string; userId?: string; from?: string; to?: string; q?: string; limit?: string;
    };

    const rows = await app.prisma.auditLog.findMany({
      where: {
        entity: entity || undefined,
        action: action || undefined,
        userId: userId ? Number(userId) : undefined,
        createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
        ...(q ? { OR: [{ details: { contains: q } }, { action: { contains: q } }, { entity: { contains: q } }] } : {}),
      },
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 500, 2000),
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      user: r.user?.name ?? 'System / anonymous',
      email: r.user?.email ?? null,
      role: r.user?.role ?? null,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      branchId: r.branchId,
      ip: r.ip,
      details: r.details,
    }));
  });

  // Distinct values so the UI can offer real filter options.
  app.get('/facets', { preHandler: requireRole('ADMIN') }, async () => {
    const [entities, actions] = await Promise.all([
      app.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
      app.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);
    return { entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action) };
  });
}
