import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Filter, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Select2 } from './Select2';
import { Button, Modal } from './ui';

export interface Column<T> {
  /** Unique column id. */
  key: string;
  header: ReactNode;
  /** Custom cell renderer. Falls back to `accessor`. */
  render?: (row: T) => ReactNode;
  /** Sortable/searchable primitive value for the row. */
  accessor?: (row: T) => string | number;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  /**
   * Adds a filter for this column above the table:
   * - 'select': a dropdown of the distinct values in the column (category, status, method…)
   * - 'range': from/to numbers (quantity, amount…)
   */
  filter?: 'select' | 'range';
  /** The value the filter works on, when it differs from `accessor` (e.g. a label rather than a sort number). */
  filterValue?: (row: T) => string | number | null | undefined;
  /** Name shown on the filter, when the header is not plain text. */
  filterLabel?: string;
  /** How a filter value reads in the dropdown and chip, e.g. prettyEnum for DRAFT → Draft. */
  filterOptionLabel?: (value: string) => string;
}

/** DRAFT → Draft, TRANSFER_IN → Transfer in: for filters on stored codes. */
export const prettyEnum = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, ' ') : v);

/** The dropdown choice for rows with no value in a column (no category, no branch…). */
const NONE = '__none__';
const isBlank = (v: unknown) => v == null || v === '';

/** A named filter whose options are rules of the page's own, e.g. stock level "Low" or "Ran out". */
export interface PresetFilter<T> {
  key: string;
  label: string;
  options: Array<{ value: string; label: string; test: (row: T) => boolean }>;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Text used for the global search box. */
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText?: string;
  rightSlot?: ReactNode;
  /** Primary "add" action, pinned to the right of the search box above the table. */
  actionSlot?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  rowKey?: (row: T, index: number) => string | number;
  /** Named filters with rules of the page's own (shown before the column filters). */
  filters?: PresetFilter<T>[];
  /** Changes when data the columns' accessors rely on changes (e.g. branch names loaded later). */
  depsKey?: string;
  /**
   * Keep the search and filters in the page address (?q=…&category=…), so a link can
   * open the table already filtered and a filtered view can be bookmarked. On by default.
   * The table owns `q`, each filter's key and `<key>_min`/`<key>_max`: a page's own
   * address settings must use other names (e.g. ?branchId=, not ?branch=).
   */
  urlState?: boolean;
}

const textOf = (h: ReactNode, fallback: string) => (typeof h === 'string' ? h : fallback);

/** Search and filter values: in the address when `urlState`, otherwise in memory. */
function useTableState(urlState: boolean) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<Record<string, string>>({});
  const get = (k: string) => (urlState ? params.get(k) ?? '' : local[k] ?? '');
  const set = (patch: Record<string, string>) => {
    if (!urlState) {
      setLocal((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(patch)) if (v) next[k] = v; else delete next[k];
        return next;
      });
      return;
    }
    // Only the keys this table owns change; the page's own (e.g. ?branch=) are left alone.
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
        return next;
      },
      { replace: true },
    );
  };
  return { get, set };
}

export function DataTable<T>({
  data,
  columns,
  searchable,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  emptyText = 'No records',
  rightSlot,
  actionSlot,
  initialSort,
  rowKey,
  filters = [],
  urlState = true,
  depsKey = '',
}: DataTableProps<T>) {
  const state = useTableState(urlState);
  const query = state.get('q');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const selectCols = columns.filter((c) => c.filter === 'select');
  const rangeCols = columns.filter((c) => c.filter === 'range');
  const valueOf = (c: Column<T>, row: T) => (c.filterValue ?? c.accessor)?.(row);
  // Pages rebuild their column and filter lists every render; this stays the same unless
  // the set of filterable columns really changes, so the memos below are not redone each time.
  const colSig = columns.map((c) => `${c.key}:${c.filter ?? ''}`).join('|') + '#' + filters.map((f) => f.key).join('|') + '#' + depsKey;
  const optionText = (c: Column<T>, v: string) => (v === NONE ? '(none)' : c.filterOptionLabel ? c.filterOptionLabel(v) : v);

  // Distinct values for each dropdown, from the data itself, plus "(none)" when some rows are blank.
  const selectOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of selectCols) {
      const seen = new Set<string>();
      let blank = false;
      for (const row of data) {
        const v = valueOf(c, row);
        if (isBlank(v)) blank = true;
        else seen.add(String(v));
      }
      out[c.key] = [...[...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), ...(blank && seen.size ? [NONE] : [])];
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, colSig]);

  // Every active filter, for the chips and for "filtered from".
  const active: Array<{ keys: string[]; text: string }> = [];
  for (const f of filters) {
    const v = state.get(f.key);
    const opt = f.options.find((o) => o.value === v);
    if (opt) active.push({ keys: [f.key], text: `${f.label}: ${opt.label}` });
  }
  for (const c of selectCols) {
    const v = state.get(c.key);
    if (v) active.push({ keys: [c.key], text: `${c.filterLabel ?? textOf(c.header, c.key)}: ${optionText(c, v)}` });
  }
  for (const c of rangeCols) {
    const num = (v: string) => (v !== '' && Number.isFinite(Number(v)) ? v : '');
    const min = num(state.get(`${c.key}_min`));
    const max = num(state.get(`${c.key}_max`));
    if (min || max) {
      const name = c.filterLabel ?? textOf(c.header, c.key);
      active.push({
        keys: [`${c.key}_min`, `${c.key}_max`],
        text: min && max ? `${name}: ${min}–${max}` : min ? `${name}: ${min} or more` : `${name}: up to ${max}`,
      });
    }
  }

  const filterKey = active.map((a) => a.keys.map((k) => `${k}=${state.get(k)}`).join('&')).join('|');
  const filtered = useMemo(() => {
    let rows = data;
    for (const f of filters) {
      const opt = f.options.find((o) => o.value === state.get(f.key));
      if (opt) rows = rows.filter(opt.test);
    }
    for (const c of selectCols) {
      const v = state.get(c.key);
      if (v) rows = rows.filter((row) => (v === NONE ? isBlank(valueOf(c, row)) : String(valueOf(c, row) ?? '') === v));
    }
    for (const c of rangeCols) {
      const min = state.get(`${c.key}_min`);
      const max = state.get(`${c.key}_max`);
      const lo = min === '' ? null : Number(min);
      const hi = max === '' ? null : Number(max);
      if ((lo != null && Number.isFinite(lo)) || (hi != null && Number.isFinite(hi))) {
        rows = rows.filter((row) => {
          const raw = valueOf(c, row);
          if (isBlank(raw)) return false;
          const n = Number(raw);
          if (!Number.isFinite(n)) return false;
          return (lo == null || !Number.isFinite(lo) || n >= lo) && (hi == null || !Number.isFinite(hi) || n <= hi);
        });
      }
    }
    if (query.trim() && searchable) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((row) => searchable(row).toLowerCase().includes(q));
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, searchable, filterKey, colSig]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.accessor) return filtered;
    const acc = col.accessor;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, colSig]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const showFrom = sorted.length === 0 ? 0 : safePage * pageSize + 1;
  const showTo = Math.min((safePage + 1) * pageSize, sorted.length);

  const setFilter = (patch: Record<string, string>) => {
    state.set(patch);
    setPage(0);
  };
  /** One address update for everything, so no change overwrites another. */
  const clearAll = (alsoSearch = false) =>
    setFilter(Object.fromEntries([...active.flatMap((a) => a.keys), ...(alsoSearch ? ['q'] : [])].map((k) => [k, ''])));

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const alignCls = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  const hasFilters = filters.length > 0 || selectCols.length > 0 || rangeCols.length > 0;
  const rangeInput =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  // The pop-up edits a draft; nothing changes until Apply, which writes it all at once.
  const filterKeys = [
    ...filters.map((f) => f.key),
    ...selectCols.map((c) => c.key),
    ...rangeCols.flatMap((c) => [`${c.key}_min`, `${c.key}_max`]),
  ];
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const openPanel = () => {
    // Only values that still mean something: a known option, or a number for a range.
    const d: Record<string, string> = {};
    for (const f of filters) {
      const v = state.get(f.key);
      d[f.key] = f.options.some((o) => o.value === v) ? v : '';
    }
    for (const c of selectCols) {
      const v = state.get(c.key);
      d[c.key] = (selectOptions[c.key] ?? []).includes(v) ? v : '';
    }
    for (const c of rangeCols) {
      for (const k of [`${c.key}_min`, `${c.key}_max`]) {
        const v = state.get(k);
        d[k] = v !== '' && Number.isFinite(Number(v)) ? v : '';
      }
    }
    setDraft(d);
    setPanelOpen(true);
  };
  const draftSet = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const applyDraft = () => {
    setFilter(Object.fromEntries(filterKeys.map((k) => [k, (draft[k] ?? '').trim()])));
    setPanelOpen(false);
  };
  // One per filter, as on the button and chips: a from–to range counts once.
  const draftCount =
    filters.filter((f) => draft[f.key]).length +
    selectCols.filter((c) => draft[c.key]).length +
    rangeCols.filter((c) => draft[`${c.key}_min`] || draft[`${c.key}_max`]).length;

  const filterButton = hasFilters && (
    <button
      type="button"
      onClick={openPanel}
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        active.length > 0
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Filter className="h-4 w-4" aria-hidden />
      Filters
      {active.length > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {active.length}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {(searchable || rightSlot || actionSlot || hasFilters) && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className={cn('flex flex-wrap items-center gap-2', actionSlot ? 'sm:col-span-9' : 'sm:col-span-12')}>
            {searchable && (
              <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setFilter({ q: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
            {rightSlot && <div className="flex items-center gap-2 flex-wrap">{rightSlot}</div>}
            {/* After the search box, just before the page's "New …" button. */}
            {filterButton}
          </div>
          {actionSlot && (
            <div className="sm:col-span-3 flex items-center gap-2 [&>*]:flex-1 [&_button]:w-full">{actionSlot}</div>
          )}
        </div>
      )}

      {hasFilters && (
        <Modal
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          title="Filters"
          wide={filters.length + selectCols.length + rangeCols.length > 2}
          overflowVisible
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDraft(Object.fromEntries(filterKeys.map((k) => [k, ''])))}
                disabled={draftCount === 0}
                className="text-sm font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                Clear all
              </button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPanelOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={applyDraft}>Apply{draftCount > 0 ? ` (${draftCount})` : ''}</Button>
              </div>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {filters.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="mb-1.5 block font-medium text-foreground">{f.label}</span>
                <Select2
                  value={draft[f.key] ?? ''}
                  onChange={(v) => draftSet(f.key, v)}
                  options={[{ value: '', label: 'All' }, ...f.options.map((o) => ({ value: o.value, label: o.label }))]}
                  searchable={false}
                  ariaLabel={`${f.label} filter`}
                />
              </label>
            ))}
            {selectCols.map((c) => {
              const name = c.filterLabel ?? textOf(c.header, c.key);
              return (
                <label key={c.key} className="block text-sm">
                  <span className="mb-1.5 block font-medium text-foreground">{name}</span>
                  <Select2
                    value={draft[c.key] ?? ''}
                    onChange={(v) => draftSet(c.key, v)}
                    options={[{ value: '', label: 'All' }, ...(selectOptions[c.key] ?? []).map((v) => ({ value: v, label: optionText(c, v) }))]}
                    ariaLabel={`${name} filter`}
                  />
                </label>
              );
            })}
            {rangeCols.map((c) => {
              const name = c.filterLabel ?? textOf(c.header, c.key);
              return (
                <div key={c.key} className="text-sm">
                  <span className="mb-1.5 block font-medium text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`${name} from`}
                      placeholder="From"
                      value={draft[`${c.key}_min`] ?? ''}
                      onChange={(e) => draftSet(`${c.key}_min`, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyDraft()}
                      className={rangeInput}
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`${name} to`}
                      placeholder="To"
                      value={draft[`${c.key}_max`] ?? ''}
                      onChange={(e) => draftSet(`${c.key}_max`, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyDraft()}
                      className={rangeInput}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((a) => (
            <span
              key={a.keys.join('+')}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {a.text}
              <button
                type="button"
                onClick={() => setFilter(Object.fromEntries(a.keys.map((k) => [k, ''])))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                aria-label={`Remove filter ${a.text}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => clearAll()} className="ml-1 text-xs font-medium text-primary hover:underline">
            Clear all
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => {
                const activeSort = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap',
                      alignCls(c.align),
                      c.headerClassName,
                    )}
                  >
                    {c.sortable && c.accessor ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-foreground',
                          c.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {c.header}
                        {activeSort ? (
                          sort!.dir === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {active.length > 0 || query.trim() ? (
                    <>
                      Nothing matches these filters.{' '}
                      <button type="button" onClick={() => clearAll(true)} className="font-medium text-primary hover:underline">
                        Clear them
                      </button>
                    </>
                  ) : (
                    emptyText
                  )}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={rowKey ? rowKey(row, i) : i} className="border-t border-border hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2.5 whitespace-nowrap', alignCls(c.align), c.className)}>
                      {c.render ? c.render(row) : c.accessor ? c.accessor(row) : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing <b className="text-foreground">{showFrom}</b>–<b className="text-foreground">{showTo}</b> of{' '}
          <b className="text-foreground">{sorted.length}</b>
          {sorted.length !== data.length && <> (filtered from {data.length})</>}
        </span>
        <div className="flex items-center gap-2">
          <span>
            Page <b className="text-foreground">{safePage + 1}</b> of <b className="text-foreground">{pageCount}</b>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-md border border-input p-1 disabled:opacity-40 hover:bg-muted"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-md border border-input p-1 disabled:opacity-40 hover:bg-muted"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
