import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Minus, Plus, Printer, Search, ShoppingCart, Smartphone, Trash2, XCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { useBranches } from '../components/BranchSelect';
import { dateTime, fmt, money, num } from '../lib/format';
import { PAYMENT_METHODS, PRICE_TIERS, type PaymentMethod, type PriceTier } from '../lib/categories';
import { printReceipt, type ReceiptData } from '../lib/printReceipt';
import { getReceiptSettings } from '../lib/receiptSettings';
import { reprintSale } from '../lib/reprint';
import type { Sale, Stock } from '../types';
import { BranchSelect } from '../components/BranchSelect';
import { Alert, Button, Card, EmptyState, Input, Modal, Pill } from '../components/ui';
import { Select2 } from '../components/Select2';
import { cn } from '../lib/utils';

interface CartLine {
  bookId: number;
  title: string;
  sku: string;
  unitPrice: number;
  /** Admin-set price for the selected tier; the cashier may charge more but never less. */
  minPrice: number;
  quantity: number;
  available: number;
}

type MpesaStage = 'idle' | 'pushing' | 'waiting' | 'success' | 'failed';
interface MpesaState {
  stage: MpesaStage;
  message?: string;
  checkoutRequestId?: string;
  mock?: boolean;
}

/** Effective unit price for a stock row given the selected customer tier. */
const tierPrice = (row: Stock, tier: PriceTier): number => {
  const retail = num(row.price ?? row.book.unitPrice);
  if (tier === 'WHOLESALE') return num(row.book.priceWholesale ?? retail);
  if (tier === 'SCHOOL') return num(row.book.priceSchool ?? retail);
  return retail;
};

const TIER_OPTIONS: Array<{ value: PriceTier; label: string }> = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'SCHOOL', label: 'School' },
];

export default function PosPage() {
  const { isAdmin, branchId: myBranch, user } = useAuth();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(isAdmin ? null : myBranch);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [tier, setTier] = useState<PriceTier>('RETAIL');
  const [phone, setPhone] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; total: number; receipt: ReceiptData } | null>(null);
  const [mpesa, setMpesa] = useState<MpesaState>({ stage: 'idle' });

  const stockPath = branchId ? `/api/stock/branch/${branchId}` : null;
  const { data: stock, loading, refresh } = useApi<Stock[]>(stockPath, [branchId]);
  const { data: mpesaCfg } = useApi<{ mock: boolean; env: string }>('/api/mpesa/config');

  const branch = branches?.find((b) => b.id === branchId) ?? null;

  const pollRef = useRef<number | null>(null);
  const triesRef = useRef(0);
  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    triesRef.current = 0;
  };

  // Reset when the branch changes; clean up any in-flight M-Pesa poll on unmount.
  useEffect(() => {
    setCart([]);
    setDone(null);
    stopPolling();
    setMpesa({ stage: 'idle' });
  }, [branchId]);
  useEffect(() => () => stopPolling(), []);

  const filtered = useMemo(() => {
    const rows = stock ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.book.title, r.book.sku, r.book.author, r.book.isbn, r.book.category]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [stock, search]);

  const inCart = (bookId: number) => cart.find((l) => l.bookId === bookId)?.quantity ?? 0;

  const addToCart = (row: Stock) => {
    setDone(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.bookId === row.bookId);
      if (existing) {
        if (existing.quantity >= row.quantity) return prev;
        return prev.map((l) => (l.bookId === row.bookId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (row.quantity <= 0) return prev;
      return [
        ...prev,
        { bookId: row.bookId, title: row.book.title, sku: row.book.sku, unitPrice: tierPrice(row, tier), minPrice: tierPrice(row, tier), quantity: 1, available: row.quantity },
      ];
    });
  };

  const setQty = (bookId: number, qty: number) =>
    setCart((prev) =>
      prev.flatMap((l) => {
        if (l.bookId !== bookId) return [l];
        const clamped = Math.max(0, Math.min(qty, l.available));
        return clamped === 0 ? [] : [{ ...l, quantity: clamped }];
      }),
    );

  // Prices may be raised at the till but never dropped below the configured price.
  const setPrice = (bookId: number, price: number) =>
    setCart((prev) =>
      prev.map((l) => {
        if (l.bookId !== bookId) return l;
        if (price < l.minPrice) {
          setError(`${l.title} cannot be sold below ${money(l.minPrice)}.`);
          return { ...l, unitPrice: l.minPrice };
        }
        setError(null);
        return { ...l, unitPrice: price };
      }),
    );

  const removeLine = (bookId: number) => setCart((prev) => prev.filter((l) => l.bookId !== bookId));

  // Switching customer tier re-prices every line from the current stock data.
  const changeTier = (t: PriceTier) => {
    setTier(t);
    setCart((prev) =>
      prev.map((l) => {
        const row = (stock ?? []).find((s) => s.bookId === l.bookId);
        return row ? { ...l, unitPrice: tierPrice(row, t), minPrice: tierPrice(row, t) } : l;
      }),
    );
  };

  const total = cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const change = method === 'CASH' && cashGiven ? num(cashGiven) - total : 0;

  const finalizeSale = async (mpesaRef?: string | null) => {
    setSubmitting(true);
    setError(null);
    // Snapshot the cart before it is cleared, so the receipt reflects the sale.
    const lines = cart.map((l) => ({ title: l.title, qty: l.quantity, unitPrice: l.unitPrice }));
    const paidCash = method === 'CASH' && cashGiven ? num(cashGiven) : undefined;
    const totalNow = total;
    try {
      const sale = await api.post<Sale>('/api/sales', {
        branchId: isAdmin ? branchId : undefined,
        paymentMethod: method,
        priceTier: tier,
        mpesaRef: method === 'MPESA' ? mpesaRef ?? undefined : undefined,
        items: cart.map((l) => ({ bookId: l.bookId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      const receipt: ReceiptData = {
        receiptNo: sale.id,
        dateTime: dateTime(sale.createdAt ?? new Date().toISOString()),
        branchName: branch?.name,
        branchLocation: branch?.location,
        cashier: user?.name,
        paymentMethod: method,
        mpesaRef: mpesaRef ?? undefined,
        items: lines,
        total: num(sale.total),
        cashGiven: paidCash,
        change: paidCash != null ? paidCash - totalNow : undefined,
      };
      setDone({ id: sale.id, total: num(sale.total), receipt });
      if (getReceiptSettings().autoPrint) printReceipt(receipt);
      setCart([]);
      setPhone('');
      setCashGiven('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete the sale.');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      triesRef.current += 1;
      try {
        const s = await api.get<{ status: string; mpesaReceipt?: string | null; resultDesc?: string | null }>(
          `/api/mpesa/status?checkoutRequestId=${encodeURIComponent(id)}`,
        );
        if (s.status === 'SUCCESS') {
          stopPolling();
          setMpesa({ stage: 'success', message: s.mpesaReceipt ?? undefined });
          try {
            await finalizeSale(s.mpesaReceipt ?? null);
          } finally {
            setMpesa({ stage: 'idle' });
          }
        } else if (s.status === 'FAILED' || s.status === 'CANCELLED') {
          stopPolling();
          setMpesa({ stage: 'failed', message: s.resultDesc || `Payment ${s.status.toLowerCase()}.` });
        }
      } catch {
        /* transient network error — keep polling */
      }
      if (triesRef.current >= 40) {
        stopPolling();
        setMpesa({ stage: 'failed', message: 'Timed out waiting for payment confirmation.' });
      }
    }, 3000);
  };

  const startMpesa = async () => {
    setError(null);
    if (!phone.trim()) {
      setError("Enter the customer's M-Pesa phone number.");
      return;
    }
    setMpesa({ stage: 'pushing' });
    try {
      const res = await api.post<{ checkoutRequestId: string; customerMessage: string; mock: boolean }>('/api/mpesa/stk', {
        amount: total,
        phone: phone.trim(),
        accountRef: 'Booklab',
        branchId: isAdmin ? branchId ?? undefined : undefined,
      });
      setMpesa({ stage: 'waiting', checkoutRequestId: res.checkoutRequestId, message: res.customerMessage, mock: res.mock });
      startPolling(res.checkoutRequestId);
    } catch (err) {
      setMpesa({ stage: 'failed', message: err instanceof ApiError ? err.message : 'Could not start the M-Pesa payment.' });
    }
  };

  const checkout = async () => {
    if (cart.length === 0) return;
    if (isAdmin && !branchId) {
      setError('Select a branch first.');
      return;
    }
    if (method === 'MPESA') {
      startMpesa();
      return;
    }
    try {
      await finalizeSale();
    } catch {
      /* error already surfaced */
    }
  };

  const cancelMpesa = () => {
    stopPolling();
    setMpesa({ stage: 'idle' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Point of Sale</h1>
          <p className="text-sm text-muted-foreground">Sell books, stationery and more.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Tier is switched constantly at the till, so it stays one tap away. */}
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="tablist" aria-label="Price tier">
            {TIER_OPTIONS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tier === t.value}
                onClick={() => changeTier(t.value)}
                className={cn(
                  'flex-1 sm:flex-none px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                  tier === t.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <div className="sm:w-56">
              <BranchSelect value={branchId} onChange={setBranchId} />
            </div>
          )}
        </div>
      </div>

      {isAdmin && !branchId ? (
        <Card className="p-10">
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" />}
            title="Choose a branch to start selling"
            hint="Pick the branch whose stock you want to sell from."
          />
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
          {/* Catalogue */}
          <Card className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by title, SKU, author, ISBN or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Loading catalogue…</p>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<Search className="h-8 w-8" />} title="No matching products" hint="Try a different search, or add the product to your catalogue." />
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
                {filtered.map((row) => {
                  const remaining = row.quantity - inCart(row.bookId);
                  const soldOut = remaining <= 0;
                  return (
                    <button
                      key={row.bookId}
                      onClick={() => addToCart(row)}
                      disabled={soldOut}
                      className={cn(
                        'text-left rounded-lg border p-3 transition-colors',
                        soldOut ? 'border-border bg-muted/40 opacity-60 cursor-not-allowed' : 'border-border bg-card hover:border-primary hover:shadow-sm',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-foreground line-clamp-2">{row.book.title}</span>
                        {row.book.category && <Pill tone="blue">{row.book.category}</Pill>}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground font-mono">{row.book.sku}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-semibold font-mono text-foreground">{money(tierPrice(row, tier))}</span>
                        <span className={cn('text-[11px]', soldOut ? 'text-[#9b2626]' : 'text-muted-foreground')}>
                          {soldOut ? 'Out of stock' : `${fmt(remaining)} in stock`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Cart */}
          <Card className="p-4 lg:sticky lg:top-20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" /> Cart
                {cart.length > 0 && <Pill tone="blue">{cart.length}</Pill>}
              </h3>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-muted-foreground hover:text-[#9b2626]">
                  Clear
                </button>
              )}
            </div>

            {done && (
              <div className="mb-3 rounded-lg border border-[#1a7a4a]/20 bg-[#e8f5ee] px-3 py-2.5 text-sm text-[#1a7a4a]">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Sale #{done.id} completed — <b>{money(done.total)}</b>.
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => printReceipt(done.receipt)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1a7a4a] hover:underline"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print receipt
                  </button>
                  <button
                    onClick={() => reprintSale(done.id, user?.name)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1a7a4a] hover:underline"
                    title="Prints a copy stamped DUPLICATE and records it in the audit log"
                  >
                    <Printer className="h-3.5 w-3.5" /> Duplicate copy
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3">
                <Alert tone="red">{error}</Alert>
              </div>
            )}

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No items yet. Tap a product to add it.</p>
            ) : (
              <div className="space-y-2 max-h-[34vh] overflow-y-auto pr-1">
                {cart.map((l) => (
                  <div key={l.bookId} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{l.title}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{l.sku}</div>
                      </div>
                      <button onClick={() => removeLine(l.bookId)} className="text-muted-foreground hover:text-[#9b2626]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-lg border border-border">
                        <button className="p-1.5 hover:bg-muted" onClick={() => setQty(l.bookId, l.quantity - 1)}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          value={l.quantity}
                          onChange={(e) => setQty(l.bookId, Number(e.target.value) || 0)}
                          className="w-10 text-center text-sm bg-transparent outline-none"
                        />
                        <button className="p-1.5 hover:bg-muted disabled:opacity-40" disabled={l.quantity >= l.available} onClick={() => setQty(l.bookId, l.quantity + 1)}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>@</span>
                        <input
                          value={l.unitPrice}
                          onChange={(e) => setPrice(l.bookId, Number(e.target.value) || 0)}
                          title={`Minimum ${money(l.minPrice)}`}
                          className={cn(
                            'w-20 text-right rounded-md border bg-background px-1.5 py-1 text-sm font-mono outline-none focus:border-primary',
                            l.unitPrice > l.minPrice ? 'border-[#1a7a4a]' : 'border-input',
                          )}
                        />
                      </div>
                    </div>
                    {l.unitPrice > l.minPrice && (
                      <div className="mt-1 text-right text-[11px] text-muted-foreground">Set price {money(l.minPrice)}</div>
                    )}
                    <div className="mt-1.5 text-right text-sm font-semibold font-mono text-foreground">{money(l.quantity * l.unitPrice)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Payment method</label>
                <Select2
                  value={method}
                  onChange={(v) => setMethod(v as PaymentMethod)}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                  searchable={false}
                />
              </div>

              {method === 'MPESA' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Customer M-Pesa number</label>
                  <Input inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  {mpesaCfg?.mock && <p className="text-[11px] text-[#8a5a00] mt-1">Test mode — payment will be simulated (no real STK push).</p>}
                </div>
              )}

              {method === 'CASH' && cart.length > 0 && (
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="Cash received" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} />
                  <div className="text-right text-xs text-muted-foreground w-28 shrink-0">
                    Change
                    <div className={cn('text-sm font-semibold font-mono', change < 0 ? 'text-[#9b2626]' : 'text-foreground')}>{money(Math.max(0, change))}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span className="font-mono">{money(total)}</span>
              </div>

              <Button className="w-full" size="md" onClick={checkout} loading={submitting} disabled={cart.length === 0}>
                {method === 'MPESA' ? (
                  <>
                    <Smartphone className="h-4 w-4" /> Charge via M-Pesa
                  </>
                ) : (
                  'Complete sale'
                )}
              </Button>
              <Link to="/sales" className="block text-center text-xs text-muted-foreground hover:text-foreground">
                View recent sales
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* M-Pesa STK push status */}
      <Modal
        open={mpesa.stage !== 'idle'}
        onClose={mpesa.stage === 'waiting' || mpesa.stage === 'pushing' ? cancelMpesa : () => setMpesa({ stage: 'idle' })}
        title="M-Pesa payment"
        footer={
          mpesa.stage === 'failed' ? (
            <>
              <Button variant="outline" onClick={() => setMpesa({ stage: 'idle' })}>
                Close
              </Button>
              <Button onClick={startMpesa}>Try again</Button>
            </>
          ) : mpesa.stage === 'waiting' || mpesa.stage === 'pushing' ? (
            <Button variant="outline" onClick={cancelMpesa}>
              Cancel
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col items-center text-center gap-3 py-4">
          {(mpesa.stage === 'pushing' || mpesa.stage === 'waiting') && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
          {mpesa.stage === 'success' && <CheckCircle2 className="h-10 w-10 text-[#1a7a4a]" />}
          {mpesa.stage === 'failed' && <XCircle className="h-10 w-10 text-[#9b2626]" />}

          <div className="text-sm text-foreground">
            {mpesa.stage === 'pushing' && 'Sending payment request…'}
            {mpesa.stage === 'waiting' && (mpesa.message || 'Waiting for the customer to enter their M-Pesa PIN…')}
            {mpesa.stage === 'success' && 'Payment received. Finalising sale…'}
            {mpesa.stage === 'failed' && (mpesa.message || 'Payment failed.')}
          </div>

          {mpesa.stage === 'waiting' && (
            <div className="text-xs text-muted-foreground">
              <div>
                <b className="font-mono">{money(total)}</b> to {phone}
              </div>
              {mpesa.mock && <div className="text-[#8a5a00] mt-1">Simulated payment — confirming automatically…</div>}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
