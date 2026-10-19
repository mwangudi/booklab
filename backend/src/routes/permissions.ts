import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { CAPABILITIES, CAPABILITY_LABELS, capabilitiesFor, defaultsFor, overrideIsLive, type Capability } from '../middleware/permissions.js';
import { auditRequest } from '../lib/audit.js';

const setSchema = z.object({
  capability: z.enum(CAPABILITIES),
  /** null clears the exception and puts the person back on their role default. */
  allowed: z.boolean().nullable(),
  /** ISO date-time; the exception lapses after this. null/omitted = until turned off. */
  expiresAt: z.string().datetime().nullable().optional(),
});

/** Who can do what (Administration → Permissions). Ported from PharmaCare. */
export async function permissionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  /** What the signed-in person may do, so the screens can hide what they cannot use. */
  app.get('/me', async (req) => ({ role: req.user.role, capabilities: await capabilitiesFor(app.prisma, req.user) }));

  /** The switches, for the admin screen. */
  app.get('/catalogue', { preHandler: requireRole('ADMIN') }, async () =>
    CAPABILITIES.map((c) => ({ capability: c, ...CAPABILITY_LABELS[c] })));

  /** Everyone active, with each switch and whether it came from their role or an exception. */
  app.get('/users', { preHandler: requireRole('ADMIN') }, async () => {
    const [users, overrides] = await Promise.all([
      app.prisma.user.findMany({
        where: { active: true, deletedAt: null },
        select: { id: true, name: true, username: true, email: true, role: true, branch: { select: { name: true } } },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      app.prisma.userPermission.findMany(),
    ]);
    const byUser = new Map<number, Map<string, { allowed: boolean; expiresAt: Date | null }>>();
    for (const o of overrides.filter(overrideIsLive)) {
      if (!byUser.has(o.userId)) byUser.set(o.userId, new Map());
      byUser.get(o.userId)!.set(o.capability, { allowed: o.allowed, expiresAt: o.expiresAt });
    }
    return users.map((u) => {
      const mine = byUser.get(u.id);
      const roleDefaults = defaultsFor(u.role);
      return {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        role: u.role,
        branchName: u.branch?.name ?? null,
        capabilities: CAPABILITIES.map((c) => {
          const o = u.role === 'ADMIN' ? undefined : mine?.get(c);
          return {
            capability: c,
            allowed: o ? o.allowed : roleDefaults.includes(c as Capability),
            fromRole: !o,
            expiresAt: o?.expiresAt ?? null,
          };
        }),
      };
    });
  });

  app.put('/users/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const userId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(userId)) return reply.code(400).send({ error: 'Invalid user id' });
    const body = setSchema.parse(req.body);

    const target = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, branchId: true } });
    if (!target) return reply.code(404).send({ error: 'User not found.' });
    if (target.role === 'ADMIN') return reply.code(400).send({ error: 'Administrators always have every permission.' });

    const before = await app.prisma.userPermission.findUnique({ where: { userId_capability: { userId, capability: body.capability } } });
    const audit = (to: unknown) =>
      auditRequest(app.prisma, req, {
        entity: 'permission', entityId: userId, branchId: target.branchId, action: 'SET',
        details: {
          user: target.name,
          capability: body.capability,
          from: before && overrideIsLive(before) ? { allowed: before.allowed, expiresAt: before.expiresAt } : 'role default',
          to,
        },
      });

    if (body.allowed === null) {
      await app.prisma.userPermission.deleteMany({ where: { userId, capability: body.capability } });
      await audit('role default');
      return { capability: body.capability, allowed: defaultsFor(target.role).includes(body.capability), fromRole: true, expiresAt: null };
    }
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) return reply.code(400).send({ error: 'The expiry must be in the future.' });
    await app.prisma.userPermission.upsert({
      where: { userId_capability: { userId, capability: body.capability } },
      create: { userId, capability: body.capability, allowed: body.allowed, expiresAt },
      update: { allowed: body.allowed, expiresAt },
    });
    await audit({ allowed: body.allowed, expiresAt });
    return { capability: body.capability, allowed: body.allowed, fromRole: false, expiresAt };
  });
}
