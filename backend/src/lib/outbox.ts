import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Sync role of this runtime.
 * - 'cloud'  : master server. Never enqueues outbox rows.
 * - 'branch' : per-branch desktop install. Records local writes to the Outbox so the
 *              sync runner can push them to the cloud when online.
 */
export const SYNC_ROLE = (process.env.SYNC_ROLE ?? 'cloud') as 'cloud' | 'branch';

type Tx = Prisma.TransactionClient | PrismaClient;

/** Record a local change for later push to the cloud. No-op on the cloud master. */
export async function enqueueOutbox(
  tx: Tx,
  entity: string,
  entityUuid: string,
  payload: unknown,
  op: 'upsert' | 'delete' = 'upsert',
): Promise<void> {
  if (SYNC_ROLE !== 'branch') return;
  await tx.outbox.create({
    data: { entity, entityUuid, op, payload: JSON.stringify(payload) },
  });
}
