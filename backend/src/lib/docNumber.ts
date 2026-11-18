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

import { randomInt } from 'node:crypto';

/** Letters and digits that cannot be misread for one another (no 0/O, 1/I/L). */
const REF_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const REF_ALPHABET = `${REF_LETTERS}23456789`;

/**
 * A short random code for links, e.g. XR56LK (23 × 31^5 ≈ 656 million possibilities).
 * It always starts with a letter, so it can never be mistaken for a numeric id.
 */
export function newRef(length = 6): string {
  let out = REF_LETTERS[randomInt(REF_LETTERS.length)];
  for (let i = 1; i < length; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return out;
}

/**
 * The record a page address names: its link code (e.g. XR56LK) or — so old links and
 * bookmarks keep working — its numeric id. Null when the parameter is neither.
 */
export async function idFromParam(
  param: string,
  findByRef: (ref: string) => Promise<{ id: number } | null>,
): Promise<number | null> {
  if (/^\d+$/.test(param)) {
    const n = Number(param);
    return Number.isSafeInteger(n) ? n : null;
  }
  if (!/^[A-Za-z0-9]{4,12}$/.test(param)) return null;
  return (await findByRef(param.toUpperCase()))?.id ?? null;
}

/** The shape of a link code we accept from a branch laptop. */
export const isRef = (v: unknown): v is string => typeof v === 'string' && /^[A-HJ-NP-Z][A-HJ-NP-Z2-9]{5}$/.test(v);

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
