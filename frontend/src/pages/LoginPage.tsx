import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Lock, LogIn, User } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { setAuthUser, useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import { FALLBACK_SLIDE, slideImageUrl, type PromoSlide } from '../lib/promo';
import type { LoginResponse } from '../types';

/** One picture in the login carousel. */
interface Slide {
  key: string;
  src: string;
  alt: string;
  title: string | null;
  subtitle: string | null;
  /** Background behind the picture. */
  tint: string;
  /** A full photo or poster (shown over a blurred copy of itself) rather than a cut-out on a tint. */
  photo: boolean;
}

/** The website's brochure photos — always in the rotation, after any slides set up by the admin. */
const SHOWCASE: Slide[] = [
  {
    key: 'stationery',
    src: '/site/hero-stationery.webp',
    alt: 'Files, exercise books, pens and a calculator',
    title: 'Stationery & office supplies',
    subtitle: 'Exercise books, files, pens, calculators and everything for the office.',
    tint: 'bg-site-ochre-tint',
    photo: false,
  },
  {
    key: 'lab',
    src: '/site/hero-lab.webp',
    alt: 'Flasks, test tubes and a microscope',
    title: 'School lab equipment',
    subtitle: 'Glassware, microscopes and apparatus for school laboratories.',
    tint: 'bg-site-sage',
    photo: false,
  },
  {
    key: 'computer',
    src: '/site/hero-computer.webp',
    alt: 'Desktop computer, monitor, keyboard and mouse',
    title: 'Computers & printers',
    subtitle: 'Desktops, printers and accessories for schools and offices.',
    tint: 'bg-site-azure-tint',
    photo: false,
  },
  {
    key: 'desk',
    src: '/site/hero-desk.jpg',
    alt: 'Wooden school desk and steel chair',
    title: 'School furniture',
    subtitle: 'Desks, chairs, lockers and cabinets, delivered to your school.',
    tint: 'bg-site-alt',
    photo: true,
  },
];

const fromPromo = (p: PromoSlide): Slide => ({
  key: `promo-${p.id}-${p.v}`,
  src: slideImageUrl(p),
  alt: p.title ?? 'Booklab Bookshop',
  title: p.title,
  subtitle: p.subtitle,
  tint: 'bg-site-alt',
  photo: true,
});

const INTERVAL_MS = 6000;

/** Large, framed carousel: each picture shown whole (never cropped), in turn. */
function Showcase({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = slides.length;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => setI(0), [n]);
  useEffect(() => {
    if (paused || reduced || n <= 1) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [i, paused, reduced, n]);

  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const s = slides[i] ?? slides[0];

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-roledescription="carousel"
      aria-label="Booklab Bookshop"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Stage */}
      <div
        className={cn('relative min-h-0 flex-1 overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/10 transition-colors duration-700', s.tint)}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {slides.map((sl, k) => (
          <div
            key={sl.key}
            aria-hidden={k !== i}
            className={cn('absolute inset-0 transition-opacity duration-700', k === i ? 'opacity-100' : 'opacity-0')}
          >
            {sl.photo && (
              <img src={sl.src} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.65]" />
            )}
            <img
              src={sl.src}
              alt={sl.alt}
              loading={k === 0 ? 'eager' : 'lazy'}
              className={cn(
                'absolute inset-0 h-full w-full object-contain transition-transform duration-[1400ms] ease-out',
                sl.photo ? 'p-6 drop-shadow-2xl' : 'p-10 drop-shadow-xl xl:p-16',
                k === i ? 'scale-100' : 'scale-105',
              )}
            />
          </div>
        ))}

        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous picture"
              className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[#2a1a10] shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next picture"
              className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[#2a1a10] shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Caption and position */}
      <div className="mt-6 flex items-end justify-between gap-6 text-white">
        <div aria-live="polite" className="min-w-0">
          {s.title && <h2 className="text-2xl font-semibold leading-tight xl:text-3xl">{s.title}</h2>}
          {s.subtitle && <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 xl:text-base">{s.subtitle}</p>}
        </div>
        {n > 1 && (
          <div className="flex shrink-0 items-center gap-2 pb-1">
            {slides.map((sl, k) => (
              <button
                key={sl.key}
                type="button"
                onClick={() => setI(k)}
                aria-label={`Show picture ${k + 1} of ${n}`}
                aria-current={k === i}
                className={cn(
                  'relative h-1.5 overflow-hidden rounded-full transition-all duration-300',
                  k === i ? 'w-10 bg-white/30' : 'w-2.5 bg-white/40 hover:bg-white/70',
                )}
              >
                {k === i && (
                  <span
                    key={`${sl.key}-${i}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-white"
                    style={{
                      animation: reduced ? undefined : `login-progress ${INTERVAL_MS}ms linear forwards`,
                      animationPlayState: paused ? 'paused' : 'running',
                      width: reduced ? '100%' : undefined,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promo, setPromo] = useState<PromoSlide[]>([]);

  // Return to the page that sent us here — the installed app starts at /app, which
  // then picks the dashboard or the till for the person who signed in.
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const next = from && from !== '/login' ? from : '/dashboard';

  useEffect(() => {
    if (isAuthenticated) navigate(next, { replace: true });
  }, [isAuthenticated, navigate, next]);

  // Sign-in has to work on a cold, offline start, so a failure here is not an
  // error — the built-in pictures simply keep showing.
  useEffect(() => {
    let cancelled = false;
    api
      .get<PromoSlide[]>('/api/promo')
      .then((rows) => {
        if (!cancelled) setPromo(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // The admin's slides (Administration → Login screen) lead; the built-in poster
  // stands in until there are any. The brochure photos always follow.
  const slides: Slide[] = [...(promo.length ? promo : [FALLBACK_SLIDE]).map(fromPromo), ...SHOWCASE];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/api/auth/login', { email: email.trim(), password });
      setAuthUser(res.user, res.token);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const watchCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  const inputCls =
    'w-full rounded-xl border border-input bg-background py-3 pl-10 pr-3 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15';

  return (
    <div className="min-h-screen bg-background md:grid md:h-screen md:grid-cols-12">
      {/* Carousel — 8 of 12 columns */}
      <aside className="relative hidden overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#5a2d0c_0%,#2a1a10_45%,#140c08_100%)] md:col-span-8 md:flex md:flex-col md:p-8 lg:p-10">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.jpeg" alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-white/20" />
          <div className="leading-tight text-white">
            <div className="text-sm font-semibold">Booklab Bookshop</div>
            <div className="text-xs text-white/60">For Quality, For You · Luanda · Kapsabet · Mumias</div>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <Showcase slides={slides} />
        </div>
      </aside>

      {/* Sign-in — 4 of 12 columns */}
      <main className="flex min-h-screen flex-col justify-center border-l border-border bg-background px-6 py-10 sm:px-10 md:col-span-4 md:min-h-0 md:overflow-y-auto md:px-8 lg:px-10 xl:px-14">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-border" />
            <div>
              <div className="text-base font-semibold leading-tight text-foreground">Booklab Bookshop</div>
              <div className="text-xs text-muted-foreground">Staff portal</div>
            </div>
          </div>

          <h1 className="mt-10 text-[28px] font-semibold leading-tight tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in with your username or email to continue.</p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-5">
            {error && (
              <div role="alert" className="rounded-xl border border-[#9b2626]/20 bg-[#fdf0f0] px-4 py-3 text-sm text-[#9b2626]">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-user" className="mb-1.5 block text-sm font-medium text-foreground">
                Username or email
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-user"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. mumias.cashier"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={watchCaps}
                  onKeyDown={watchCaps}
                  onBlur={() => setCapsLock(false)}
                  className={cn(inputCls, 'pr-11')}
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLock && <p className="mt-1.5 text-xs text-[#a26a00]">Caps Lock is on.</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/25 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">Forgot your password? Ask your manager or the administrator.</p>

          <div className="mt-10 border-t border-border pt-6">
            <a href="/" className="inline-flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to booklabbookshop.co.ke
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
