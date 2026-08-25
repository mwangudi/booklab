import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { setAuthUser, useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import { FALLBACK_SLIDE, slideImageUrl, type PromoSlide } from '../lib/promo';
import type { LoginResponse } from '../types';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);
  const [slides, setSlides] = useState<PromoSlide[]>([FALLBACK_SLIDE]);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  // Sign-in has to work on a cold, offline start, so a failure here is not an
  // error — it just leaves the built-in picture showing.
  useEffect(() => {
    let cancelled = false;
    api
      .get<PromoSlide[]>('/api/promo')
      .then((rows) => {
        if (!cancelled && rows.length) setSlides(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSlide(0);
    if (slides.length <= 1) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
      setAuthUser(res.user, res.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  const current = slides[slide] ?? slides[0];

  return (
    <div className="min-h-screen grid md:grid-cols-12 bg-background">
      {/* Promo carousel */}
      <div className="hidden md:block md:col-span-7 relative bg-black overflow-hidden">
        {slides.map((s, i) => (
          <img
            key={`${s.id}-${s.v}`}
            src={slideImageUrl(s)}
            alt={s.title ?? 'Booklab Bookshop'}
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700', i === slide ? 'opacity-100' : 'opacity-0')}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
        <div className="absolute top-8 left-8">
          <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-14 rounded-lg ring-1 ring-white/20" />
        </div>
        {(current?.title || current?.subtitle) && (
          <div className="absolute bottom-12 left-8 right-8 text-white">
            {current.title && <h2 className="text-3xl font-bold leading-tight">{current.title}</h2>}
            {current.subtitle && <p className="mt-3 text-white/85 max-w-md">{current.subtitle}</p>}
          </div>
        )}
        {slides.length > 1 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className={cn('h-1.5 rounded-full transition-all', i === slide ? 'w-6 bg-white' : 'w-1.5 bg-white/50')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sign-in form */}
      <div className="md:col-span-5 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-16 rounded-lg mb-8 md:hidden" />

          <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to the staff portal to continue.</p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            {error && (
              <div className="rounded-lg border border-[#9b2626]/20 bg-[#fdf0f0] px-4 py-3 text-sm text-[#9b2626]">{error}</div>
            )}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username or email</label>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="e.g. mumias.cashier"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Sign in
            </button>
          </form>

          <a href="/" className="mt-6 block text-center text-xs text-primary hover:underline">
            ← Back to booklabbookshop.co.ke
          </a>
        </div>
      </div>
    </div>
  );
}
