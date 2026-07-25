import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, PackagePlus, Search } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { BranchSelect, useBranches } from '../components/BranchSelect';
import { money } from '../lib/format';
import type { Book } from '../types';
import { Alert, Button, Card, EmptyState, FormField, Input, Loading, PageHeader, Pill } from '../components/ui';
import { cn } from '../lib/utils';

export default function StockIntakePage() {
  const { isAdmin, branchId: myBranch } = useAuth();
  const navigate = useNavigate();
  const { data: branches } = useBranches();
  const { data: books, loading } = useApi<Book[]>('/api/books');

  const [branchId, setBranchId] = useState<number | null>(myBranch);
  const [search, setSearch] = useState('');
  const [bookId, setBookId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (branchId == null && branches && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const filtered = useMemo(() => {
    const list = books ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 50);
    return list
      .filter((b) => [b.title, b.sku, b.author, b.category].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 50);
  }, [books, search]);

  const selected = books?.find((b) => b.id === bookId) ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!branchId) return setError('Select a branch.');
    if (!bookId) return setError('Select a product to receive.');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return setError('Enter a quantity greater than zero.');

    setSaving(true);
    try {
      await api.post('/api/stock/intake', { branchId: isAdmin ? branchId : undefined, bookId, quantity: qty });
      setDone(true);
      setBookId(null);
      setQuantity('');
      setSearch('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the intake.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receive stock"
        subtitle="Record new stock arriving at a branch. This is logged as a sync-safe movement."
        right={
          <Button variant="outline" onClick={() => navigate('/stock')}>
            <ArrowLeft className="h-4 w-4" /> Back to stock
          </Button>
        }
      />

      {done && (
        <div className="rounded-lg border border-[#1a7a4a]/20 bg-[#e8f5ee] px-4 py-3 text-sm text-[#1a7a4a] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Stock received and added to on-hand quantity.
        </div>
      )}

      <Card className="p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}

          {isAdmin && (
            <FormField label="Branch">
              <BranchSelect value={branchId} onChange={setBranchId} className="sm:w-64" />
            </FormField>
          )}

          <FormField label="Product">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products to receive…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {filtered.length === 0 ? (
                <EmptyState title="No products found" hint="Try another search." />
              ) : (
                filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBookId(b.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/50',
                      bookId === b.id && 'bg-primary/5',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{b.title}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{b.sku}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.category && <Pill tone="blue">{b.category}</Pill>}
                      <span className="text-xs font-mono text-muted-foreground">{money(b.unitPrice)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </FormField>

          {selected && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              Selected: <b className="text-foreground">{selected.title}</b> <span className="font-mono text-muted-foreground">({selected.sku})</span>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Quantity received">
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="font-mono" />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate('/stock')}>
              Done
            </Button>
            <Button type="submit" loading={saving} disabled={!bookId}>
              <PackagePlus className="h-4 w-4" /> Receive stock
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
