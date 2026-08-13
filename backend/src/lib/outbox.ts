import type { Prisma, PrismaClient } from '@prisma/client';
import type { StockMoveType } from './enums.js';

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

/**
 * Queue a document's *current* state. Documents are upserted by uuid on the
 * cloud, so re-queueing the whole thing after any change is both simpler and
 * safer than tracking which fields moved.
 */
export async function queueInvoice(tx: Tx, invoiceId: number): Promise<void> {
  if (SYNC_ROLE !== 'branch') return;
  const inv = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      branch: { select: { uuid: true } },
      customer: { select: { uuid: true } },
      items: { include: { book: { select: { uuid: true } } }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!inv) return;
  const sale = inv.saleId ? await tx.sale.findUnique({ where: { id: inv.saleId }, select: { uuid: true } }) : null;
  await enqueueOutbox(tx, 'invoice', inv.uuid, {
    number: inv.number,
    deliveryNoteNo: inv.deliveryNoteNo,
    branchUuid: inv.branch?.uuid ?? null,
    customerUuid: inv.customer.uuid,
    status: inv.status,
    priceTier: inv.priceTier,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    deliveredAt: inv.deliveredAt,
    receivedBy: inv.receivedBy,
    receivedIdNo: inv.receivedIdNo,
    receivedDesignation: inv.receivedDesignation,
    notes: inv.notes,
    chargeVat: inv.chargeVat,
    vatMode: inv.vatMode,
    subtotal: Number(inv.subtotal),
    vatTotal: Number(inv.vatTotal),
    total: Number(inv.total),
    saleUuid: sale?.uuid ?? null,
    createdAt: inv.createdAt,
    deletedAt: inv.deletedAt,
    items: inv.items.map((i) => ({
      uuid: i.uuid,
      bookUuid: i.book?.uuid ?? null,
      description: i.description,
      unit: i.unit,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      vatRate: Number(i.vatRate),
      netAmount: Number(i.netAmount),
      vatAmount: Number(i.vatAmount),
      total: Number(i.total),
      sortOrder: i.sortOrder,
    })),
  });
}

export async function queueGoodsReceipt(tx: Tx, receiptId: number): Promise<void> {
  if (SYNC_ROLE !== 'branch') return;
  const grn = await tx.goodsReceipt.findUnique({
    where: { id: receiptId },
    include: {
      branch: { select: { uuid: true } },
      supplier: { select: { uuid: true } },
      items: { include: { book: { select: { uuid: true } } }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!grn) return;
  await enqueueOutbox(tx, 'goodsReceipt', grn.uuid, {
    number: grn.number,
    branchUuid: grn.branch.uuid,
    supplierUuid: grn.supplier.uuid,
    deliveryNoteNo: grn.deliveryNoteNo,
    invoiceNo: grn.invoiceNo,
    receivedAt: grn.receivedAt,
    status: grn.status,
    notes: grn.notes,
    totalCost: Number(grn.totalCost),
    postedAt: grn.postedAt,
    createdAt: grn.createdAt,
    deletedAt: grn.deletedAt,
    items: grn.items.map((i) => ({
      uuid: i.uuid,
      bookUuid: i.book.uuid,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      unitCost: Number(i.unitCost),
      total: Number(i.total),
      sortOrder: i.sortOrder,
    })),
  });
}

export async function queueCustomerPayment(tx: Tx, paymentId: number): Promise<void> {
  if (SYNC_ROLE !== 'branch') return;
  const p = await tx.customerPayment.findUnique({
    where: { id: paymentId },
    include: { customer: { select: { uuid: true } }, invoice: { select: { uuid: true } } },
  });
  if (!p) return;
  await enqueueOutbox(tx, 'customerPayment', p.uuid, {
    customerUuid: p.customer.uuid,
    invoiceUuid: p.invoice?.uuid ?? null,
    amount: Number(p.amount),
    paidAt: p.paidAt,
    method: p.method,
    reference: p.reference,
    note: p.note,
  });
}

export async function queueSupplierPayment(tx: Tx, paymentId: number): Promise<void> {
  if (SYNC_ROLE !== 'branch') return;
  const p = await tx.supplierPayment.findUnique({
    where: { id: paymentId },
    include: { supplier: { select: { uuid: true } }, receipt: { select: { uuid: true } } },
  });
  if (!p) return;
  await enqueueOutbox(tx, 'supplierPayment', p.uuid, {
    supplierUuid: p.supplier.uuid,
    receiptUuid: p.receipt?.uuid ?? null,
    amount: Number(p.amount),
    paidAt: p.paidAt,
    method: p.method,
    reference: p.reference,
    note: p.note,
  });
}
