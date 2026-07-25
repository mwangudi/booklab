import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Select2Option {
  value: string;
  label: string;
}

interface Select2Props {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: Select2Option[];
  placeholder?: string;
  /** Force the search box on/off. Defaults to on when there are more than 6 options. */
  searchable?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
}

/**
 * A lightweight, dependency-free "select2-style" dropdown: a styled trigger with
 * a searchable, keyboard-navigable options panel. Drop-in for native selects.
 */
export function Select2({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchable,
  disabled,
  clearable = false,
  className,
  id,
}: Select2Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const strValue = value == null ? '' : String(value);
  const selected = options.find((o) => o.value === strValue) ?? null;
  const canSearch = searchable ?? options.length > 6;

  const filtered = useMemo(() => {
    if (!canSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, canSearch]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      if (canSearch) setTimeout(() => searchRef.current?.focus(), 0);
      const i = filtered.findIndex((o) => o.value === strValue);
      setActiveIdx(i >= 0 ? i : 0);
    } else {
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return setOpen(true);
      return setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      return setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[activeIdx]) return choose(filtered[activeIdx].value);
      return setOpen(true);
    }
  };

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors disabled:opacity-60',
          open ? 'border-primary ring-2 ring-primary/20' : 'focus:border-primary focus:ring-2 focus:ring-primary/20',
        )}
      >
        <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg">
          {canSearch && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIdx(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Search…"
                  className="w-full rounded-md border border-input bg-background pl-8 pr-2 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground text-center">No matches</li>
            ) : (
              filtered.map((o, i) => {
                const isSel = o.value === strValue;
                return (
                  <li key={o.value || '__empty'}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => choose(o.value)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left',
                        i === activeIdx ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted',
                        isSel && 'font-medium',
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSel && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
