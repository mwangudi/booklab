import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { setAuthUser, useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import type { LoginResponse } from '../types';

// Promotional images shown on the login screen. Drop more files into
// `public/promo/` and add their paths here — they rotate automatically.
const PROMO_IMAGES = ['/promo/madaraka-day.jpeg'];

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('admin@booklabbookshop.co.ke');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (PROMO_IMAGES.length <= 1) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % PROMO_IMAGES.length), 5000);
    return () => clearInterval(t);
  }, []);

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

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Promo carousel */}
      <div className="hidden lg:block relative bg-black overflow-hidden">
        {PROMO_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt="Booklab Bookshop promotion"
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700', i === slide ? 'opacity-100' : 'opacity-0')}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
        <div className="absolute top-8 left-8">
          <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-14 rounded-lg ring-1 ring-white/20" />
        </div>
        <div className="absolute bottom-12 left-8 right-8 text-white">
          <h2 className="text-3xl font-bold leading-tight">For Quality, For You</h2>
          <p className="mt-3 text-white/85 max-w-md">
            Books, textbooks, exercise &amp; story books, stationery and lab equipment — across our Luanda, Kapsabet and
            Mumias branches.
          </p>
        </div>
        {PROMO_IMAGES.length > 1 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {PROMO_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className={cn('h-1.5 rounded-full transition-all', i === slide ? 'w-6 bg-white' : 'w-1.5 bg-white/50')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sign-in form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-16 rounded-lg mb-8 lg:hidden" />

          <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to the staff portal to continue.</p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            {error && (
              <div className="rounded-lg border border-[#9b2626]/20 bg-[#fdf0f0] px-4 py-3 text-sm text-[#9b2626]">{error}</div>
            )}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@booklabbookshop.co.ke"
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

          <p className="mt-6 text-[11px] text-muted-foreground text-center">
            Demo admin: <span className="font-mono">admin@booklabbookshop.co.ke</span> / <span className="font-mono">admin123</span>
          </p>
          <a href="/" className="mt-4 block text-center text-xs text-primary hover:underline">
            ← Back to booklabbookshop.co.ke
          </a>
        </div>
      </div>
    </div>
  );
}
