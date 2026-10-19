import type { FastifyReply, FastifyRequest } from 'fastify';

export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  // The token is a snapshot from sign-in and lives 12 hours. Check the account as
  // it is now, so a deactivation, archive, demotion or branch move takes effect on
  // the next request rather than when the token expires.
  const user = await req.server.prisma.user.findUnique({
    where: { id: req.user.id },
    select: { active: true, deletedAt: true, role: true, branchId: true },
  });
  if (!user || !user.active || user.deletedAt) {
    return reply.code(401).send({ error: 'Account is deactivated. Contact an administrator.' });
  }
  req.user.role = user.role;
  req.user.branchId = user.branchId;
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

export const isAdmin = (req: FastifyRequest) => req.user?.role === 'ADMIN';

/**
 * Resolve the effective branchId filter for a request.
 * - ADMIN: the requested branch or `undefined` (= all branches).
 * - Non-ADMIN: forced to their assigned branch; 403 if none or if they request another.
 */
export function branchScope(
  req: FastifyRequest,
  reply: FastifyReply,
  requested?: number | null,
): number | undefined {
  if (isAdmin(req)) return requested ?? undefined;
  const myBranch = req.user?.branchId;
  if (myBranch == null) {
    reply.code(403).send({ error: 'No branch assigned to this user' });
    throw new Error('No branch assigned');
  }
  if (requested != null && requested !== myBranch) {
    reply.code(403).send({ error: 'Forbidden: branch mismatch' });
    throw new Error('Branch mismatch');
  }
  return myBranch;
}

/** Force a branchId for a write. Admin may write any branch (must pass one); others their own. */
export function enforceWriteBranch(
  req: FastifyRequest,
  reply: FastifyReply,
  requested?: number | null,
): number {
  if (isAdmin(req)) {
    if (requested == null) {
      reply.code(400).send({ error: 'branchId required' });
      throw new Error('branchId required');
    }
    return requested;
  }
  if (req.user?.branchId == null) {
    reply.code(403).send({ error: 'No branch assigned to this user' });
    throw new Error('No branch assigned');
  }
  if (requested != null && requested !== req.user.branchId) {
    reply.code(403).send({ error: 'Forbidden: cannot write to another branch' });
    throw new Error('Branch mismatch');
  }
  return req.user.branchId;
}

/**
 * Whether the caller may open or act on a document belonging to `branchId`. Admins
 * see everything; others see their own branch's documents and head-office ones
 * (no branch), which every branch already sees in its lists.
 */
export function ownsBranchRecord(req: FastifyRequest, branchId: number | null | undefined): boolean {
  if (isAdmin(req)) return true;
  return branchId == null || branchId === req.user?.branchId;
}
