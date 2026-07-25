import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { BOOK_CATEGORIES, PRODUCT_CATEGORIES } from '../lib/categories';
import { num } from '../lib/format';
import type { Book } from '../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader } from '../components/ui';
import { Select2 } from '../components/Select2';

interface FormState {
  title: string;
  category: string;
  author: string;
  isbn: string;
  sku: string;
  unitPrice: string;
  priceWholesale: string;
  priceSchool: string;
  costPrice: string;
}

const empty: FormState = { title: '', category: 'Textbook', author: '', isbn: '', sku: '', unitPrice: '', priceWholesale: '', priceSchool: '', costPrice: '' };

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

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        category: existing.category ?? 'Other',
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
