// Minimal CSV parsing + mapping to catalogue import rows. No dependencies.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export interface ImportItem {
  title: string;
  category?: string;
  sku?: string;
  author?: string;
  isbn?: string;
  unitPrice?: number;
  costPrice?: number;
  priceWholesale?: number;
  priceSchool?: number;
}

const HEADER_MAP: Record<string, keyof ImportItem> = {
  itemname: 'title', item: 'title', name: 'title', title: 'title', description: 'title', product: 'title', productname: 'title',
  category: 'category', cat: 'category', type: 'category',
  sku: 'sku', code: 'sku', itemcode: 'sku', productcode: 'sku',
  author: 'author', publisher: 'author',
  isbn: 'isbn',
  cost: 'costPrice', costprice: 'costPrice', buying: 'costPrice', buyingprice: 'costPrice', cogs: 'costPrice', buy: 'costPrice',
  retail: 'unitPrice', retailprice: 'unitPrice', price: 'unitPrice', sellingprice: 'unitPrice', selling: 'unitPrice', unitprice: 'unitPrice', sell: 'unitPrice',
  wholesale: 'priceWholesale', wholesaleprice: 'priceWholesale',
  school: 'priceSchool', schoolprice: 'priceSchool',
};

const normHeader = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const NUMERIC = new Set<keyof ImportItem>(['unitPrice', 'costPrice', 'priceWholesale', 'priceSchool']);

const num = (s: string): number | undefined => {
  const cleaned = String(s).replace(/[^0-9.\-]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

export function csvToItems(text: string): { items: ImportItem[]; headers: string[]; unmapped: string[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { items: [], headers: [], unmapped: [] };
  const headers = rows[0];
  const cols = headers.map((h) => HEADER_MAP[normHeader(h)]);
  const unmapped = headers.filter((_, i) => !cols[i]);
  const items: ImportItem[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const it: ImportItem = { title: '' };
    cols.forEach((field, i) => {
      if (!field) return;
      const raw = (row[i] ?? '').trim();
      if (raw === '') return;
      if (NUMERIC.has(field)) {
        const n = num(raw);
        if (n !== undefined) (it[field] as number) = n;
      } else {
        (it[field] as string) = raw;
      }
    });
    if (it.title) items.push(it);
  }
  return { items, headers, unmapped };
}
