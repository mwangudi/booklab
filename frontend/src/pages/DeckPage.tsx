import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Mail, MapPin, Phone, Shrink } from 'lucide-react';
import { BRANCHES, EMAIL, PHONES } from '../components/PublicHeader';

/**
 * Public presentation deck at /deck: Booklab's items by category, for the PM to present
 * from a browser. Arrow keys, space, swipe or the side buttons move; F toggles full screen;
 * the slide number is kept in the address (#3), so a link opens on that slide.
 * Photos are in public/deck (originals in docs/product-photos/2026-10-30).
 */

type Pic = { src: string; caption?: string };
type Offer = { src: string; name: string; price?: string; note?: string };
type Slide =
  | { kind: 'cover' }
  | { kind: 'overview' }
  | { kind: 'offers'; title: string; offers: Offer[] }
  | { kind: 'feature'; eyebrow: string; title: string; src: string; price: string; points: string[] }
  | { kind: 'gallery'; eyebrow: string; title: string; text: string; pics: Pic[] }
  | { kind: 'contact' };

const img = (name: string) => `/deck/${name}.webp`;
const p = (name: string, caption?: string): Pic => ({ src: img(name), caption });

const CATEGORIES = [
  { title: 'Books & CBC/JSS readers', src: 'book-bridges-without-rivers' },
  { title: 'Charts & teaching aids', src: 'flip-charts' },
  { title: 'Printing & branding', src: 'we-print-exercise-books' },
  { title: 'ICT & office electronics', src: 'laptops-8th-gen' },
  { title: 'School furniture', src: 'school-desks-outdoor' },
  { title: 'Office furniture & storage', src: 'executive-chair' },
  { title: 'Sports equipment', src: 'football-mikasa' },
  { title: 'Uniforms & sports kits', src: 'tracksuits-colours' },
  { title: 'Kitchen & catering', src: 'kaluworks-55l' },
  { title: 'Gates, security & essentials', src: 'gate-ornate' },
  { title: 'Music & home science', src: 'keyboard' },
  { title: 'Lab equipment', src: 'microscope' },
];

const SLIDES: Slide[] = [
  { kind: 'cover' },
  { kind: 'overview' },
  {
    kind: 'offers',
    title: 'Ready now: featured items',
    offers: [
      { src: img('wifi-router-4g'), name: '4G WiFi router', price: 'KES 12,000', note: 'Any SIM · 32 users · no subscription' },
      { src: img('laptops-8th-gen'), name: '8th Generation laptops', price: 'KES 40,000' },
      { src: img('steel-lockers-6-door'), name: 'Steel lockers', price: 'KES 5,000', note: 'Ready in our warehouse' },
      { src: img('office-chair'), name: 'Office chair', price: 'KES 4,000', note: 'Ready in our warehouse' },
      { src: img('conference-chair'), name: 'Conference chair', price: 'KES 4,000' },
      { src: img('fridge-guard'), name: 'Fridge guard', price: 'KES 2,500' },
      { src: img('self-inking-stamps'), name: 'Stamps', price: 'All sizes & designs' },
    ],
  },
  {
    kind: 'feature',
    eyebrow: 'Connectivity',
    title: '4G LTE WiFi router',
    src: img('wifi-router-4g'),
    price: 'KES 12,000',
    points: ['Plug in any SIM card', 'Any amount of bundles', 'Up to 32 users', '300 Mbps speed', '5G / 4G / 3G compatible', 'No subscription'],
  },
  {
    kind: 'gallery',
    eyebrow: 'Books',
    title: 'CBC & JSS set books and readers',
    text: 'KICD-approved literature and Kiswahili set books, story readers and revision workbooks.',
    pics: [
      p('book-bridges-without-rivers', 'Bridges Without Rivers'),
      p('book-daughter-of-nature', 'Daughter of Nature'),
      p('book-melodies-of-africa', 'Melodies of Africa'),
      p('book-mshale-wa-matumaini', 'Mshale wa Matumaini'),
      p('book-wema-hauozi', 'Wema Hauozi'),
      p('book-hodi-hodi-mashairi', 'Hodi Hodi Mashairi'),
      p('kjsea-maths-workbook', 'KJSEA Made Familiar'),
      p('readers', 'Story readers'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Teaching aids',
    title: 'Charts, flash cards & classroom aids',
    text: 'Full-colour, double-sided laminated charts in English and Kiswahili, flip charts, flash cards and more.',
    pics: [
      p('charts-abc-counting', 'ABC & counting charts'),
      p('chati-alfabeti', 'Chati za Kiswahili'),
      p('flip-charts', 'Flip charts'),
      p('flash-cards', 'Flash cards'),
      p('charts-home-classroom', 'Home & classroom charts'),
      p('chart-nervous-system', 'Science wall charts'),
      p('abacus', 'Abacus'),
      p('whiteboard', 'Whiteboards'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Printing & branding',
    title: 'Your school name and logo on everything',
    text: 'Exercise books with your logo, rubber and self-inking stamps of all sizes, branded T-shirts and school signage.',
    pics: [
      p('we-print-exercise-books', 'Exercise books with your logo'),
      p('exercise-book-school-logo', 'Custom exercise book covers'),
      p('custom-stamps', 'Stamps: all sizes & designs'),
      p('self-inking-stamps', 'Self-inking stamps'),
      p('branded-theatre-tshirts', 'Branded T-shirts'),
      p('branded-school-tshirt', 'School T-shirts'),
      p('branded-staff-tshirt', 'Staff wear'),
      p('school-signage', 'School signage'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'ICT & electronics',
    title: 'Computers, printers & office electronics',
    text: 'Laptops and desktops, copiers and ink-tank printers, routers, phones, chargers and power protection.',
    pics: [
      p('laptops-8th-gen', '8th Gen laptops · KES 40,000'),
      p('desktop-computer', 'Desktop computers'),
      p('kyocera-copier', 'Kyocera photocopiers'),
      p('epson-ink-tank-printer', 'Epson ink-tank printers'),
      p('wifi-router-4g', '4G router · KES 12,000'),
      p('desk-phone', 'GSM desk phones'),
      p('laptop-chargers', 'Laptop chargers: all types'),
      p('fridge-guard', 'Fridge guard · KES 2,500'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'School furniture',
    title: 'Desks, lockers, tables & chairs',
    text: 'Made and delivered in bulk for classrooms, labs, dining halls and staff rooms.',
    pics: [
      p('school-desks-outdoor', 'Locker desks'),
      p('desks-delivery', 'Bulk delivery to schools'),
      p('classroom-desks', 'Classroom desks'),
      p('locker-desk-chair', 'Desk & chair sets'),
      p('lab-stools-tables', 'Lab tables & stools'),
      p('padded-chairs', 'Padded chairs'),
      p('skyplast-chairs', 'Skyplast plastic chairs'),
      p('folding-table-set', 'Folding table sets'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Office furniture',
    title: 'Office chairs, desks & steel storage',
    text: 'Executive and visitor chairs, office desks, steel cabinets and lockers: ready in our warehouse.',
    pics: [
      p('steel-lockers-6-door', 'Lockers · KES 5,000'),
      p('office-chair', 'Office chair · KES 4,000'),
      p('conference-chair', 'Conference chair · KES 4,000'),
      p('executive-chair', 'Executive chairs'),
      p('visitor-chairs', 'Visitor chairs'),
      p('executive-desk', 'Executive desks'),
      p('steel-cabinets-pair', 'Steel cabinets'),
      p('office-desk', 'Office desks'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Sports equipment',
    title: 'Balls, nets & training gear',
    text: 'Footballs, basketballs, rugby and netballs, volleyball nets, bibs, whistles and cones.',
    pics: [
      p('football-mikasa', 'Footballs'),
      p('basketball', 'Basketballs'),
      p('rugby-ball', 'Rugby balls'),
      p('netball-bibs', 'Netballs & bibs'),
      p('volleyball-nets', 'Volleyball nets'),
      p('whistles', 'Whistles'),
      p('marker-cones', 'Marker cones'),
      p('traffic-cones', 'Training cones'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Uniforms & kits',
    title: 'Jerseys, tracksuits & school wear',
    text: 'Team jerseys, netball dresses, goalkeeper kits, tracksuits and polo shirts in your school colours.',
    pics: [
      p('jersey-red', 'Team jerseys'),
      p('jersey-orange', 'Football kits'),
      p('netball-dresses', 'Netball dresses'),
      p('goalkeeper-kits', 'Goalkeeper kits'),
      p('tracksuits-colours', 'Tracksuits'),
      p('tracksuit-school', 'School tracksuits'),
      p('polo-shirts', 'Polo shirts'),
      p('tshirt-colours', 'T-shirts in all colours'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Kitchen & catering',
    title: 'For school kitchens and dining halls',
    text: 'Large sufurias and cooking drums, energy-saving jikos, hot pots and kitchen ware.',
    pics: [
      p('homkart-180l', 'Homkart 180 L'),
      p('kaluworks-55l', 'Kaluworks 55 L sufuria'),
      p('sufuria-set', 'Steel sufuria sets'),
      p('aluminium-sufurias', 'Aluminium sufurias'),
      p('steel-cooking-drum', 'Cooking drums'),
      p('energy-jikos', 'Energy-saving jikos'),
      p('matrix-hotpot', 'Hot pots'),
      p('camping-stove', 'Gas stoves'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Gates & security',
    title: 'Gates, security & school essentials',
    text: 'Steel gates made to order, padlocks, solar flood lights and cameras, school bells and clocks.',
    pics: [
      p('gate-ornate', 'Steel gates'),
      p('gate-green', 'Made-to-order gates'),
      p('gate-white', 'Gate designs'),
      p('gate-sliding', 'Sliding gates'),
      p('solar-floodlights', 'Solar flood lights'),
      p('solar-cctv-camera', 'Solar CCTV camera'),
      p('padlocks', 'Padlocks'),
      p('school-bell', 'School bells'),
    ],
  },
  {
    kind: 'gallery',
    eyebrow: 'Co-curricular & labs',
    title: 'Music, home science & lab',
    text: 'Instruments for music and drama, sewing machines for home science, and lab equipment.',
    pics: [
      p('keyboard', 'Keyboards'),
      p('drum', 'Drums'),
      p('sewing-machine', 'Sewing machines'),
      p('microscope', 'Microscopes'),
      p('wall-clock', 'Wall clocks'),
      p('curtains', 'Curtains'),
    ],
  },
  { kind: 'contact' },
];

const tel = (x: string) => `tel:${x.replace(/\s/g, '')}`;

export default function DeckPage() {
  const n = SLIDES.length;
  const fromHash = () => Math.min(n - 1, Math.max(0, Number(window.location.hash.slice(1)) - 1 || 0));
  const [i, setI] = useState(fromHash);
  const [full, setFull] = useState(false);
  const touch = useRef<number | null>(null);

  const go = useCallback((d: number) => setI((x) => Math.min(n - 1, Math.max(0, x + d))), [n]);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    document.title = 'Booklab Bookshop: items & supplies';
    // The deck carries prices; keep it out of search results.
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(n - 1);
      else if (e.key === 'f' || e.key === 'F') toggleFull();
    };
    const onFull = () => setFull(!!document.fullscreenElement);
    const onHash = () => setI(fromHash());
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
      window.removeEventListener('hashchange', onHash);
      robots.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, toggleFull, n]);

  useEffect(() => {
    window.history.replaceState(null, '', `#${i + 1}`);
    // Warm the next slide's photos so they are there when it opens.
    const next = SLIDES[i + 1];
    const srcs = next?.kind === 'gallery' ? next.pics.map((x) => x.src) : next?.kind === 'offers' ? next.offers.map((o) => o.src) : next?.kind === 'feature' ? [next.src] : [];
    srcs.forEach((s) => { const im = new Image(); im.src = s; });
  }, [i]);

  const s = SLIDES[i];
  return (
    <div
      className="fixed inset-0 bg-site-navy font-site text-white select-none overflow-hidden"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div key={i} className="absolute inset-0 animate-[deckIn_.45s_ease-out]">
        <SlideView s={s} />
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
        <div className="h-full bg-site-ochre transition-all duration-300" style={{ width: `${((i + 1) / n) * 100}%` }} />
      </div>
      <div className="absolute bottom-3 right-4 flex items-center gap-2 text-xs text-white/70">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30" aria-label="Previous slide">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[3.5rem] text-center font-display tabular-nums">{i + 1} / {n}</span>
        <button type="button" onClick={() => go(1)} disabled={i === n - 1} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30" aria-label="Next slide">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button type="button" onClick={toggleFull} className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={full ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
          {full ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.jpeg" alt="" className="h-9 rounded" />
      <span className="font-display font-bold tracking-tight">Booklab Bookshop</span>
    </div>
  );
}

function Frame({ eyebrow, title, text, children, light = false }: { eyebrow: string; title: string; text?: string; children: React.ReactNode; light?: boolean }) {
  return (
    <div className={`h-full w-full flex flex-col px-[4vw] pt-[3.2vh] pb-[7vh] ${light ? 'bg-site-canvas text-site-navy' : ''}`}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="font-display text-[clamp(11px,1.1vw,16px)] font-bold uppercase tracking-[0.18em] text-site-ochre">{eyebrow}</p>
          <h2 className="mt-1 font-display text-[clamp(22px,3.2vw,52px)] font-bold leading-tight tracking-tight">{title}</h2>
          {text && <p className={`mt-1.5 max-w-5xl text-[clamp(13px,1.3vw,20px)] ${light ? 'text-site-muted' : 'text-white/70'}`}>{text}</p>}
        </div>
        <div className="hidden md:block shrink-0"><Brand /></div>
      </div>
      <div className="mt-[2.5vh] flex-1 min-h-0">{children}</div>
    </div>
  );
}

function SlideView({ s }: { s: Slide }) {
  if (s.kind === 'cover') {
    return (
      <div className="h-full w-full grid md:grid-cols-2">
        <div className="flex flex-col justify-center px-[6vw] py-10">
          <Brand />
          <p className="mt-[5vh] font-display text-[clamp(12px,1.2vw,18px)] font-bold uppercase tracking-[0.2em] text-site-ochre">Items &amp; supplies · 2026/2027</p>
          <h1 className="mt-3 font-display text-[clamp(34px,5.4vw,88px)] font-black leading-[1.02] tracking-tight">
            Everything for School, Lab, Office &amp; Home.
          </h1>
          <p className="mt-5 text-[clamp(15px,1.6vw,26px)] text-white/75">Name it, we got it. For Quality, For You.</p>
          <p className="mt-[5vh] flex flex-wrap items-center gap-x-4 gap-y-1 text-[clamp(13px,1.2vw,18px)] text-white/70">
            <MapPin className="h-4 w-4 text-site-ochre" /> {BRANCHES.map((b) => b.name).join(' · ')}
          </p>
        </div>
        <div className="relative hidden md:block bg-white">
          <img src={img('booklab-2027-calendar')} alt="Booklab Bookshop 2027 calendar" className="absolute inset-0 h-full w-full object-contain p-[3vh]" />
        </div>
      </div>
    );
  }

  if (s.kind === 'overview') {
    return (
      <Frame eyebrow="What we supply" title="One supplier for the whole school" text="Twelve supply areas, from set books and charts to desks, uniforms, kitchens and gates. Delivered to your school.">
        <div className="grid h-full grid-cols-3 md:grid-cols-4 lg:grid-cols-6 grid-rows-4 md:grid-rows-3 lg:grid-rows-2 gap-[1.2vw]">
          {CATEGORIES.map((c) => (
            <div key={c.title} className="relative overflow-hidden rounded-xl bg-white">
              <img src={img(c.src)} alt="" className="absolute inset-0 h-full w-full object-contain p-2 pb-10" />
              <div className="absolute inset-x-0 bottom-0 bg-site-navy/90 px-2 py-1.5 text-center font-display text-[clamp(10px,1vw,15px)] font-semibold leading-tight">{c.title}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (s.kind === 'offers') {
    return (
      <Frame eyebrow="Featured" title={s.title} text="Prices in Kenya shillings. Delivery to your school available.">
        <div className="grid h-full grid-cols-2 md:grid-cols-4 grid-rows-4 md:grid-rows-2 gap-[1.2vw]">
          {s.offers.map((o, k) => (
            <div key={o.name} className={`relative flex flex-col overflow-hidden rounded-xl bg-white text-site-navy ${k === 0 ? 'md:row-span-2' : ''}`}>
              <div className="relative flex-1 min-h-0">
                <img src={o.src} alt={o.name} className="absolute inset-0 h-full w-full object-contain p-[1vh]" />
              </div>
              <div className="border-t border-site-line px-3 py-2">
                <div className="font-display text-[clamp(12px,1.2vw,19px)] font-bold leading-tight">{o.name}</div>
                {o.note && <div className="text-[clamp(10px,0.9vw,14px)] text-site-muted leading-tight">{o.note}</div>}
              </div>
              {o.price && (
                <div className="absolute right-2 top-2 rounded-lg bg-site-ochre px-2.5 py-1 font-display text-[clamp(12px,1.25vw,20px)] font-black text-white shadow-lg">{o.price}</div>
              )}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (s.kind === 'feature') {
    return (
      <div className="h-full w-full grid md:grid-cols-2">
        <div className="relative bg-white">
          <img src={s.src} alt={s.title} className="absolute inset-0 h-full w-full object-contain p-[4vh]" />
        </div>
        <div className="flex flex-col justify-center px-[5vw] py-8">
          <p className="font-display text-[clamp(12px,1.2vw,18px)] font-bold uppercase tracking-[0.2em] text-site-ochre">{s.eyebrow}</p>
          <h2 className="mt-2 font-display text-[clamp(28px,4vw,64px)] font-black leading-tight tracking-tight">{s.title}</h2>
          <ul className="mt-[3vh] space-y-[1.4vh]">
            {s.points.map((pt) => (
              <li key={pt} className="flex items-center gap-3 text-[clamp(15px,1.7vw,28px)]">
                <span className="grid h-[1.4em] w-[1.4em] shrink-0 place-items-center rounded-full bg-site-sage-ink text-[0.7em] font-bold">✓</span> {pt}
              </li>
            ))}
          </ul>
          <div className="mt-[4vh] inline-flex w-fit rounded-xl bg-site-ochre px-5 py-2.5 font-display text-[clamp(22px,3vw,48px)] font-black">{s.price}</div>
        </div>
      </div>
    );
  }

  if (s.kind === 'gallery') {
    const few = s.pics.length <= 6;
    return (
      <Frame eyebrow={s.eyebrow} title={s.title} text={s.text}>
        <div className={`grid h-full gap-[1.2vw] ${few ? 'grid-cols-2 md:grid-cols-3 grid-rows-3 md:grid-rows-2' : 'grid-cols-2 md:grid-cols-4 grid-rows-4 md:grid-rows-2'}`}>
          {s.pics.map((pic) => (
            <figure key={pic.src} className="relative overflow-hidden rounded-xl bg-white">
              <img src={pic.src} alt={pic.caption ?? ''} className="absolute inset-0 h-full w-full object-contain p-[0.8vh] pb-[4.6vh]" />
              {pic.caption && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-site-navy/90 px-2 py-[0.8vh] text-center font-display text-[clamp(10px,1vw,16px)] font-semibold leading-tight">
                  {pic.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </Frame>
    );
  }

  return (
    <div className="h-full w-full grid md:grid-cols-2">
      <div className="flex flex-col justify-center px-[6vw] py-10">
        <Brand />
        <h2 className="mt-[4vh] font-display text-[clamp(30px,4.6vw,76px)] font-black leading-tight tracking-tight">Order for your school</h2>
        <p className="mt-3 text-[clamp(15px,1.6vw,26px)] text-white/75">Send us your list: we quote, invoice and deliver.</p>
        <div className="mt-[4vh] space-y-[1.6vh] text-[clamp(16px,1.8vw,30px)]">
          {PHONES.map((ph) => (
            <a key={ph} href={tel(ph)} className="flex items-center gap-3 font-display font-bold"><Phone className="h-[1em] w-[1em] text-site-ochre" /> {ph}</a>
          ))}
          <a href={`mailto:${EMAIL}`} className="flex items-center gap-3 font-display font-bold"><Mail className="h-[1em] w-[1em] text-site-ochre" /> {EMAIL}</a>
          <div className="flex items-center gap-3 font-display font-bold">www.booklabbookshop.co.ke</div>
        </div>
        <div className="mt-[4vh] grid grid-cols-3 gap-4 text-[clamp(12px,1.1vw,18px)]">
          {BRANCHES.map((b) => (
            <div key={b.name}>
              <div className="font-display font-bold text-white">{b.name}</div>
              <div className="text-white/60">{b.where}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative hidden md:block bg-black">
        <img src={img('conference-invite')} alt="Booklab Bookshop conference and thanksgiving, 2 November 2026" className="absolute inset-0 h-full w-full object-contain" />
      </div>
    </div>
  );
}
