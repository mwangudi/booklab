import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, ClipboardList, Minus, Plus, Search } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useRequestList } from '../lib/requestList';
import { PublicHeader, SiteFooter } from '../components/PublicHeader';

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
  // The header's search box and the category links arrive as ?q= and ?category=.
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  useEffect(() => {
    setQ(params.get('q') ?? '');
    setCategory(params.get('category') ?? '');
  }, [params]);
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

  // Keep the chosen category in the list even when nothing in it is in stock, so the box shows what is filtered.
  const categories = useMemo(
    () => [...new Set([...(items ?? []).map((i) => i.category), category].filter((c): c is string => !!c))].sort(),
    [items, category],
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
    <div className="min-h-screen bg-site-canvas text-site-ink font-site">
      <PublicHeader />

      <section className="bg-site-navy text-white">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10">
          <p className="font-display text-[12px] font-semibold uppercase tracking-wider text-[#ffb691]">In stock now</p>
          <h1 className="mt-1 font-display text-[30px] sm:text-[40px] font-bold tracking-tight">Our catalogue</h1>
          <p className="mt-2 max-w-2xl text-white/75">
            Everything shown is in stock now. Add what you need to your request and send it: we will get back to you with
            an invoice and arrange delivery.
          </p>
        </div>
      </section>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for a product…"
              className="w-full rounded border border-site-line-strong bg-white py-2.5 pl-9 pr-3 text-[16px] sm:text-sm text-site-navy outline-none focus:border-site-ochre focus:ring-2 focus:ring-site-ochre/30"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-site-line-strong bg-white px-3 py-2.5 text-[16px] sm:text-sm text-site-navy outline-none focus:border-site-ochre focus:ring-2 focus:ring-site-ochre/30 sm:w-64"
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
            {items.length === 0
              ? 'Our stock is being updated. Please check back soon, or call us.'
              : category && !q.trim()
                ? `Nothing in ${category} is in stock right now. Send us your list and we will source it for you.`
                : 'Nothing matches your search.'}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((i) => (
            <div key={i.id} className="flex flex-col rounded-lg border border-site-line bg-white p-4 shadow-site-1 transition hover:border-site-line-strong hover:shadow-site-2">
              <div className="flex-1">
                <div className="font-display font-semibold leading-snug text-site-navy">{i.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-site-muted">
                  {i.category && <span className="rounded border border-site-line bg-site-alt px-2 py-0.5 text-site-navy/80">{i.category}</span>}
                  <span>Per {i.unit.toLowerCase()}</span>
                  <span className="inline-flex items-center gap-1 rounded border border-[#bbf7d0] bg-site-sage px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-site-sage-ink"><Check className="h-3 w-3" /> In stock</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="inline-flex items-center rounded border border-site-line-strong">
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
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-site-ochre px-3 py-2 font-display text-sm font-semibold text-white hover:bg-site-ochre-dark"
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
        <p className="pt-4 text-sm text-site-muted">
          Can’t find what you need? <Link to="/#quote" className="font-semibold text-site-ochre hover:underline">Send us your list</Link> and we will quote for it.
        </p>
      </main>

      <SiteFooter />

      {list.count > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-site-line bg-white/95 backdrop-blur shadow-site-3">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-sm">
              <b>{list.count}</b> item{list.count === 1 ? '' : 's'} in your request
            </span>
            <Link to="/catalogue/request" className="inline-flex items-center gap-1.5 rounded bg-site-ochre px-4 py-2 font-display text-sm font-semibold text-white hover:bg-site-ochre-dark">
              <ClipboardList className="h-4 w-4" /> Review and send
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
