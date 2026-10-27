import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Minus, Plus, Send, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useRequestList } from '../lib/requestList';
import { PublicHeader } from '../components/PublicHeader';

const field = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:border-primary';

/** Public: review the request list, add contact and delivery details, and send it. */
export default function RequestPage() {
  const list = useRequestList();
  const [form, setForm] = useState({ name: '', phone: '', email: '', organisation: '', location: '', note: '', website: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const r = await api.post<{ number: string }>('/api/public/requests', {
        ...form,
        email: form.email.trim() || undefined,
        organisation: form.organisation.trim() || undefined,
        note: form.note.trim() || undefined,
        website: form.website || undefined,
        items: list.lines.map((l) => ({ bookId: l.bookId, quantity: l.quantity })),
      });
      list.clear();
      setSent(r.number);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your request. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {sent ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[#1a7a4a]" />
            <h1 className="text-2xl font-bold">Request sent</h1>
            <p>
              Your reference is <b className="font-mono">{sent}</b>. We will call you on the number you gave to confirm the
              items, send the invoice and arrange delivery.
            </p>
            <Link to="/catalogue" className="inline-block text-primary hover:underline">Back to the catalogue</Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold">Your request</h1>
              <p className="text-sm text-muted-foreground">Check the items and quantities, then tell us who you are and where to deliver.</p>
            </div>

            {list.count === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                Your request is empty. <Link to="/catalogue" className="text-primary hover:underline">Browse the catalogue</Link>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {list.lines.map((l) => (
                  <div key={l.bookId} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="flex-1 min-w-[180px]">
                      <div className="font-medium">{l.title}</div>
                      <div className="text-xs text-muted-foreground">Per {l.unit.toLowerCase()}</div>
                    </div>
                    <div className="inline-flex items-center rounded-lg border border-input">
                      <button type="button" aria-label="Fewer" className="p-2 hover:bg-muted" onClick={() => list.setQuantity(l.bookId, l.quantity - 1)}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => list.setQuantity(l.bookId, Number(e.target.value.replace(/\D/g, '')))}
                        className="w-16 bg-transparent text-center text-[16px] sm:text-sm outline-none"
                        aria-label={`Quantity of ${l.title}`}
                      />
                      <button type="button" aria-label="More" className="p-2 hover:bg-muted" onClick={() => list.setQuantity(l.bookId, l.quantity + 1)}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button type="button" onClick={() => list.remove(l.bookId)} className="p-2 text-muted-foreground hover:text-[#9b2626]" aria-label={`Remove ${l.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {list.count > 0 && (
              <form onSubmit={send} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h2 className="font-semibold">Your details</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm">
                    <span>Your name *</span>
                    <input required minLength={2} maxLength={120} value={form.name} onChange={set('name')} className={field} autoComplete="name" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Phone *</span>
                    <input required inputMode="tel" minLength={7} maxLength={40} value={form.phone} onChange={set('phone')} className={field} autoComplete="tel" placeholder="07XX XXX XXX" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>School or organisation</span>
                    <input maxLength={160} value={form.organisation} onChange={set('organisation')} className={field} autoComplete="organization" />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Email</span>
                    <input type="email" maxLength={160} value={form.email} onChange={set('email')} className={field} autoComplete="email" />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Deliver to *</span>
                    <input required minLength={2} maxLength={200} value={form.location} onChange={set('location')} className={field} placeholder="School or address, town" />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Anything else we should know</span>
                    <textarea rows={3} maxLength={2000} value={form.note} onChange={set('note')} className={field} />
                  </label>
                  {/* Hidden from people; a bot that fills it is turned away. */}
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} name="website" className="hidden" aria-hidden="true" />
                </div>
                {error && <div className="rounded-lg bg-[#fdf0f0] px-3 py-2 text-sm text-[#9b2626]">{error}</div>}
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" /> {sending ? 'Sending…' : `Send request (${list.count} item${list.count === 1 ? '' : 's'})`}
                </button>
                <p className="text-xs text-muted-foreground">We use your details only to reply to this request and deliver your order.</p>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
