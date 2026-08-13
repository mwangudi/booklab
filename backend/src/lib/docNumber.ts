/**
 * Trading documents are numbered per branch — INV-KAP-0007, not INV-0007 — so two
 * branches working offline can never mint the same number. The sequence is read
 * back from the numbers already issued for that branch, which is what a branch
 * database holds: only its own documents.
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
