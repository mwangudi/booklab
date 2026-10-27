import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ClipboardList, Download, MapPin, Phone, Search, ShieldCheck } from 'lucide-react';
import { useRequestList } from '../lib/requestList';

/**
 * The public website's frame — top bar, header, category row and footer — after the
 * Stitch design in docs/DESIGN-website.md. Text states only what the shop has confirmed:
 * branches and landmarks, phone numbers, what it deals in. No prices.
 */

export const PHONES = ['0728 492 372', '0737 452 210'];
export const PRICE_LIST = '/site/booklab-price-catalogue-2026.pdf';
export const BRANCHES = [
  { name: 'Luanda', where: 'Near Equity Bank' },
  { name: 'Kapsabet', where: 'Next to Bata' },
  { name: 'Mumias', where: 'Opposite Muslim Primary' },
];

/** Website category row → the catalogue filtered to the system's category. */
export const SITE_CATEGORIES = [
  { label: 'Lab equipment', category: 'Lab Equipment' },
  { label: 'Exercise books', category: 'Exercise Book' },
  { label: 'Stationery', category: 'Stationery' },
  { label: 'Office supplies', category: 'Office Supplies' },
  { label: 'Computers & printers', category: 'Computers & IT' },
  { label: 'Books & reference', category: 'Reference' },
];

const tel = (p: string) => `tel:${p.replace(/\s/g, '')}`;

export function PublicHeader({ home = false }: { home?: boolean }) {
  const { count } = useRequestList();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);
  // Highlight the category the catalogue is showing; "All catalogue" when it shows everything.
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const current = pathname === '/catalogue' ? params.get('category') ?? '' : null;
  const tab = (on: boolean) =>
    `shrink-0 rounded px-3 py-1.5 ${on ? 'bg-site-alt font-display font-semibold text-site-ochre' : 'text-site-navy/80 hover:bg-site-alt hover:text-site-navy'}`;

  return (
    <div className="font-site">
      {/* Top bar */}
      <div className="bg-site-navy text-white/85 text-[12px]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-9 flex items-center justify-between gap-4">
          <div className="hidden md:flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#ffb691]" /> Branches in Luanda, Kapsabet &amp; Mumias</span>
            <span className="text-white/30">|</span>
            <span>School orders &amp; quotations delivered to your school</span>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <Phone className="h-3.5 w-3.5 text-[#ffb691]" />
            {PHONES.map((p, i) => (
              <span key={p} className="flex items-center gap-3">
                {i > 0 && <span className="text-white/30">/</span>}
                <a href={tel(p)} className="hover:text-white">{p}</a>
              </span>
            ))}
            <span className="text-white/30 hidden sm:inline">|</span>
            <Link to="/login" className="hidden sm:inline font-display font-semibold uppercase tracking-wide text-[11px] text-[#ffb691] hover:text-white">
              Staff portal
            </Link>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-site-line">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-10 rounded" />
            <span className="hidden sm:block leading-tight">
              <span className="block font-display font-bold text-site-navy text-[17px]">Booklab Bookshop</span>
              <span className="block text-[11px] text-site-ochre font-medium">For Quality, For You</span>
            </span>
          </Link>
          <form
            className="flex-1 hidden md:block"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/catalogue${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
            }}
          >
            <label className="relative block max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search exercise books, lab equipment, stationery…"
                className="w-full rounded border border-site-line-strong bg-white py-2 pl-9 pr-3 text-sm text-site-navy outline-none focus:border-site-ochre focus:ring-2 focus:ring-site-ochre/30"
                aria-label="Search the catalogue"
              />
            </label>
          </form>
          <div className="flex items-center gap-2 ml-auto">
            <a
              href={PRICE_LIST}
              target="_blank"
              rel="noopener"
              className="hidden lg:inline-flex items-center gap-1.5 rounded bg-site-ochre px-4 py-2 font-display text-sm font-semibold text-white hover:bg-site-ochre-dark"
            >
              <Download className="h-4 w-4" /> Download 2026 price list
            </a>
            <Link
              to="/catalogue/request"
              className="relative inline-flex items-center gap-1.5 rounded border border-site-navy px-3 py-2 font-display text-sm font-semibold text-site-navy hover:bg-site-alt"
              aria-label={`Your request: ${count} item${count === 1 ? '' : 's'}`}
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Your request</span>
              {count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-site-ochre px-1.5 text-[11px] font-bold text-white">{count}</span>
              )}
            </Link>
          </div>
        </div>

        {/* Category row */}
        <nav className="border-t border-site-line bg-white" aria-label="Catalogue categories">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar py-1.5 text-[13px]">
            <Link to="/catalogue" className={tab(current === '')} aria-current={current === '' ? 'page' : undefined}>All catalogue</Link>
            {SITE_CATEGORIES.map((c) => (
              <Link key={c.category} to={`/catalogue?category=${encodeURIComponent(c.category)}`} className={tab(current === c.category)} aria-current={current === c.category ? 'page' : undefined}>
                {c.label}
              </Link>
            ))}
            <a href={anchor('branches')} className="shrink-0 rounded px-3 py-1.5 text-site-navy/80 hover:bg-site-alt">Branches</a>
            <a href={anchor('quote')} className="shrink-0 rounded px-3 py-1.5 font-semibold text-site-ochre hover:bg-site-ochre-tint">Request a quote</a>
          </div>
        </nav>
      </header>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer id="contact" className="font-site bg-site-navy text-white/75">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/logo.jpeg" alt="" className="h-10 rounded" />
            <span className="font-display font-bold text-white text-lg">Booklab Bookshop</span>
          </div>
          <p className="mt-2 text-[12px] font-display font-semibold uppercase tracking-wide text-[#ffb691]">Name it, we got it · For Quality, For You</p>
          <p className="mt-3 text-sm text-white/65">
            School lab equipment, stationery, furniture, computers, textbooks, exercise books with school logos, printers,
            toners, JSS/CBC materials, sports equipment and exams.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/60"><ShieldCheck className="h-4 w-4 text-[#93ccff]" /> KRA tax compliant</p>
        </div>
        <div>
          <h4 className="font-display text-white font-semibold text-sm uppercase tracking-wide">Catalogue</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {SITE_CATEGORIES.map((c) => (
              <li key={c.category}>
                <Link to={`/catalogue?category=${encodeURIComponent(c.category)}`} className="hover:text-white">{c.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-display text-white font-semibold text-sm uppercase tracking-wide">Our branches</h4>
          <ul className="mt-3 space-y-2.5 text-sm">
            {BRANCHES.map((b) => (
              <li key={b.name}>
                <b className="text-white">{b.name} branch</b>
                <div className="text-white/60">{b.where}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-display text-white font-semibold text-sm uppercase tracking-wide">Orders &amp; enquiries</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {PHONES.map((p) => (
              <li key={p} className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#ffb691]" /><a href={tel(p)} className="hover:text-white">{p}</a></li>
            ))}
            <li>
              <a href={PRICE_LIST} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:text-white">
                <Download className="h-4 w-4 text-[#ffb691]" /> 2026 price catalogue (PDF)
              </a>
            </li>
            <li>
              <Link to="/login" className="inline-flex items-center gap-1.5 mt-1 text-[#ffb691] hover:underline">Staff portal <ArrowRight className="h-4 w-4" /></Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 text-xs text-white/45 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Booklab Bookshop. All rights reserved.</span>
          <span>Prices on request · invoices and delivery notes with every order</span>
        </div>
      </div>
    </footer>
  );
}
