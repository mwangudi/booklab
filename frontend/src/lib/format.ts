// Number & date formatting helpers. Prisma serialises Decimal columns to strings
// over JSON, so `num()` coerces `string | number | null` safely everywhere.

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Rounded integer with thousands separators, e.g. 1234.5 -> "1,235". */
export const fmt = (v: unknown): string => Math.round(num(v)).toLocaleString('en-KE');

/** Currency in KES, e.g. "KES 1,235". */
export const money = (v: unknown): string => `KES ${fmt(v)}`;

/** Percent from a 0..1 ratio, e.g. 0.324 -> "32.4%". */
export const pct = (ratio: unknown, digits = 1): string => `${(num(ratio) * 100).toFixed(digits)}%`;

export const dateShort = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const dateTime = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** ISO date (yyyy-mm-dd) for <input type="date"> defaults, in LOCAL time.
 *  toISOString() would shift to UTC and, east of Greenwich, return the previous day. */
export const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** First day of the current month as yyyy-mm-dd. */
export const startOfMonth = (): string => {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const today = (): string => isoDate(new Date());
