import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, Plus, Receipt, Trash2, Truck, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { dateShort, fmt, money, num, startOfMonth, today } from '../../lib/format';
import { printDeliveryNote, printInvoice } from '../../lib/documents';
import type { Invoice } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill, RowAction, RowActions } from '../../components/ui';
import { Select2 } from '../../components/Select2';

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'gray'> = {
  DRAFT: 'gray',
  ISSUED: 'amber',
  DELIVERED: 'blue',
  PAID: 'green',
  CANCELLED: 'red',
};

export default function InvoicesPage() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    const s = p.toString();
    return `/api/invoices${s ? `?${s}` : ''}`;
  }, [status, from, to]);

  const { data, loading, refresh } = useApi<Invoice[]>(query, [query]);
  const rows = data ?? [];

  const billed = rows.filter((r) => r.status !== 'DRAFT' && r.status !== 'CANCELLED').reduce((s, r) => s + num(r.total), 0);
  const unpaid = rows.filter((r) => r.status === 'ISSUED' || r.status === 'DELIVERED').reduce((s, r) => s + num(r.total), 0);

  /** The list is summary-only, so fetch the full invoice before printing. */
  const printDoc = async (id: number, kind: 'invoice' | 'delivery') => {
    setBusy(id);
    setError(null);
    try {
      const full = await api.get<Invoice>(`/api/invoices/${id}`);
      if (kind === 'invoice') printInvoice(full);
      else printDeliveryNote(full);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the document.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      await api.delete(`/api/invoices/${id}`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the invoice.');
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      accessor: (r) => r.number,
      sortable: true,
      render: (r) => (
        <div>
          <Link to={`/invoices/${r.id}`} className="font-medium text-primary hover:underline">
            {r.number}
          </Link>
          {r.deliveryNoteNo && <div className="text-[11px] text-muted-foreground font-mono">DN {r.deliveryNoteNo}</div>}
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', accessor: (r) => r.customer?.name ?? '', sortable: true, render: (r) => r.customer?.name ?? '—' },
    { key: 'date', header: 'Date', accessor: (r) => r.issueDate, sortable: true, render: (r) => dateShort(r.issueDate) },
    { key: 'due', header: 'Due', render: (r) => (r.dueDate ? dateShort(r.dueDate) : '—') },
    { key: 'items', header: 'Items', align: 'right', render: (r) => fmt(r._count?.items ?? 0) },
    { key: 'total', header: 'Total', align: 'right', accessor: (r) => num(r.total), sortable: true, render: (r) => <span className="font-mono font-semibold">{money(r.total)}</span> },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      render: (r) => <Pill tone={STATUS_TONE[r.status] ?? 'gray'}>{r.status.toLowerCase()}</Pill>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <RowActions>
          <RowAction to={`/invoices/${r.id}`} icon={<Eye className="h-4 w-4" />} label={r.status === 'DRAFT' ? 'Edit invoice' : 'View invoice'} />
          <RowAction onClick={() => printDoc(r.id, 'invoice')} disabled={busy === r.id} icon={<Receipt className="h-4 w-4" />} label="Print invoice" />
          <RowAction onClick={() => printDoc(r.id, 'delivery')} disabled={busy === r.id} icon={<Truck className="h-4 w-4" />} label="Print delivery note" />
          {(r.status === 'DRAFT' || r.status === 'ISSUED') && (
            <RowAction onClick={() => remove(r.id)} disabled={busy === r.id} icon={<Trash2 className="h-4 w-4" />} label="Cancel invoice" tone="danger" />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        subtitle="Supply schools and institutions on credit, then print their invoice and delivery note."
        right={
          <>
            <Link to="/customers">
              <Button variant="outline">
                <Wallet className="h-4 w-4" /> Customers
              </Button>
            </Link>
            <Link to="/invoices/new">
              <Button>
                <Plus className="h-4 w-4" /> New invoice
              </Button>
            </Link>
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FormField label="Status">
            <Select2
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'ISSUED', label: 'Issued' },
                { value: 'DELIVERED', label: 'Delivered' },
                { value: 'PAID', label: 'Paid' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
              searchable={false}
            />
          </FormField>
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Invoices" value={fmt(rows.length)} tone="blue" icon={<FileText className="h-4 w-4" />} />
        <KpiCard label="Billed in period" value={money(billed)} tone="purple" />
        <KpiCard label="Awaiting payment" value={money(unpaid)} tone={unpaid > 0 ? 'amber' : 'green'} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.number} ${r.customer?.name ?? ''} ${r.deliveryNoteNo ?? ''}`}
            searchPlaceholder="Search invoice number or customer…"
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyText="No invoices in this period."
            pageSize={12}
            rowKey={(r) => r.id}
          />
        )}
      </Card>
    </div>
  );
}
