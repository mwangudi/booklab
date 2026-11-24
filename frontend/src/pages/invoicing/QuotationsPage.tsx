import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { useCan } from '../../lib/permissions';
import { dateShort, fmt, money, num } from '../../lib/format';
import { buildQuotation, deliverPdf, quotationInput } from '../../lib/documents';
import { quotationPath } from '../../lib/quotationLink';
import type { Quotation } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill, RowAction, RowActions } from '../../components/ui';
import { QUOTATION_STATUS_LABEL } from './QuotationEditorPage';

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'gray'> = {
  DRAFT: 'gray',
  SENT: 'amber',
  ACCEPTED: 'green',
  DECLINED: 'red',
};

const startOfYear = () => `${new Date().getFullYear()}-01-01`;

/** Quotations: price offers made on their own, before a customer orders. */
export default function QuotationsPage() {
  const can = useCan();
  const { role, user } = useAuth();
  const [from, setFrom] = useState(startOfYear());
  // No end date by default, so a quotation dated ahead still shows.
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    return `/api/quotations?${p.toString()}`;
  }, [from, to]);
  const { data, loading, refresh } = useApi<Quotation[]>(query, [query]);
  const rows = data ?? [];

  const open = rows.filter((r) => r.status === 'SENT');
  const accepted = rows.filter((r) => r.status === 'ACCEPTED');

  /** The list is summary-only, so fetch the full quotation before making its PDF. */
  const download = async (r: Quotation) => {
    setBusy(r.id);
    setError(null);
    try {
      const full = await api.get<Quotation>(`/api/quotations/${r.id}`);
      const { blob, fileName } = await buildQuotation(quotationInput(full, user?.name));
      await deliverPdf(blob, fileName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not make the quotation PDF.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: Quotation) => {
    if (!window.confirm(`Delete quotation ${r.number}?`)) return;
    setBusy(r.id);
    setError(null);
    try {
      await api.delete(`/api/quotations/${r.id}`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the quotation.');
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Quotation>[] = [
    {
      key: 'number',
      header: 'Quotation',
      accessor: (r) => r.number,
      sortable: true,
      render: (r) => (
        <Link to={quotationPath(r)} className="font-medium text-primary hover:underline">
          {r.number}
        </Link>
      ),
    },
    { key: 'customer', filter: 'select', header: 'Customer', accessor: (r) => r.customer?.name ?? '', sortable: true, render: (r) => r.customer?.name ?? '—' },
    { key: 'date', header: 'Date', accessor: (r) => r.issueDate, sortable: true, render: (r) => dateShort(r.issueDate) },
    { key: 'items', header: 'Items', align: 'right', render: (r) => fmt(r._count?.items ?? 0) },
    { key: 'total', filter: 'range', header: 'Total', align: 'right', accessor: (r) => num(r.total), sortable: true, render: (r) => <span className="font-mono font-semibold">{money(r.total)}</span> },
    {
      key: 'status',
      filter: 'select',
      filterOptionLabel: (v) => QUOTATION_STATUS_LABEL[v as Quotation['status']] ?? v,
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
          <RowAction to={quotationPath(r)} icon={<Eye className="h-4 w-4" />} label="Open quotation" />
          <RowAction onClick={() => download(r)} disabled={busy === r.id} icon={<Download className="h-4 w-4" />} label="Download PDF" />
          {can('invoice.create') && (r.status === 'DRAFT' || role !== 'CASHIER') && (
            <RowAction onClick={() => remove(r)} disabled={busy === r.id} icon={<Trash2 className="h-4 w-4" />} label="Delete quotation" tone="danger" />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Quotations" subtitle="Offer schools and customers prices before they order, then download or send the quotation." />

      {error && <Alert tone="red">{error}</Alert>}

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Quotations" value={fmt(rows.length)} tone="blue" icon={<FileText className="h-4 w-4" />} />
        <KpiCard label="Awaiting an answer" value={money(open.reduce((s, r) => s + num(r.total), 0))} tone={open.length ? 'amber' : 'green'} />
        <KpiCard label="Accepted" value={money(accepted.reduce((s, r) => s + num(r.total), 0))} tone="purple" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.number} ${r.customer?.name ?? ''}`}
            searchPlaceholder="Search quotation number or customer…"
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyText="No quotations in this period."
            pageSize={12}
            rowKey={(r) => r.id}
            actionSlot={
              can('invoice.create') && (
                <Link to="/quotations/new">
                  <Button>
                    <Plus className="h-4 w-4" /> New quotation
                  </Button>
                </Link>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
