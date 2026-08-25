import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { BOOK_CATEGORIES, PRODUCT_CATEGORIES, PRODUCT_UNITS } from '../lib/categories';
import { num } from '../lib/format';
import type { Book } from '../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader } from '../components/ui';
import { Select2 } from '../components/Select2';

interface BranchStock {
  branchId: number;
  branchName: string;
  branchCode: string;
  quantity: number;
  price: string | number | null;
}

interface FormState {
  title: string;
  category: string;
  unit: string;
  vatRate: string;
  author: string;
  isbn: string;
  sku: string;
  unitPrice: string;
  priceWholesale: string;
  priceSchool: string;
  costPrice: string;
}

const empty: FormState = { title: '', category: 'Textbook', unit: 'Piece', vatRate: '16', author: '', isbn: '', sku: '', unitPrice: '', priceWholesale: '', priceSchool: '', costPrice: '' };

export default function ProductUpsertPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  // No single-book endpoint on the backend, so load the catalogue and pick one.
  const { data: books, loading } = useApi<Book[]>(isEdit ? '/api/books' : null);
  const existing = useMemo(() => books?.find((b) => String(b.id) === id) ?? null, [books, id]);

  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { canManage } = useAuth();
  const { data: branchStock, refresh: refreshStock } = useApi<BranchStock[]>(
    isEdit && canManage ? `/api/stock/book/${id}` : null,
  );
  // Keyed by branch so an untouched branch is never written back.
  const [qty, setQty] = useState<Record<number, string>>({});
  const [branchPrice, setBranchPrice] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!branchStock) return;
    setQty(Object.fromEntries(branchStock.map((s) => [s.branchId, String(s.quantity)])));
    setBranchPrice(Object.fromEntries(branchStock.map((s) => [s.branchId, s.price == null ? '' : String(num(s.price))])));
  }, [branchStock]);

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        category: existing.category ?? 'Other',
        unit: existing.unit || 'Piece',
        vatRate: String(num(existing.vatRate)),
        author: existing.author ?? '',
        isbn: existing.isbn ?? '',
        sku: existing.sku,
        unitPrice: String(num(existing.unitPrice)),
        priceWholesale: existing.priceWholesale != null ? String(num(existing.priceWholesale)) : '',
        priceSchool: existing.priceSchool != null ? String(num(existing.priceSchool)) : '',
        costPrice: String(num(existing.costPrice)),
      });
    }
  }, [existing]);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const showBookFields = BOOK_CATEGORIES.has(form.category);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.sku.trim()) {
      setError('Title and SKU are required.');
      return;
    }
    const unitPrice = num(form.unitPrice);
    const costPrice = num(form.costPrice);
    if (unitPrice < 0 || costPrice < 0) {
      setError('Prices cannot be negative.');
      return;
    }

    // Omit empty optional fields — ISBN is unique, so never send an empty string.
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      sku: form.sku.trim(),
      category: form.category || undefined,
      unit: form.unit || 'Piece',
      vatRate: num(form.vatRate),
      author: form.author.trim() || undefined,
      isbn: form.isbn.trim() || undefined,
      unitPrice,
      costPrice,
      priceWholesale: form.priceWholesale.trim() === '' ? null : num(form.priceWholesale),
      priceSchool: form.priceSchool.trim() === '' ? null : num(form.priceSchool),
    };

    setSaving(true);
    try {
      if (isEdit) await api.patch(`/api/books/${id}`, payload);
      else await api.post('/api/books', payload);

      // Only branches the user actually changed are written, so this never
      // records a stock movement for a field nobody touched.
      if (isEdit && branchStock) {
        for (const s of branchStock) {
          const newQty = Math.round(num(qty[s.branchId]));
          if (String(newQty) !== String(s.quantity)) {
            await api.put('/api/stock', { branchId: s.branchId, bookId: Number(id), quantity: newQty, note: 'Set from the product page' });
          }
          const raw = (branchPrice[s.branchId] ?? '').trim();
          const wanted = raw === '' ? null : num(raw);
          const current = s.price == null ? null : num(s.price);
          if (wanted !== current) {
            await api.put('/api/stock/price', { branchId: s.branchId, bookId: Number(id), price: wanted });
          }
        }
        refreshStock();
      }
      navigate('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit product' : 'New product'}
        subtitle="Books, textbooks, exercise books, story books, stationery and more."
        right={
          <Button variant="outline" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <Card className="p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <FormField label="Title / name *" hint="e.g. “Blossoms of the Savannah”, “KB A4 Exercise Book 200pg”, “Bic Ballpoint Pen”.">
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Product name" autoFocus />
              </FormField>
            </div>
            <FormField label="Category *">
              <Select2
                value={form.category}
                onChange={(v) => set('category', v)}
                options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </FormField>
            <FormField label="SKU / product code *" hint="Unique internal code used at the till.">
              <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="BK-0001" className="font-mono" />
            </FormField>
            <FormField label="Sold in" hint="Pieces, dozens, reams, cartons, metres, litres…">
              <Select2
                value={form.unit}
                onChange={(v) => set('unit', v)}
                options={PRODUCT_UNITS.map((u) => ({ value: u, label: u }))}
                searchable={false}
              />
            </FormField>
            <FormField label="VAT rate (%)" hint="Printed books are usually zero-rated; stationery is 16%.">
              <Input type="number" min="0" max="100" step="0.5" value={form.vatRate} onChange={(e) => set('vatRate', e.target.value)} className="font-mono" />
            </FormField>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Book details {showBookFields ? '' : '(optional — mainly for books)'}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <FormField label="Author / publisher">
                  <Input value={form.author} onChange={(e) => set('author', e.target.value)} placeholder="e.g. Chinua Achebe" />
                </FormField>
              </div>
              <div className="lg:col-span-2">
                <FormField label="ISBN">
                  <Input value={form.isbn} onChange={(e) => set('isbn', e.target.value)} placeholder="9780000000000" className="font-mono" />
                </FormField>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Pricing — leave wholesale and school blank to charge the retail price
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField label="Cost price (KES) *" hint="What you pay the supplier — used for profit/COGS.">
                <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} placeholder="0" className="font-mono" />
              </FormField>
              <FormField label="Retail price (KES) *" hint="Default walk-in selling price.">
                <Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="0" className="font-mono" />
              </FormField>
              <FormField label="Wholesale price (KES)">
                <Input type="number" min="0" step="0.01" value={form.priceWholesale} onChange={(e) => set('priceWholesale', e.target.value)} placeholder={form.unitPrice || '0'} className="font-mono" />
              </FormField>
              <FormField label="School price (KES)">
                <Input type="number" min="0" step="0.01" value={form.priceSchool} onChange={(e) => set('priceSchool', e.target.value)} placeholder={form.unitPrice || '0'} className="font-mono" />
              </FormField>
            </div>
          </div>

          {isEdit && canManage && branchStock && branchStock.length > 0 && (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Stock by branch</p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Changing a quantity here records a stock take against your name, exactly as the stock page does.
                Leave a branch price blank to charge the retail price above.
              </p>
              <div className="space-y-3">
                {branchStock.map((s) => (
                  <div key={s.branchId} className="grid sm:grid-cols-3 gap-3 items-end">
                    <div className="text-sm text-foreground">
                      <span className="font-medium">{s.branchName}</span>
                      <span className="text-muted-foreground text-xs ml-2">{s.branchCode}</span>
                    </div>
                    <FormField label="Quantity on hand">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={qty[s.branchId] ?? ''}
                        onChange={(e) => setQty((q) => ({ ...q, [s.branchId]: e.target.value }))}
                        className="font-mono"
                      />
                    </FormField>
                    <FormField label="Branch price (KES)">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={branchPrice[s.branchId] ?? ''}
                        onChange={(e) => setBranchPrice((p) => ({ ...p, [s.branchId]: e.target.value }))}
                        placeholder={form.unitPrice || '0'}
                        className="font-mono"
                      />
                    </FormField>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
