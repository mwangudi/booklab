import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole, branchScope, isAdmin } from '../middleware/authGuard.js';
import { SYNC_ROLE, enqueueOutbox } from '../lib/outbox.js';
import { auditRequest } from '../lib/audit.js';

const expenseSchema = z.object({
  branchId: z.number().int().nullable().optional(),
  category: z.enum(['RENT', 'SALARY', 'UTILITIES', 'SUPPLIES', 'MARKETING', 'MISC']),
  description: z.string().optional(),
  amount: z.number().positive(),
  incurredAt: z.string().optional(),
});

export async function expenseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  // Expense amounts (salaries, rent) are management information, not till data.
  app.get('/', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { branchId, from, to } = req.query as { branchId?: string; from?: string; to?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    return app.prisma.expense.findMany({
      where: { branchId: scoped, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } },
      include: { branch: true },
      orderBy: { incurredAt: 'desc' },
      take: 500,
    });
  });

  app.post('/', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const body = expenseSchema.parse(req.body);
    let branchId = body.branchId ?? null;
    if (!isAdmin(req)) {
      if (req.user?.branchId == null) return reply.code(403).send({ error: 'No branch assigned' });
      if (branchId != null && branchId !== req.user.branchId) return reply.code(403).send({ error: 'Forbidden: another branch' });
      branchId = req.user.branchId;
    }
    const created = await app.prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          category: body.category,
          description: body.description,
          amount: body.amount,
          branchId,
          originBranchId: branchId ?? undefined,
          incurredAt: body.incurredAt ? new Date(body.incurredAt) : undefined,
        },
      });
      if (SYNC_ROLE === 'branch') {
        const branch = branchId != null ? await tx.branch.findUnique({ where: { id: branchId }, select: { uuid: true } }) : null;
        await enqueueOutbox(tx, 'expense', exp.uuid, {
          branchUuid: branch?.uuid ?? null,
          category: exp.category,
          description: exp.description,
          amount: Number(exp.amount),
          incurredAt: exp.incurredAt,
        });
      }
      return exp;
    });
    await auditRequest(app.prisma, req, {
      entity: 'expense',
      entityId: created.id,
      branchId,
      action: 'CREATE',
      details: { category: created.category, amount: Number(created.amount), description: created.description },
    });
    reply.code(201).send(created);
  });
}
