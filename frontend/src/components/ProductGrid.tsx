import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Save, Search, Undo2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCan } from '../lib/permissions';
import { fmt, num } from '../lib/format';
import type { Book, Stock } from '../types';
import { Alert, Button } from './ui';

type Col = 'costPrice' | 'price' | 'priceWholesale' | 'priceSchool' | 'quantity' | 'add';
/** Rows per page: a few thousand live inputs would make every keystroke slow. */
const PAGE = 100;
const LABEL: Record<Col, string> = { costPrice: 'Cost', price: 'Retail', priceWholesale: 'Wholesale', priceSchool: 'School', quantity: 'Quantity', add: 'Add stock' };

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
  // Cost drives COGS and profit, so (as on the stock page) a cashier sees it but cannot change it.
  const { role } = useAuth();
  const costEditable = role !== 'CASHIER';
  // Adding stock is receiving goods, so it needs the same right as the stock intake page.
  const canReceive = useCan()('stock.intake');
  const cols: Col[] = [
    ...(costEditable ? (['costPrice'] as Col[]) : []),
    'price',
    'priceWholesale',
    'priceSchool',
    ...(catalogue ? [] : (['quantity'] as Col[])),
    ...(!catalogue && canReceive ? (['add'] as Col[]) : []),
  ];

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [noCostOnly, setNoCostOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // The value a cell starts from, and the greyed hint shown when it is blank.
  const original = (b: Book, col: Col): string => {
    if (catalogue) {
      // An unpriced product (retail or cost 0) shows a blank cell waiting for its figure.
      if (col === 'price') return num(b.unitPrice) > 0 ? text(b.unitPrice) : '';
      if (col === 'costPrice') return num(b.costPrice) > 0 ? text(b.costPrice) : '';
      if (col === 'priceWholesale') return text(b.priceWholesale);
      return text(b.priceSchool);
    }
    const s = shelf.get(b.id);
    if (col === 'quantity') return String(s?.quantity ?? 0);
    // "Add stock" starts empty: it is what arrived, not a stored figure.
    if (col === 'add') return '';
    return text(s?.[col]);
  };
  const hint = (b: Book, col: Col): string => {
    const retail = catalogue ? num(b.unitPrice) : num(shelf.get(b.id)?.price ?? b.unitPrice);
    const shown = (v: unknown) => (num(v) > 0 ? text(v) : '');
    if (col === 'costPrice') return catalogue ? 'no cost' : shown(b.costPrice) || 'no cost';
    if (col === 'price') return catalogue ? 'no price' : shown(b.unitPrice) || 'no price';
    if (col === 'priceWholesale') return shown((catalogue ? null : b.priceWholesale) ?? retail);
    if (col === 'priceSchool') return shown((catalogue ? null : b.priceSchool) ?? retail);
    if (col === 'add') return '+';
    return '';
  };

  const valueOf = (b: Book, col: Col) => drafts[key(b.id, col)] ?? original(b, col);

  /**
   * What the goods cost, as it will be once saved: the cost being typed, else this
   * branch's own cost, else the catalogue's (the grey hint in a blank branch cell).
   */
  const costOf = (b: Book): number => {
    const typed = clean(valueOf(b, 'costPrice'));
    if (typed !== '') return Number(typed);
    return catalogue ? 0 : num(b.costPrice);
  };
  /** Saved cost only — so a row does not drop out of "No cost yet" while it is being typed into. */
  const savedCost = (b: Book): number => num((catalogue ? null : shelf.get(b.id)?.costPrice) ?? b.costPrice);
  /**
   * Margin of the price a cell will sell at (its typed value, or the fallback shown in
   * grey when blank) over cost, so a price can be set knowing what it earns.
   */
  const marginOf = (b: Book, col: Col): { text: string; tone: string } | null => {
    if (col === 'quantity' || col === 'costPrice' || col === 'add') return null;
    const cost = costOf(b);
    const typed = clean(valueOf(b, col));
    const price = Number(typed !== '' ? typed : clean(hint(b, col)));
    if (!(cost > 0) || !Number.isFinite(price) || price <= 0) return null;
    const gain = price - cost;
    const pct = Math.round((gain / price) * 100);
    return {
      text: `${gain >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(gain)))} · ${pct}%`,
      tone: gain < 0 ? 'text-[#9b2626]' : pct < 10 ? 'text-[#a26a00]' : 'text-muted-foreground',
    };
  };
  const problem = (b: Book, col: Col): string | null => {
    const v = clean(valueOf(b, col));
    if (col === 'quantity') return /^\d+$/.test(v) ? null : 'A whole number, 0 or more';
    if (col === 'add') {
      if (v === '') return null;
      if (!/^\d+$/.test(v) || Number(v) <= 0) return 'Units received: a whole number above 0';
      if (Number(v) > 1_000_000) return 'At most 1,000,000 units at a time';
      if (isChanged(b, 'quantity')) return 'Set the quantity or add stock, not both';
      return null;
    }
    if (v === '') {
      if (catalogue && col === 'price') return 'Every product needs a retail price';
      if (catalogue && col === 'costPrice') return 'A catalogue cost cannot be cleared';
      return null;
    }
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
    if (noCostOnly && savedCost(b) > 0) return false;
    return !q || `${b.title} ${b.sku} ${b.category ?? ''}`.toLowerCase().includes(q);
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE;
  const rows = visible.slice(start, start + PAGE);
  const unpricedCount = books.filter(unpriced).length;
  const noCostCount = books.filter((b) => savedCost(b) <= 0).length;
  useEffect(() => setPage(0), [search, changedOnly, unpricedOnly, noCostOnly, branchId, resetKey]);

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
    let savedSoFar = 0;
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      const rows = changes.map(({ book, cols: cs }) => {
        const row: Record<string, number | null> & { bookId: number } = { bookId: book.id };
        for (const col of cs) {
          const v = clean(valueOf(book, col));
          row[col] = col === 'quantity' || col === 'add' ? Number(v) : v === '' ? null : Math.round(Number(v) * 100) / 100;
        }
        return row;
      });
      const total = { products: 0, prices: 0, costs: 0, quantities: 0, netUnits: 0, received: 0, receivedUnits: 0 };
      // Each batch is all-or-nothing on the server, but batches commit one by one. A saved
      // batch's edits are cleared at once: "Add stock" adds, so sending it again on a
      // retry would receive the same goods twice.
      for (let i = 0; i < rows.length; i += 1000) {
        const batch = rows.slice(i, i + 1000);
        const r = await api.post<typeof total>('/api/stock/grid', { branchId, rows: batch });
        const done = new Set(batch.map((x) => x.bookId));
        setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !done.has(Number(k.split(':')[0])))));
        savedSoFar += batch.length;
        total.products += r.products;
        total.prices += r.prices;
        total.costs += r.costs ?? 0;
        total.quantities += r.quantities;
        total.netUnits += r.netUnits;
        total.received += r.received ?? 0;
        total.receivedUnits += r.receivedUnits ?? 0;
      }
      setDrafts({});
      setDone(
        `Saved ${fmt(total.products)} product${total.products === 1 ? '' : 's'}: ${fmt(total.prices)} price change${total.prices === 1 ? '' : 's'}` +
          (total.costs ? `, ${fmt(total.costs)} cost${total.costs === 1 ? '' : 's'}` : '') +
          (catalogue ? '' : `, ${fmt(total.quantities)} quantit${total.quantities === 1 ? 'y' : 'ies'} (net ${total.netUnits > 0 ? '+' : ''}${fmt(total.netUnits)} units)`) +
          (total.received ? `, stock received for ${fmt(total.received)} product${total.received === 1 ? '' : 's'} (+${fmt(total.receivedUnits)} units)` : '') +
          '. Every change is in the audit log' + (catalogue ? '.' : ' and the stock history.'),
      );
      onSaved();
    } catch (err) {
      const why = err instanceof ApiError ? err.message : 'Check the connection and try again.';
      setError(
        savedSoFar > 0
          ? `${fmt(savedSoFar)} product${savedSoFar === 1 ? ' was' : 's were'} saved and cleared from the grid; the rest were not. ${why}`
          : err instanceof ApiError
            ? err.message
            : 'Could not save. Nothing was changed — check the connection and try again.',
      );
      if (savedSoFar > 0) onSaved();
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
            Editing <b>catalogue prices</b>, which every branch uses unless it sets its own. <b>To add stock</b>, pick a
            branch above: its prices, quantities and an Add stock column appear.
          </>
        ) : (
          <>
            Editing <b>{branchName}</b>: its own prices and its quantities. A blank price uses the catalogue price shown in
            grey. <b>Quantity</b> is the exact count, set like a stock take
            {canReceive ? (
              <>
                ; <b>Add stock</b> is what arrived — it is added to what is on hand and recorded as a stock intake.
              </>
            ) : (
              '.'
            )}
          </>
        )}{' '}
        {costEditable
          ? catalogue
            ? 'Cost is what the goods were bought for; '
            : 'Cost is what this branch paid — blank uses the catalogue cost shown in grey; '
          : 'Cost is what the goods were bought for (a manager sets it); '}
        under each price is its margin over cost (amount · % of the price).{' '}
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
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={noCostOnly} onChange={(e) => setNoCostOnly(e.target.checked)} /> No cost yet ({fmt(noCostCount)})
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
              {!costEditable && (
                <th className="px-2 py-2 text-right font-semibold w-24" title="Purchase cost (cost of goods). Each price shows its margin over this.">
                  Cost
                </th>
              )}
              {cols.map((c) => (
                <th
                  key={c}
                  className={`px-2 py-2 text-right font-semibold w-28 ${c === 'costPrice' || c === 'add' ? 'bg-muted/70' : ''}`}
                  title={
                    c === 'costPrice'
                      ? 'Purchase cost (cost of goods). Each price shows its margin over this.'
                      : c === 'add'
                        ? 'Units received: added to what is on hand and recorded as a stock intake.'
                        : c === 'quantity'
                          ? 'The exact count on hand, set like a stock take.'
                          : undefined
                  }
                >
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
                {!costEditable && (
                  <td className="px-2 py-1 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {savedCost(b) > 0 ? savedCost(b).toLocaleString('en-KE', { maximumFractionDigits: 2 }) : <span title="No purchase cost recorded">—</span>}
                  </td>
                )}
                {cols.map((col, c) => {
                  const changed = isChanged(b, col);
                  const bad = changed && problem(b, col);
                  const margin = marginOf(b, col);
                  return (
                    <td key={col} className={`p-0.5 align-top ${col === 'costPrice' || col === 'add' ? 'bg-muted/30' : ''}`}>
                      <input
                        data-r={r}
                        data-c={c}
                        inputMode={col === 'quantity' || col === 'add' ? 'numeric' : 'decimal'}
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
                      {margin && (
                        <div className={`px-2 text-right font-mono text-[10px] leading-tight ${margin.tone}`} title="Margin over cost">
                          {margin.text}
                        </div>
                      )}
                      {col === 'add' && changed && !bad && (
                        <div className="px-2 text-right font-mono text-[10px] leading-tight text-[#15803d]" title="On hand after saving">
                          → {fmt(num(shelf.get(b.id)?.quantity ?? 0) + Number(clean(valueOf(b, 'add'))))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={2 + (costEditable ? 0 : 1) + cols.length} className="px-3 py-6 text-center text-muted-foreground">
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
