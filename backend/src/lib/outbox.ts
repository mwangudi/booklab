import type { Prisma, PrismaClient, StockMoveType } from '@prisma/client';

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

/**
 * Create a stock movement and queue it for the cloud in one step. Every stock
 * change must go through here — a movement written directly would never reach
 * the cloud from a branch install.
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  data: {
    branchId: number;
    bookId: number;
    delta: number;
    type: StockMoveType;
    note?: string | null;
    userId?: number | null;
    originBranchId?: number | null;
  },
) {
  const move = await tx.stockMovement.create({
    data: {
      branchId: data.branchId,
      bookId: data.bookId,
      delta: data.delta,
      type: data.type,
      note: data.note ?? null,
      userId: data.userId ?? null,
      originBranchId: data.originBranchId ?? data.branchId,
    },
    include: { branch: { select: { uuid: true } }, book: { select: { uuid: true } } },
  });
  await enqueueOutbox(tx, 'stockMovement', move.uuid, {
    branchUuid: move.branch.uuid,
    bookUuid: move.book.uuid,
    delta: move.delta,
    type: move.type,
    note: move.note,
    createdAt: move.createdAt,
  });
  return move;
}
