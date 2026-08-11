import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, FileText, Pencil, Plus, Save, Truck, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmt, money, num } from '../../lib/format';
import { downloadCsv } from '../../lib/reportExport';
import type { Supplier, SupplierBalance } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, Modal, PageHeader, RowAction, RowActions, Textarea } from '../../components/ui';

const blank = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  kraPin: '',
  notes: '',
  openingBalance: '0',
  openingBalanceDate: '',
  paymentTermsDays: '30',
};

export default function SuppliersPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: suppliers, loading, refresh } = useApi<Supplier[]>(
    `/api/goods-receipts/suppliers${showArchived ? '?archived=only' : ''}`,
    [showArchived],
  );
  const { data: balances } = useApi<SupplierBalance[]>('/api/goods-receipts/suppliers/balances');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balanceById = useMemo(() => new Map((balances ?? []).map((b) => [b.id, b])), [balances]);
  const rows = suppliers ?? [];
  const owed = (balances ?? []).reduce((s, b) => s + b.balance, 0);

  const openNew = () => {
    setEditing(null);
    setF(blank);
    setError(null);
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setF({
      name: s.name,
      contactPerson: s.contactPerson ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      kraPin: s.kraPin ?? '',
      notes: s.notes ?? '',
      openingBalance: String(num(s.openingBalance)),
      openingBalanceDate: s.openingBalanceDate ? s.openingBalanceDate.slice(0, 10) : '',
      paymentTermsDays: String(s.paymentTermsDays),
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!f.name.trim()) return setError('Supplier name is required.');
    setBusy(true);
    setError(null);
    const payload = {
      name: f.name.trim(),
      contactPerson: f.contactPerson.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      address: f.address.trim() || null,
      kraPin: f.kraPin.trim() || null,
      notes: f.notes.trim() || null,
      openingBalance: num(f.openingBalance),
      openingBalanceDate: f.openingBalanceDate || null,
      paymentTermsDays: Number(f.paymentTermsDays) || 30,
    };
    try {
      if (editing) await api.patch(`/api/goods-receipts/suppliers/${editing.id}`, payload);
      else await api.post('/api/goods-receipts/suppliers', payload);
      setOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the supplier.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, fail: string) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fail);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      'supplier-balances.csv',
      ['Supplier', 'Contact', 'Phone', 'Receipts', 'Billed', 'Paid', 'Balance owed'],
      (balances ?? []).map((b) => [b.name, b.contactPerson ?? '', b.phone ?? '', b.receipts, Math.round(b.billed), Math.round(b.paid), Math.round(b.balance)]),
    );

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      accessor: (s) => s.name,
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-medium text-foreground">{s.name}</div>
          {s.contactPerson && <div className="text-[11px] text-muted-foreground">{s.contactPerson}</div>}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (s) => s.phone ?? '—' },
    { key: 'terms', header: 'Terms', align: 'right', render: (s) => `${s.paymentTermsDays} days` },
    {
      key: 'receipts',
      header: 'Receipts',
      align: 'right',
      accessor: (s) => balanceById.get(s.id)?.receipts ?? 0,
      sortable: true,
      render: (s) => fmt(balanceById.get(s.id)?.receipts ?? 0),
    },
    {
      key: 'balance',
      header: 'We owe',
      align: 'right',
      accessor: (s) => balanceById.get(s.id)?.balance ?? 0,
      sortable: true,
      render: (s) => {
        const b = balanceById.get(s.id)?.balance ?? 0;
        return <span className={b > 0 ? 'font-mono font-semibold text-[#9b2626]' : 'font-mono text-muted-foreground'}>{money(b)}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <RowActions>
          {s.deletedAt ? (
            <RowAction
              onClick={() => act(() => api.post(`/api/goods-receipts/suppliers/${s.id}/restore`), 'Could not restore.')}
              icon={<ArchiveRestore className="h-4 w-4" />}
              label="Restore supplier"
            />
          ) : (
            <>
              <RowAction to={`/suppliers/${s.id}/statement`} icon={<FileText className="h-4 w-4" />} label="Statement / reconciliation" />
              <RowAction onClick={() => openEdit(s)} icon={<Pencil className="h-4 w-4" />} label="Edit supplier" />
              <RowAction
                onClick={() => act(() => api.delete(`/api/goods-receipts/suppliers/${s.id}`), 'Could not archive.')}
                icon={<Archive className="h-4 w-4" />}
                label="Archive supplier"
                tone="danger"
              />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={showArchived ? 'Archived suppliers' : 'Suppliers'}
        subtitle="Who we buy from, and what we owe them."
        right={
          <>
            <Link to="/goods-receipts">
              <Button variant="outline">
                <Truck className="h-4 w-4" /> Goods received
              </Button>
            </Link>
            <Button variant="outline" onClick={exportCsv} disabled={!balances?.length}>
              Export balances
            </Button>
            <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Active list' : 'Archived'}
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> New supplier
            </Button>
          </>
        }
      />

      {error && !open && <Alert tone="red">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Suppliers" value={fmt(rows.length)} tone="blue" icon={<Truck className="h-4 w-4" />} />
        <KpiCard label="Owing" value={fmt((balances ?? []).filter((b) => b.balance > 0).length)} tone="amber" />
        <KpiCard label="Total payable" value={money(owed)} tone={owed > 0 ? 'red' : 'green'} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(s) => `${s.name} ${s.contactPerson ?? ''} ${s.phone ?? ''}`}
            searchPlaceholder="Search supplier, contact, phone…"
            initialSort={{ key: 'name', dir: 'asc' }}
            emptyText={showArchived ? 'No archived suppliers.' : 'No suppliers yet. Add the publishers and wholesalers you buy from.'}
            pageSize={12}
            rowKey={(s) => s.id}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New supplier'}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Supplier name *">
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Queenex Publishers Limited" autoFocus />
            </FormField>
            <FormField label="Contact person">
              <Input value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </FormField>
            <FormField label="Address">
              <Input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="P.O. Box 56049, Nairobi" />
            </FormField>
            <FormField label="KRA PIN">
              <Input value={f.kraPin} onChange={(e) => set('kraPin', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="Payment terms (days)" hint="Used to age what we owe them.">
              <Input type="number" min="0" value={f.paymentTermsDays} onChange={(e) => set('paymentTermsDays', e.target.value)} className="font-mono" />
            </FormField>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Opening balance owed (KES)" hint="What we already owed before using the system.">
              <Input type="number" step="0.01" value={f.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="As at">
              <Input type="date" value={f.openingBalanceDate} onChange={(e) => set('openingBalanceDate', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
