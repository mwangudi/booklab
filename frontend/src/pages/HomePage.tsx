import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Armchair,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  FlaskConical,
  Lock,
  MapPin,
  NotebookPen,
  Phone,
  Printer,
  Send,
  ShieldCheck,
  Store,
  Trophy,
  Truck,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { BRANCHES, PHONES, PRICE_LIST, PublicHeader, SiteFooter } from '../components/PublicHeader';

/**
 * Public home page, after the Stitch design (docs/DESIGN-website.md, mockup
 * docs/design-website-mockup.png). Facts only — from the 2026 brochure and the system —
 * and no prices: the mockup's price schedule is a quotation panel here.
 */

const DIVISIONS = [
  {
    icon: FlaskConical, badge: 'Lab & science', title: 'School lab equipment & chemicals', category: 'Lab Equipment',
    desc: 'Microscopes, boiling tubes, beakers and flasks, litmus and indicators, acids and reagents, retort stands and complete science kits.',
    chips: ['Glassware', 'Chemicals', 'Science kits'],
  },
  {
    icon: NotebookPen, badge: 'With your logo', title: 'Exercise books', category: 'Exercise Book',
    desc: 'A5 and A4 exercise books, 48 to 200 pages, in newsprint or bank/white paper — plain, or printed with your school logo.',
    chips: ['A5 & A4', '48–200 pages', 'School logo'],
  },
  {
    icon: BookOpen, badge: 'CBC & JSS', title: 'Textbooks, readers & reference', category: 'Reference',
    desc: 'Text books, JSS/CBC materials and KICD-approved JSS readers, dictionaries and kamusi, atlases, Bibles and wall charts.',
    chips: ['JSS readers', 'Dictionaries', 'Atlases'],
  },
  {
    icon: Armchair, badge: 'Lab & office', title: 'Furniture & storage', category: 'Other',
    desc: 'Lab tables and stools, office and executive tables, chairs, steel cabinets, student lockers and suggestion boxes.',
    chips: ['Lab tables', 'Chairs', 'Lockers'],
  },
  {
    icon: Printer, badge: 'Office & exams', title: 'Computers, printers & toners', category: 'Computers & IT',
    desc: 'Desktops and laptops, Kyocera, Ricoh, Konica, Epson and Canon printers and copiers, toners, cartridges and accessories.',
    chips: ['Printers', 'Toners', 'Laptops'],
  },
  {
    icon: Trophy, badge: 'Co-curricular', title: 'Sports, music & agriculture', category: 'Other',
    desc: 'Balls and nets, sports kit and uniforms, flutes, pianos and kayamba, garden tools, wheelbarrows and sprayers.',
    chips: ['Sports', 'Music', 'Agriculture'],
  },
];

const FACTS = [
  { value: '3', label: 'Branches', sub: 'Luanda · Kapsabet · Mumias' },
  { value: '11', label: 'Supply areas', sub: 'From lab equipment to exams' },
  { value: 'Logo', label: 'Exercise books', sub: 'Printed with your school logo' },
  { value: 'Door', label: 'Delivery', sub: 'Orders delivered to your school' },
];

const field = 'w-full rounded border border-site-line-strong bg-white px-3 py-2.5 text-[16px] sm:text-sm text-site-navy outline-none focus:border-site-ochre focus:ring-2 focus:ring-site-ochre/30';
const tel = (p: string) => `tel:${p.replace(/\s/g, '')}`;

/** The design's "Term 1" form, sent as a website request with a typed list. */
function QuoteForm() {
  const [f, setF] = useState({ organisation: '', name: '', phone: '', preferredBranch: '', location: '', listText: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ number: string }>('/api/public/requests', {
        name: f.name,
        phone: f.phone,
        organisation: f.organisation || undefined,
        location: f.location.trim() || f.organisation,
        preferredBranch: f.preferredBranch || undefined,
        listText: f.listText,
        website: f.website || undefined,
        items: [],
      });
      setSent(r.number);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your request. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-lg border border-site-line bg-white p-6 text-center shadow-site-2">
        <CheckCircle2 className="mx-auto h-10 w-10 text-site-sage-ink" />
        <h3 className="mt-3 font-display text-xl font-bold text-site-navy">Request received</h3>
        <p className="mt-2 text-sm">
          Your reference is <b className="font-display">{sent}</b>. We will call you on the number you gave to confirm the items,
          then send the invoice and arrange delivery.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="rounded-lg border border-site-line bg-white p-5 sm:p-6 shadow-site-2 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-display font-semibold text-site-navy">School / institution name *</span>
          <input required minLength={2} maxLength={160} value={f.organisation} onChange={set('organisation')} className={field} placeholder="e.g. Chepterit Primary School" autoComplete="organization" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-display font-semibold text-site-navy">Contact person *</span>
          <input required minLength={2} maxLength={120} value={f.name} onChange={set('name')} className={field} placeholder="Name and role, e.g. Bursar" autoComplete="name" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-display font-semibold text-site-navy">Phone / WhatsApp *</span>
          <input required inputMode="tel" minLength={7} maxLength={40} value={f.phone} onChange={set('phone')} className={field} placeholder="07XX XXX XXX" autoComplete="tel" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-display font-semibold text-site-navy">Preferred branch</span>
          <select value={f.preferredBranch} onChange={set('preferredBranch')} className={field}>
            <option value="">Any branch</option>
            {BRANCHES.map((b) => <option key={b.name} value={b.name}>{b.name} ({b.where})</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-display font-semibold text-site-navy">Deliver to</span>
          <input maxLength={200} value={f.location} onChange={set('location')} className={field} placeholder="School, town" />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-display font-semibold text-site-navy">What you need *</span>
          <textarea
            required
            minLength={3}
            maxLength={5000}
            rows={5}
            value={f.listText}
            onChange={set('listText')}
            className={field}
            placeholder={'Paste your booklist or requirements, e.g.\n200 A4 exercise books 96pg with school logo\n10 conical flasks 250ml'}
          />
        </label>
        {/* Hidden from people; a bot that fills it is turned away. */}
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} name="website" className="hidden" aria-hidden="true" />
      </div>
      {error && <div className="rounded bg-[#ffdad6] px-3 py-2 text-sm text-[#93000a]">{error}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-site-muted"><Lock className="h-3.5 w-3.5" /> Used only to reply to this request.</span>
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded bg-site-ochre px-5 py-2.5 font-display text-sm font-semibold text-white hover:bg-site-ochre-dark disabled:opacity-60">
          <Send className="h-4 w-4" /> {busy ? 'Sending…' : 'Send request for a quotation'}
        </button>
      </div>
    </form>
  );
}

const eyebrow = 'font-display text-[12px] font-semibold uppercase tracking-wider text-site-ochre';
const h2 = 'mt-1 font-display text-[24px] leading-8 sm:text-[32px] sm:leading-10 font-bold tracking-tight text-site-navy';

// Brochure photos, upscaled; cut-outs sit on a tint, the (portrait) desk photo sits on a blurred copy of itself.
const SLIDES = [
  { src: '/site/hero-stationery.webp', alt: 'Files, exercise books, pens and a calculator', title: 'Stationery & office supplies', category: 'Stationery', bg: 'bg-site-ochre-tint', fill: false },
  { src: '/site/hero-lab.webp', alt: 'Flasks, test tubes and a microscope', title: 'School lab equipment', category: 'Lab Equipment', bg: 'bg-site-sage', fill: false },
  { src: '/site/hero-computer.webp', alt: 'Desktop computer, monitor, keyboard and mouse', title: 'Computers & printers', category: 'Computers & IT', bg: 'bg-site-azure-tint', fill: false },
  { src: '/site/hero-desk.jpg', alt: 'Wooden school desk and steel chair', title: 'School furniture', category: null, bg: 'bg-site-alt', fill: true },
];

/** The hero picture: the brochure photos in turn, every 5 seconds; paused while pointed at or for reduced motion. */
function HeroCarousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = SLIDES.length;
  useEffect(() => {
    if (paused || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [paused, n]);
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const s = SLIDES[i];

  return (
    <div
      className={`relative transition-colors duration-700 ${s.bg}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="What we supply"
    >
      <div className="relative h-72 sm:h-[26rem] xl:h-[30rem] overflow-hidden">
        {SLIDES.map((sl, k) => (
          <div key={sl.src} aria-hidden={k !== i} className={`absolute inset-0 transition-opacity duration-700 ${k === i ? 'opacity-100' : 'opacity-0'}`}>
            {sl.fill && <img src={sl.src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl brightness-75" />}
            <img
              src={sl.src}
              alt={sl.alt}
              loading={k === 0 ? 'eager' : 'lazy'}
              className={`absolute inset-0 h-full w-full object-contain transition-transform duration-[1200ms] ease-out ${
                sl.fill ? 'py-4 pb-14 drop-shadow-2xl' : 'px-6 pt-10 pb-16 sm:px-10 drop-shadow-xl'
              } ${k === i ? 'scale-100' : 'scale-105'}`}
            />
          </div>
        ))}
      </div>
      <span className="absolute left-3 top-3 rounded bg-site-navy px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white">Booklab Bookshop</span>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-white via-white/85 to-transparent px-4 pb-3 pt-8">
        <div aria-live="polite" className="min-w-0">
          {s.category ? (
            <Link to={`/catalogue?category=${encodeURIComponent(s.category)}`} className="inline-flex items-center gap-0.5 whitespace-nowrap font-display text-[13px] sm:text-sm font-semibold text-site-navy hover:text-site-ochre">
              {s.title} <ChevronRight className="h-4 w-4 shrink-0" />
            </Link>
          ) : (
            <a href="#quote" className="inline-flex items-center gap-0.5 whitespace-nowrap font-display text-[13px] sm:text-sm font-semibold text-site-navy hover:text-site-ochre">
              {s.title} <ChevronRight className="h-4 w-4 shrink-0" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => go(-1)} className="grid h-7 w-7 place-items-center rounded-full border border-site-line-strong bg-white text-site-navy hover:border-site-ochre" aria-label="Previous picture">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {SLIDES.map((sl, k) => (
            <button
              key={sl.src}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Show ${sl.title}`}
              aria-current={k === i}
              className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-site-ochre' : 'w-2 bg-site-line-strong hover:bg-site-muted'}`}
            />
          ))}
          <button type="button" onClick={() => go(1)} className="grid h-7 w-7 place-items-center rounded-full border border-site-line-strong bg-white text-site-navy hover:border-site-ochre" aria-label="Next picture">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-site-canvas text-site-ink font-site">
      <PublicHeader home />

      {/* Hero */}
      <section id="top" className="border-b border-site-line">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 xl:col-span-6">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-[#bae6fd] bg-site-azure-tint px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-site-azure-ink">
                <ShieldCheck className="h-3.5 w-3.5" /> KRA tax compliant
              </span>
              <span className="rounded border border-[#bbf7d0] bg-site-sage px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-site-sage-ink">CBC · JSS ready</span>
              <span className="rounded border border-site-line bg-white px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-site-navy">Luanda · Kapsabet · Mumias</span>
            </div>
            <h1 className="mt-5 font-display text-[30px] leading-[38px] sm:text-[44px] sm:leading-[52px] font-bold tracking-tight text-site-navy">
              Everything for School, Lab, Office &amp; Home.
            </h1>
            <p className="mt-4 text-[17px] leading-7 text-site-ink/80 max-w-2xl">
              <b className="text-site-navy">Name it, we got it.</b> School lab equipment, stationery, furniture, computers and
              laptops, textbooks, exercise books with school logos, printers and photocopiers, toners, JSS/CBC materials, sports
              equipment and exams — from our branches in Luanda, Kapsabet and Mumias.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/catalogue" className="inline-flex items-center gap-2 rounded bg-site-ochre px-5 py-3 font-display text-sm font-semibold text-white hover:bg-site-ochre-dark">
                <BookOpen className="h-4 w-4" /> Browse the catalogue
              </Link>
              <a href="#quote" className="inline-flex items-center gap-2 rounded border-[1.5px] border-site-navy bg-white px-5 py-3 font-display text-sm font-semibold text-site-navy hover:bg-site-alt">
                <ClipboardList className="h-4 w-4" /> Request a school quotation
              </a>
            </div>
            <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-site-muted">
              <Phone className="h-4 w-4 text-site-ochre" /> Orders &amp; enquiries:
              {PHONES.map((p, i) => (
                <a key={p} href={tel(p)} className="font-display font-semibold text-site-navy hover:text-site-ochre">{p}{i === 0 ? ' /' : ''}</a>
              ))}
            </p>
          </div>

          <div className="lg:col-span-5 xl:col-span-6">
            <div className="overflow-hidden rounded-xl border border-site-line bg-white shadow-site-2">
              <HeroCarousel />
              <div className="grid grid-cols-2 border-t border-site-line text-sm">
                {[
                  { icon: Truck, t: 'Delivery', s: 'To your school' },
                  { icon: NotebookPen, t: 'School logo print', s: 'On exercise books' },
                  { icon: FlaskConical, t: 'Lab equipment', s: 'Glassware to kits' },
                  { icon: Store, t: 'Three branches', s: 'Walk in or order' },
                ].map(({ icon: I, t, s }, i) => (
                  <div key={t} className={`flex items-start gap-2.5 p-3 ${i % 2 ? 'border-l border-site-line' : ''} ${i > 1 ? 'border-t border-site-line' : ''}`}>
                    <I className="h-4 w-4 mt-0.5 text-site-ochre shrink-0" />
                    <div>
                      <div className="font-display font-semibold text-site-navy text-[13px]">{t}</div>
                      <div className="text-xs text-site-muted">{s}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 pb-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {FACTS.map((f) => (
            <div key={f.label} className="rounded-lg border border-site-line bg-white p-4 shadow-site-1">
              <div className="font-display text-3xl font-bold text-site-ochre">{f.value}</div>
              <div className="mt-1 font-display font-semibold text-site-navy">{f.label}</div>
              <div className="text-xs text-site-muted">{f.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Supply divisions */}
      <section id="offer" className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className={eyebrow}>What we supply</p>
            <h2 className={h2}>Explore our supply divisions</h2>
            <p className="mt-1 text-site-muted">For school heads, bursars, heads of science and everyday buyers.</p>
          </div>
          <Link to="/catalogue" className="inline-flex items-center gap-1 font-display text-sm font-semibold text-site-ochre hover:underline">
            Browse the full catalogue <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {DIVISIONS.map(({ icon: I, badge, title, desc, chips, category }) => (
            <Link
              key={title}
              to={`/catalogue?category=${encodeURIComponent(category)}`}
              className="group flex flex-col rounded-lg border border-site-line bg-white p-5 shadow-site-1 transition hover:border-site-line-strong hover:shadow-site-2"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-site-ochre-tint text-site-ochre"><I className="h-5 w-5" /></span>
                <span className="rounded border border-site-line px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-site-muted">{badge}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-site-navy">{title}</h3>
              <p className="mt-1.5 text-sm text-site-ink/75 flex-1">{desc}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {chips.map((c) => <span key={c} className="rounded border border-site-line bg-site-alt px-2 py-0.5 text-[11px] text-site-navy/80">{c}</span>)}
              </div>
              <span className="mt-4 inline-flex items-center gap-1 font-display text-sm font-semibold text-site-ochre group-hover:underline">
                View items <ChevronRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* In place of the mockup's price schedule: prices are given on request. */}
      <section className="bg-site-navy text-white">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 py-12 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8">
            <p className="font-display text-[12px] font-semibold uppercase tracking-wider text-[#ffb691]">Prices on request</p>
            <h2 className="mt-1 font-display text-[24px] sm:text-[32px] font-bold tracking-tight">Need prices for your school?</h2>
            <p className="mt-2 text-white/75 max-w-2xl">
              Send us your list — a booklist, lab requirements or the exercise books you need with your logo — and we will call
              you back with a quotation, then invoice and deliver. Our printed 2026 price catalogue is also available to download.
            </p>
          </div>
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3">
            <a href="#quote" className="inline-flex items-center justify-center gap-2 rounded bg-site-ochre px-5 py-3 font-display text-sm font-semibold text-white hover:bg-site-ochre-dark">
              <ClipboardList className="h-4 w-4" /> Request a quotation
            </a>
            <a href={PRICE_LIST} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded border-[1.5px] border-white/70 px-5 py-3 font-display text-sm font-semibold text-white hover:bg-white/10">
              <Download className="h-4 w-4" /> Download 2026 price catalogue
            </a>
          </div>
        </div>
      </section>

      {/* Ordering for a school */}
      <section className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 py-14">
        <p className={eyebrow}>Ordering for a school</p>
        <h2 className={h2}>Equipping schools with confidence</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-5">
          {[
            { icon: FileText, t: 'An invoice and delivery note with every order', d: 'Each school order is invoiced, and goods go out with a delivery note for your stores to sign — ready for your records.' },
            { icon: NotebookPen, t: 'Your school logo on exercise books', d: 'A5 and A4 exercise books printed with your school logo, in newsprint or bank/white paper.' },
            { icon: Truck, t: 'Delivered to your school', d: 'Tell us where to deliver when you send your list, and we arrange transport of the goods to you.' },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="rounded-lg border border-site-line bg-white p-5 shadow-site-1">
              <span className="grid h-10 w-10 place-items-center rounded bg-site-azure-tint text-site-azure-ink"><I className="h-5 w-5" /></span>
              <h3 className="mt-4 font-display text-[17px] font-semibold text-site-navy">{t}</h3>
              <p className="mt-1.5 text-sm text-site-ink/75">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Branches */}
      <section id="branches" className="border-y border-site-line bg-white">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 py-14">
          <p className={eyebrow}>Physical locations</p>
          <h2 className={h2}>Visit our branches</h2>
          <p className="mt-1 text-site-muted">Walk in to buy, or talk to us about supplying your school.</p>
          <div className="mt-8 grid md:grid-cols-3 gap-5">
            {BRANCHES.map((b) => (
              <div key={b.name} className="rounded-lg border border-site-line bg-site-canvas p-5 transition hover:shadow-site-2">
                <div className="flex items-center gap-2 font-display text-lg font-semibold text-site-navy"><Store className="h-5 w-5 text-site-ochre" /> {b.name} branch</div>
                <div className="mt-2 flex items-start gap-2 text-sm text-site-ink/80"><MapPin className="h-4 w-4 mt-0.5 text-site-muted" /> {b.where}</div>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  {PHONES.map((p) => (
                    <a key={p} href={tel(p)} className="inline-flex items-center gap-1.5 rounded border border-site-line bg-white px-2.5 py-1 font-display font-semibold text-site-navy hover:border-site-ochre">
                      <Phone className="h-3.5 w-3.5 text-site-ochre" /> {p}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quotation request */}
      <section id="quote" className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 py-14 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <p className={eyebrow}>School orders</p>
          <h2 className={h2}>Preparing for Term 1, Term 2 or the science fair?</h2>
          <p className="mt-3 text-site-ink/80">
            Paste your booklist, lab requirements or the exercise books you need. We will call you back to confirm, then prepare
            the invoice and arrange delivery.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-site-ink/85">
            {[
              'Or pick items from the catalogue and send them as a request',
              'We confirm the items and quantities with you by phone',
              'Invoice and delivery note with every order',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-site-sage-ink shrink-0" /> {t}</li>
            ))}
          </ul>
          <Link to="/catalogue" className="mt-6 inline-flex items-center gap-1 font-display text-sm font-semibold text-site-ochre hover:underline">
            Browse the catalogue instead <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="lg:col-span-7">
          <QuoteForm />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
