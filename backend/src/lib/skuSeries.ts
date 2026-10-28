/**
 * SKU series: codes like PL-0714, BS-1173 or ST04041 are a prefix, an optional
 * separator and a zero-padded number. Grouping the catalogue's codes this way gives
 * the next free code in each series for the new-product form.
 */

export interface SkuSeries {
  /** Letters before the number, e.g. "PL". */
  prefix: string;
  /** What sits between prefix and number: "-" or "" for codes like ST04041. */
  separator: string;
  /** Width the number is padded to (the widest seen in the series). */
  digits: number;
  /** Products using the series, archived ones included: their codes stay taken. */
  count: number;
  /** Highest number in use. */
  last: number;
  /** The code to suggest: one past the highest, skipping any that already exist. */
  next: string;
  /** Live products in the series per category, most first. */
  categories: Array<{ category: string; count: number }>;
}

const PATTERN = /^([A-Za-z]{1,8})([-_/]?)(\d{1,9})$/;

export function skuSeries(rows: Array<{ sku: string; category: string | null; deletedAt: Date | null }>): SkuSeries[] {
  const taken = new Set(rows.map((r) => r.sku.trim().toUpperCase()));
  const groups = new Map<string, { prefix: string; separator: string; digits: number; count: number; last: number; cats: Map<string, number> }>();

  for (const r of rows) {
    const m = PATTERN.exec(r.sku.trim());
    if (!m) continue;
    const prefix = m[1].toUpperCase();
    const key = `${prefix}${m[2]}`;
    const g = groups.get(key) ?? { prefix, separator: m[2], digits: 0, count: 0, last: 0, cats: new Map() };
    g.count += 1;
    g.digits = Math.max(g.digits, m[3].length);
    g.last = Math.max(g.last, Number(m[3]));
    if (!r.deletedAt) {
      const c = r.category || 'Other';
      g.cats.set(c, (g.cats.get(c) ?? 0) + 1);
    }
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => {
      let n = g.last + 1;
      let next = format(g.prefix, g.separator, n, g.digits);
      while (taken.has(next.toUpperCase())) next = format(g.prefix, g.separator, ++n, g.digits);
      return {
        prefix: g.prefix,
        separator: g.separator,
        digits: g.digits,
        count: g.count,
        last: g.last,
        next,
        categories: [...g.cats.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function format(prefix: string, separator: string, n: number, digits: number): string {
  return `${prefix}${separator}${String(n).padStart(digits, '0')}`;
}
