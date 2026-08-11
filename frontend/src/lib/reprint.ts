import { api } from './api';
import { dateTime, num } from './format';
import { printReceipt, type ReceiptData } from './printReceipt';
import type { Sale } from '../types';

/** Turn a stored sale into printable receipt data. */
export function receiptFromSale(sale: Sale, opts: { copy?: number; reprintedBy?: string } = {}): ReceiptData {
  return {
    receiptNo: sale.id,
    dateTime: dateTime(sale.createdAt),
    branchName: sale.branch?.name,
    branchLocation: sale.branch?.location,
    cashier: sale.user?.name,
    paymentMethod: sale.paymentMethod,
    mpesaRef: sale.mpesaRef,
    items: sale.items.map((i) => ({
      title: i.book?.title ?? `Item #${i.bookId}`,
      qty: i.quantity,
      unitPrice: num(i.unitPrice),
    })),
    total: num(sale.total),
    subtotal: num(sale.subtotal ?? sale.total),
    discount: num(sale.discount ?? 0),
    voided: !!sale.voidedAt,
    copy: opts.copy,
    reprintedBy: opts.reprintedBy,
    reprintedAt: opts.copy ? dateTime(new Date().toISOString()) : undefined,
  };
}

/**
 * Reprint a receipt. The server records the copy so the paper can be stamped
 * with its duplicate number and the reprint lands in the audit trail.
 */
export async function reprintSale(saleId: number, reprintedBy?: string): Promise<Sale> {
  const sale = await api.post<Sale>(`/api/sales/${saleId}/reprint`);
  printReceipt(receiptFromSale(sale, { copy: sale.reprintCount ?? 1, reprintedBy }));
  return sale;
}
