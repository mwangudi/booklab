/**
 * Document numbers are `PREFIX-CODE-NNNN`, the sequence read back from the numbers
 * already issued with that stem.
 *
 * Invoices and delivery notes use the year as the code on the main system
 * (INV-2026-0007: one company-wide series a year, no branch shown to customers) and
 * year + branch code on a branch laptop (INV-2026-KAP-0007), so a number minted
 * offline can never collide. Goods receipts keep the branch code (GRN-KAP-0007).
 * Older invoices (INV-LUA-0001) keep the numbers they were issued with.
 */

/** Code used when a document is raised centrally rather than at a branch. */
export const HEAD_OFFICE_CODE = 'HQ';

export function seriesStem(prefix: string, branchCode: string): string {
  return `${prefix}-${branchCode}-`;
}

export function nextInSeries(prefix: string, branchCode: string, issued: Array<string | null>): string {
  const stem = seriesStem(prefix, branchCode);
  let max = 0;
  for (const n of issued) {
    if (!n?.startsWith(stem)) continue;
    const v = Number(n.slice(stem.length));
    if (Number.isInteger(v) && v > max) max = v;
  }
  return `${stem}${String(max + 1).padStart(4, '0')}`;
}
