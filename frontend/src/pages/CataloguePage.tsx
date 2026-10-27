import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, ClipboardList, Minus, Plus, Search } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useRequestList } from '../lib/requestList';
import { PublicHeader } from '../components/PublicHeader';

interface Item {
  id: number;
  sku: string;
  title: string;
  category: string | null;
  unit: string;
}

const PAGE = 48;

/** Public catalogue: what the shop has in stock, to add to a request. No prices. */
export default function CataloguePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [added, setAdded] = useState<number | null>(null);
  const list = useRequestList();

  useEffect(() => {
    api
      .get<{ items: Item[] }>('/api/public/catalogue')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'The catalogue could not be loaded. Check your connection.'));
  }, []);

  const categories = useMemo(
    () => [...new Set((items ?? []).map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [items],
  );
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter(
      (i) => (!category || i.category === category) && (!s || `${i.title} ${i.sku} ${i.category ?? ''}`.toLowerCase().includes(s)),
    );
  }, [items, q, category]);
  useEffect(() => setPage(0), [q, category]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const safe = Math.min(page, pages - 1);
  const rows = shown.slice(safe * PAGE, safe * PAGE + PAGE);
  const inList = new Map(list.lines.map((l) => [l.bookId, l.quantity]));

  const add = (i: Item) => {
    list.add({ bookId: i.id, title: i.title, sku: i.sku, unit: i.unit }, qty[i.id] ?? 1);
    setQty((p) => ({ ...p, [i.id]: 1 }));
    setAdded(i.id);
    setTimeout(() => setAdded((a) => (a === i.id ? null : a)), 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <section className="bg-gradient-to-br from-[#7a2e12] via-[#b4530a] to-[#f7941d] text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold">Our catalogue</h1>
          <p className="mt-2 max-w-2xl text-white/90">
            Everything shown is in stock now. Add what you need to your request and send it: we will get back to you with
            an invoice and arrange delivery.
          </p>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for a product…"
              className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-[16px] sm:text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:border-primary sm:w-56"
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {error && <div className="rounded-lg bg-[#fdf0f0] px-4 py-3 text-sm text-[#9b2626]">{error}</div>}
        {!items && !error && <p className="py-16 text-center text-muted-foreground">Loading the catalogue…</p>}
        {items && shown.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">
            {items.length === 0 ? 'Our stock is being updated. Please check back soon, or call us.' : 'Nothing matches your search.'}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((i) => (
            <div key={i.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex-1">
                <div className="font-semibold leading-snug">{i.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {i.category && <span className="rounded-md bg-muted px-2 py-0.5">{i.category}</span>}
                  <span>Per {i.unit.toLowerCase()}</span>
                  <span className="inline-flex items-center gap-1 text-[#1a7a4a]"><Check className="h-3.5 w-3.5" /> In stock</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-input">
                  <button type="button" aria-label="Fewer" className="p-2 hover:bg-muted" onClick={() => setQty((p) => ({ ...p, [i.id]: Math.max(1, (p[i.id] ?? 1) - 1) }))}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    inputMode="numeric"
                    value={qty[i.id] ?? 1}
                    onChange={(e) => setQty((p) => ({ ...p, [i.id]: Math.max(1, Math.min(100000, Number(e.target.value.replace(/\D/g, '')) || 1)) }))}
                    className="w-14 bg-transparent text-center text-[16px] sm:text-sm outline-none"
                    aria-label={`Quantity of ${i.title}`}
                  />
                  <button type="button" aria-label="More" className="p-2 hover:bg-muted" onClick={() => setQty((p) => ({ ...p, [i.id]: (p[i.id] ?? 1) + 1 }))}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => add(i)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {added === i.id ? <><Check className="h-4 w-4" /> Added</> : <><Plus className="h-4 w-4" /> Add to request</>}
                </button>
              </div>
              {inList.has(i.id) && <p className="mt-2 text-xs text-muted-foreground">{inList.get(i.id)} in your request</p>}
            </div>
          ))}
        </div>

        {shown.length > PAGE && (
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <button type="button" disabled={safe === 0} onClick={() => setPage(safe - 1)} className="rounded-md border border-input p-1.5 disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            Page {safe + 1} of {pages}
            <button type="button" disabled={safe >= pages - 1} onClick={() => setPage(safe + 1)} className="rounded-md border border-input p-1.5 disabled:opacity-40" aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      {list.count > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm">
              <b>{list.count}</b> item{list.count === 1 ? '' : 's'} in your request
            </span>
            <Link to="/catalogue/request" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <ClipboardList className="h-4 w-4" /> Review and send
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
