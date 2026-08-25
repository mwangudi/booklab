import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { auditRequest, diff, writeAudit } from '../lib/audit.js';

// The sign-in field carries either a username or an email, so it cannot be
// validated as an email. `username` is accepted too for newer clients.
const loginSchema = z
  .object({
    email: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((b) => (b.email ?? b.username ?? '').trim().length > 0, {
    message: 'Username or email is required',
    path: ['email'],
  });

const USERNAME = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Use lower-case letters, numbers, dots, dashes or underscores.');

const createUserSchema = z.object({
  email: z.string().email(),
  username: USERNAME.nullable().optional(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
  branchId: z.number().int().nullable().optional(),
});
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: USERNAME.nullable().optional(),
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']).optional(),
  branchId: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const identifier = (body.username ?? body.email ?? '').trim().toLowerCase();
    const user = await app.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
      include: { branch: { select: { name: true } } },
    });
    // Failed attempts are recorded (without the password) so break-in attempts are visible.
    if (!user) {
      await writeAudit(app.prisma, { entity: 'auth', action: 'LOGIN_FAILED', details: { email: identifier, reason: 'unknown email' }, ip: req.ip });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    if (!user.active) {
      await writeAudit(app.prisma, { userId: user.id, entity: 'auth', action: 'LOGIN_BLOCKED', details: { email: identifier, reason: 'deactivated' }, ip: req.ip });
      return reply.code(403).send({ error: 'Account is deactivated.' });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      await writeAudit(app.prisma, { userId: user.id, entity: 'auth', action: 'LOGIN_FAILED', details: { email: identifier, reason: 'bad password' }, ip: req.ip });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const token = app.jwt.sign({ id: user.id, role: user.role, branchId: user.branchId }, { expiresIn: '12h' });
    await writeAudit(app.prisma, { userId: user.id, branchId: user.branchId, entity: 'auth', action: 'LOGIN', details: { email: user.email, role: user.role }, ip: req.ip });
    return {
      token,
      user: { id: user.id, email: user.email, username: user.username, name: user.name, role: user.role, branchId: user.branchId, branchName: user.branch?.name ?? null },
    };
  });

  app.get('/me', { preHandler: authGuard }, async (req) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, username: true, name: true, role: true, branchId: true, branch: { select: { name: true } } },
    });
    return user ? { ...user, branchName: user.branch?.name ?? null } : null;
  });

  app.get('/users', { preHandler: [authGuard, requireRole('ADMIN')] }, async () =>
    app.prisma.user.findMany({
      select: { id: true, email: true, username: true, name: true, role: true, active: true, branchId: true, branch: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
  );

  app.post('/users', { preHandler: [authGuard, requireRole('ADMIN')] }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await app.prisma.user
      .create({
        data: {
          email: body.email.trim().toLowerCase(),
          username: body.username?.trim().toLowerCase() || null,
          name: body.name,
          role: body.role,
          branchId: body.branchId ?? null,
          passwordHash,
        },
        select: { id: true, email: true, username: true, name: true, role: true, active: true, branchId: true },
      })
      .catch((e: { code?: string }) => {
        if (e.code === 'P2002') throw Object.assign(new Error('That email or username is already in use.'), { statusCode: 409 });
        throw e;
      });
    await auditRequest(app.prisma, req, {
      entity: 'user',
      entityId: created.id,
      branchId: created.branchId,
      action: 'CREATE',
      details: { email: created.email, role: created.role },
    });
    reply.code(201).send(created);
  });

  app.patch('/users/:id', { preHandler: [authGuard, requireRole('ADMIN')] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid user id' });
    const body = updateUserSchema.parse(req.body);
    const before = await app.prisma.user.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'User not found' });

    // An admin must not be able to lock everyone out of the system.
    const losingAdmin = (body.role !== undefined && body.role !== 'ADMIN') || body.active === false;
    if (before.role === 'ADMIN' && losingAdmin) {
      const otherAdmins = await app.prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
      if (otherAdmins === 0) return reply.code(409).send({ error: 'This is the last active administrator. Promote another admin first.' });
    }

    const data: Record<string, unknown> = {};
    if (body.email !== undefined) data.email = body.email.trim().toLowerCase();
    if (body.username !== undefined) data.username = body.username?.trim().toLowerCase() || null;
    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.branchId !== undefined) data.branchId = body.branchId;
    if (body.active !== undefined) data.active = body.active;
    if (body.password !== undefined) data.passwordHash = await bcrypt.hash(body.password, 10);
    const updated = await app.prisma.user
      .update({
        where: { id },
        data,
        select: { id: true, email: true, username: true, name: true, role: true, active: true, branchId: true },
      })
      .catch((e: { code?: string }) => {
        if (e.code === 'P2002') throw Object.assign(new Error('That email or username is already in use.'), { statusCode: 409 });
        throw e;
      });
    await auditRequest(app.prisma, req, {
      entity: 'user',
      entityId: id,
      branchId: updated.branchId,
      action: body.password !== undefined ? 'UPDATE_WITH_PASSWORD_RESET' : 'UPDATE',
      details: { email: before.email, changes: diff(before as unknown as Record<string, unknown>, data) },
    });
    return updated;
  });
}
