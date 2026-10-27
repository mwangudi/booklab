import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Save, Search, Undo2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { fmt, num } from '../lib/format';
import type { Book, Stock } from '../types';
import { Alert, Button } from './ui';

type Col = 'price' | 'priceWholesale' | 'priceSchool' | 'quantity';
/** Rows per page: a few thousand live inputs would make every keystroke slow. */
const PAGE = 100;
const LABEL: Record<Col, string> = { price: 'Retail', priceWholesale: 'Wholesale', priceSchool: 'School', quantity: 'Quantity' };

interface Props {
  /** Live (not archived) products to show, already filtered by category. */
  books: Book[];
  /** null edits the catalogue (admins); a branch edits that branch's prices and stock. */
  branchId: number | null;
  branchName: string;
  shelf: Map<number, Stock>;
  onSaved: () => void;
  onClose: () => void;
  /** Told how many unsaved changes there are, so the page can guard a branch switch. */
  onDirty?: (changes: number) => void;
  /** Changing this (e.g. the category shown) starts the grid afresh. */
  resetKey?: string;
}

const key = (bookId: number, col: Col) => `${bookId}:${col}`;
const text = (v: unknown) => (v == null || v === '' ? '' : String(num(v)));
/** Accept what people paste from a spreadsheet: "KES 1,200.00" → "1200.00". */
const clean = (s: string) => s.replace(/KES|Ksh|,|\s/gi, '');

/**
 * Spreadsheet-style editing of prices and quantities for many products at once.
 * Arrow keys and Enter move between cells, Escape undoes a cell, and a block pasted
 * from Excel fills down and across from the cell you are in. Nothing is saved until
 * Save, which sends every change in one go — all or nothing.
 */
export function ProductGrid({ books, branchId, branchName, shelf, onSaved, onClose, onDirty, resetKey }: Props) {
  const catalogue = branchId == null;
  const cols: Col[] = catalogue ? ['price', 'priceWholesale', 'priceSchool'] : ['price', 'priceWholesale', 'priceSchool', 'quantity'];

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // The value a cell starts from, and the greyed hint shown when it is blank.
  const original = (b: Book, col: Col): string => {
    if (catalogue) {
      // An unpriced product (retail 0) shows a blank cell waiting for its price.
      if (col === 'price') return num(b.unitPrice) > 0 ? text(b.unitPrice) : '';
      if (col === 'priceWholesale') return text(b.priceWholesale);
      return text(b.priceSchool);
    }
    const s = shelf.get(b.id);
    if (col === 'quantity') return String(s?.quantity ?? 0);
    return text(s?.[col]);
  };
  const hint = (b: Book, col: Col): string => {
    const retail = catalogue ? num(b.unitPrice) : num(shelf.get(b.id)?.price ?? b.unitPrice);
    const shown = (v: unknown) => (num(v) > 0 ? text(v) : '');
    if (col === 'price') return catalogue ? 'no price' : shown(b.unitPrice) || 'no price';
    if (col === 'priceWholesale') return shown((catalogue ? null : b.priceWholesale) ?? retail);
    if (col === 'priceSchool') return shown((catalogue ? null : b.priceSchool) ?? retail);
    return '';
  };

  const valueOf = (b: Book, col: Col) => drafts[key(b.id, col)] ?? original(b, col);
  const problem = (b: Book, col: Col): string | null => {
    const v = clean(valueOf(b, col));
    if (col === 'quantity') return /^\d+$/.test(v) ? null : 'A whole number, 0 or more';
    if (v === '') return catalogue && col === 'price' ? 'Every product needs a retail price' : null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? null : 'A price above 0';
  };
  const isChanged = (b: Book, col: Col) => {
    const d = drafts[key(b.id, col)];
    if (d === undefined) return false;
    const a = clean(d);
    const o = original(b, col);
    return a === '' || o === '' ? a !== o : Number(a) !== Number(o);
  };

  // A few hundred rows: cheap enough to work out on every render.
  const changes: Array<{ book: Book; cols: Col[] }> = [];
  for (const b of books) {
    const c = cols.filter((col) => isChanged(b, col));
    if (c.length) changes.push({ book: b, cols: c });
  }
  const changedCells = changes.reduce((n, c) => n + c.cols.length, 0);
  const invalid = changes.some((c) => c.cols.some((col) => problem(c.book, col)));

  const q = search.trim().toLowerCase();
  // Judged on the saved figures, so a row does not vanish while you are typing into it.
  const unpriced = (b: Book) => (catalogue ? num(b.unitPrice) : num(shelf.get(b.id)?.price ?? b.unitPrice)) <= 0;
  const visible = books.filter((b) => {
    if (changedOnly && !cols.some((col) => isChanged(b, col))) return false;
    if (unpricedOnly && !unpriced(b)) return false;
    return !q || `${b.title} ${b.sku} ${b.category ?? ''}`.toLowerCase().includes(q);
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE;
  const rows = visible.slice(start, start + PAGE);
  const unpricedCount = books.filter(unpriced).length;
  useEffect(() => setPage(0), [search, changedOnly, unpricedOnly, branchId, resetKey]);

  useEffect(() => onDirty?.(changedCells), [changedCells, onDirty]);

  // Leaving the page with unsaved edits loses them, so the browser asks first.
  useEffect(() => {
    if (changedCells === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changedCells]);

  // Switching branch, catalogue or category starts again from the figures shown.
  useEffect(() => {
    setDrafts({});
    setDone(null);
    setError(null);
  }, [branchId, resetKey]);

  const setCell = (bookId: number, col: Col, v: string) => setDrafts((d) => ({ ...d, [key(bookId, col)]: v }));
  const revert = (bookId: number, col: Col) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[key(bookId, col)];
      return next;
    });

  const focusCell = (r: number, c: number) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number, b: Book, col: Col) => {
    const el = e.currentTarget;
    // A freshly entered cell has its whole value selected, as in Excel: arrows move
    // straight on. Once you are editing inside the text they move the caret first.
    const whole = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    const atEnd = whole || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
    const atStart = whole || (el.selectionStart === 0 && el.selectionEnd === 0);
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault();
      focusCell(r - 1, c);
    } else if (e.key === 'ArrowRight' && atEnd) {
      e.preventDefault();
      focusCell(r, c + 1);
    } else if (e.key === 'ArrowLeft' && atStart) {
      e.preventDefault();
      focusCell(r, c - 1);
    } else if (e.key === 'Escape') {
      revert(b.id, col);
    }
  };

  /** A block copied from Excel arrives as tab-separated columns and newline-separated rows. */
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(raw.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const block = raw.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
    setDrafts((d) => {
      const next = { ...d };
      block.forEach((cells, i) => {
        const b = visible[start + r + i];
        if (!b) return;
        cells.forEach((cell, j) => {
          const col = cols[c + j];
          if (col) next[key(b.id, col)] = clean(cell);
        });
      });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      const rows = changes.map(({ book, cols: cs }) => {
        const row: Record<string, number | null> & { bookId: number } = { bookId: book.id };
        for (const col of cs) {
          const v = clean(valueOf(book, col));
          row[col] = col === 'quantity' ? Number(v) : v === '' ? null : Math.round(Number(v) * 100) / 100;
        }
        return row;
      });
      const total = { products: 0, prices: 0, quantities: 0, netUnits: 0 };
      // Each batch is all-or-nothing on the server.
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await api.post<typeof total>('/api/stock/grid', { branchId, rows: rows.slice(i, i + 1000) });
        total.products += r.products;
        total.prices += r.prices;
        total.quantities += r.quantities;
        total.netUnits += r.netUnits;
      }
      setDrafts({});
      setDone(
        `Saved ${fmt(total.products)} product${total.products === 1 ? '' : 's'}: ${fmt(total.prices)} price change${total.prices === 1 ? '' : 's'}` +
          (catalogue ? '' : `, ${fmt(total.quantities)} quantit${total.quantities === 1 ? 'y' : 'ies'} (net ${total.netUnits > 0 ? '+' : ''}${fmt(total.netUnits)} units)`) +
          '. Every change is in the audit log' + (catalogue ? '.' : ' and the stock history.'),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Nothing was changed — check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (changedCells > 0 && !window.confirm(`Discard ${changedCells} unsaved change${changedCells === 1 ? '' : 's'}?`)) return;
    onClose();
  };

  return (
    <div className="space-y-3">
      <Alert tone="blue">
        {catalogue ? (
          <>
            Editing <b>catalogue prices</b>, which every branch uses unless it sets its own. Pick a branch above to edit that
            branch’s prices and quantities instead.
          </>
        ) : (
          <>
            Editing <b>{branchName}</b>: its own prices and its quantities. A blank price uses the catalogue price shown in
            grey. Quantities are set exactly, like a stock take.
          </>
        )}{' '}
        Use the arrow keys or Enter to move, Esc to undo a cell, and paste a block straight from Excel.
      </Alert>

      {error && <Alert tone="red">{error}</Alert>}
      {done && <Alert tone="green">{done}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a product or SKU…"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} /> Changed only
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={unpricedOnly} onChange={(e) => setUnpricedOnly(e.target.checked)} /> No price yet ({fmt(unpricedCount)})
        </label>
        <Button variant="outline" onClick={() => setDrafts({})} disabled={changedCells === 0 || saving}>
          <Undo2 className="h-4 w-4" /> Discard
        </Button>
        <Button onClick={save} loading={saving} disabled={changedCells === 0 || invalid}>
          <Save className="h-4 w-4" /> Save {changedCells > 0 ? `${fmt(changedCells)} change${changedCells === 1 ? '' : 's'}` : ''}
        </Button>
        <Button variant="outline" onClick={close}>
          <X className="h-4 w-4" /> Close grid
        </Button>
      </div>
      {invalid && <p className="text-xs text-[#9b2626]">Fix the cells outlined in red before saving.</p>}

      <div className="max-h-[65vh] overflow-auto rounded-md border border-border">
        <table ref={tableRef} className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-[2] bg-muted">
            <tr>
              <th className="px-2 py-2 text-left font-semibold w-24">SKU</th>
              <th className="px-2 py-2 text-left font-semibold">Product</th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-2 text-right font-semibold w-28">
                  {LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, r) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-2 py-1 font-mono text-xs text-muted-foreground whitespace-nowrap">{b.sku}</td>
                <td className="px-2 py-1">
                  <div className="truncate max-w-[340px]" title={b.title}>{b.title}</div>
                </td>
                {cols.map((col, c) => {
                  const changed = isChanged(b, col);
                  const bad = changed && problem(b, col);
                  return (
                    <td key={col} className="p-0.5">
                      <input
                        data-r={r}
                        data-c={c}
                        inputMode={col === 'quantity' ? 'numeric' : 'decimal'}
                        value={valueOf(b, col)}
                        placeholder={hint(b, col)}
                        title={bad || (changed ? `Was ${original(b, col) || 'blank'} — Esc to undo` : undefined)}
                        onChange={(e) => setCell(b.id, col, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => onKey(e, r, c, b, col)}
                        onPaste={(e) => onPaste(e, r, c)}
                        aria-label={`${LABEL[col]} for ${b.title}`}
                        className={[
                          'w-full rounded px-2 py-1 text-right font-mono outline-none border',
                          bad ? 'border-[#9b2626] bg-[#fdf0f0]' : changed ? 'border-[#d9a441] bg-[#fdf3e0]' : 'border-transparent bg-transparent',
                          'focus:border-primary focus:bg-background placeholder:text-muted-foreground/60',
                        ].join(' ')}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={2 + cols.length} className="px-3 py-6 text-center text-muted-foreground">
                  {changedOnly ? 'No changes yet.' : 'No products match.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span>
          {visible.length === 0 ? 0 : start + 1}–{start + rows.length} of {fmt(visible.length)} shown ({fmt(books.length)} products) ·{' '}
          {fmt(changedCells)} unsaved change{changedCells === 1 ? '' : 's'} in {fmt(changes.length)} product{changes.length === 1 ? '' : 's'}, kept across pages
        </span>
        <div className="flex items-center gap-2">
          <span>
            Page <b className="text-foreground">{safePage + 1}</b> of <b className="text-foreground">{pageCount}</b>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="Previous page"
            className="rounded-md border border-input p-1 hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            aria-label="Next page"
            className="rounded-md border border-input p-1 hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
