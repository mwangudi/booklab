import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { num } from '../../lib/format';
import { CUSTOMER_TYPES, titleCase } from '../../lib/categories';
import type { Customer } from '../../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader, SectionTitle, Textarea } from '../../components/ui';
import { Select2 } from '../../components/Select2';

export default function CustomerUpsertPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: customers, loading } = useApi<Customer[]>(isEdit ? '/api/invoices/customers?archived=all' : null);
  const existing = useMemo(() => customers?.find((c) => String(c.id) === id) ?? null, [customers, id]);

  const [f, setF] = useState({
    name: '',
    type: 'SCHOOL',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    kraPin: '',
    notes: '',
    chargeVat: true,
    vatMode: 'EXCLUSIVE',
    openingBalance: '0',
    openingBalanceDate: '',
    paymentTermsDays: '30',
    active: true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setF({
      name: existing.name,
      type: existing.type,
      contactPerson: existing.contactPerson ?? '',
      phone: existing.phone ?? '',
      email: existing.email ?? '',
      address: existing.address ?? '',
      kraPin: existing.kraPin ?? '',
      notes: existing.notes ?? '',
      chargeVat: existing.chargeVat,
      vatMode: existing.vatMode,
      openingBalance: String(num(existing.openingBalance)),
      openingBalanceDate: existing.openingBalanceDate ? existing.openingBalanceDate.slice(0, 10) : '',
      paymentTermsDays: String(existing.paymentTermsDays),
      active: existing.active,
    });
  }, [existing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError('Customer name is required.');

    const payload = {
      name: f.name.trim(),
      type: f.type,
      contactPerson: f.contactPerson.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      address: f.address.trim() || null,
      kraPin: f.kraPin.trim() || null,
      notes: f.notes.trim() || null,
      chargeVat: f.chargeVat,
      vatMode: f.vatMode,
      openingBalance: num(f.openingBalance),
      openingBalanceDate: f.openingBalanceDate || null,
      paymentTermsDays: Number(f.paymentTermsDays) || 30,
      active: f.active,
    };
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/api/invoices/customers/${id}`, payload);
      else await api.post('/api/invoices/customers', payload);
      navigate('/customers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the customer.');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit customer' : 'New customer'}
        subtitle="Schools and institutions supplied on credit."
        right={
          <Button variant="outline" onClick={() => navigate('/customers')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <form onSubmit={submit} className="space-y-5">
        {error && <Alert tone="red">{error}</Alert>}

        <Card className="p-4 space-y-4">
          <SectionTitle>Details</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <FormField label="Customer name *">
                <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. St. Mary's Junior School" autoFocus />
              </FormField>
            </div>
            <FormField label="Type">
              <Select2
                value={f.type}
                onChange={(v) => set('type', v)}
                options={CUSTOMER_TYPES.map((t) => ({ value: t, label: titleCase(t) }))}
                searchable={false}
              />
            </FormField>
            <FormField label="Payment terms (days)" hint="Used to age the statement.">
              <Input type="number" min="0" value={f.paymentTermsDays} onChange={(e) => set('paymentTermsDays', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="Contact person">
              <Input value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} placeholder="Head teacher / bursar" />
            </FormField>
            <FormField label="Phone">
              <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07XX XXX XXX" />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </FormField>
            <FormField label="KRA PIN">
              <Input value={f.kraPin} onChange={(e) => set('kraPin', e.target.value)} className="font-mono" />
            </FormField>
            <div className="lg:col-span-2">
              <FormField label="Address">
                <Input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="P.O. Box 123, Luanda" />
              </FormField>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <SectionTitle>VAT</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={f.chargeVat}
                onChange={(e) => set('chargeVat', e.target.checked)}
                className="h-4 w-4 mt-0.5 rounded border-border"
              />
              <span>
                Charge VAT to this customer
                <span className="block text-xs text-muted-foreground">Untick for customers you invoice without VAT.</span>
              </span>
            </label>
            <FormField label="Prices are quoted">
              <Select2
                value={f.vatMode}
                onChange={(v) => set('vatMode', v)}
                options={[
                  { value: 'EXCLUSIVE', label: 'Exclusive of VAT (add on top)' },
                  { value: 'INCLUSIVE', label: 'Inclusive of VAT' },
                ]}
                searchable={false}
              />
            </FormField>
            <div className="text-xs text-muted-foreground lg:col-span-2">
              This is only the default for new invoices — you can still change VAT on any individual invoice, and each
              item keeps its own rate so zero-rated books and standard-rated stationery can share one document.
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <SectionTitle>Opening balance</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Money this customer already owed before they were added here. It appears as &ldquo;Balance forward&rdquo; on
            their statement. Leave at 0 for a new account.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Amount owed (KES)">
              <Input type="number" step="0.01" value={f.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="As at">
              <Input type="date" value={f.openingBalanceDate} onChange={(e) => set('openingBalanceDate', e.target.value)} />
            </FormField>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <SectionTitle>Notes</SectionTitle>
          <FormField label="Internal notes">
            <Textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Delivery instructions, ordering contact, anything useful." />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 rounded border-border" />
            Active account
          </label>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/customers')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
