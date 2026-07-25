import type { FastifyReply, FastifyRequest } from 'fastify';

export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user || !roles.includes(req.user.role)) {
      reply.code(403).send({ error: 'Forbidden' });
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
