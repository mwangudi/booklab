import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { cn } from '../lib/utils';

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
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim() || !searchable) return data;
    const q = query.trim().toLowerCase();
    return data.filter((row) => searchable(row).toLowerCase().includes(q));
  }, [data, query, searchable]);

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
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const showFrom = sorted.length === 0 ? 0 : safePage * pageSize + 1;
  const showTo = Math.min((safePage + 1) * pageSize, sorted.length);

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

  return (
    <div className="flex flex-col gap-3">
      {(searchable || rightSlot || actionSlot) && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className={cn('flex flex-wrap items-center gap-2', actionSlot ? 'sm:col-span-9' : 'sm:col-span-12')}>
            {searchable && (
              <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
            {rightSlot && <div className="flex items-center gap-2 flex-wrap">{rightSlot}</div>}
          </div>
          {actionSlot && (
            <div className="sm:col-span-3 flex items-center gap-2 [&>*]:flex-1 [&_button]:w-full">{actionSlot}</div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
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
                        {active ? (
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
                  {emptyText}
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
