import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  userId?: number | null;
  branchId?: number | null;
  entity: string;
  entityId?: number | null;
  action: string;
  details?: unknown;
  ip?: string | null;
}

/** Who is acting, and from where — pulled straight off the verified JWT + socket. */
export function actor(req: FastifyRequest): { userId: number | null; ip: string } {
  return { userId: req.user?.id ?? null, ip: req.ip };
}

/**
 * Append a row to the tamper-evident audit trail. Never throws — an audit
 * failure must not roll back or block the business operation it describes.
 */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        branchId: entry.branchId ?? null,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        action: entry.action,
        details: entry.details === undefined ? null : JSON.stringify(entry.details),
        ip: entry.ip ?? null,
      },
    });
  } catch {
    /* auditing is best-effort */
  }
}

/** Convenience: audit an action performed by the caller of `req`. */
export function auditRequest(db: Db, req: FastifyRequest, entry: Omit<AuditEntry, 'userId' | 'ip'>): Promise<void> {
  return writeAudit(db, { ...entry, ...actor(req) });
}

/** Field-level before/after, with credentials stripped so they never reach the trail. */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const norm = (v: unknown) => (v == null ? null : typeof v === 'object' ? String(v) : v);
  for (const [key, to] of Object.entries(after)) {
    if (key === 'passwordHash' || key === 'password') continue;
    const from = before?.[key];
    if (norm(from) !== norm(to)) out[key] = { from: norm(from), to: norm(to) };
  }
  return out;
}

