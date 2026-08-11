import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, Trash2, Truck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { dateShort, fmt, money, num, startOfMonth, today } from '../../lib/format';
import type { GoodsReceipt } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill, RowAction, RowActions } from '../../components/ui';
import { Select2 } from '../../components/Select2';

export default function GoodsReceiptsPage() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    const s = p.toString();
    return `/api/goods-receipts${s ? `?${s}` : ''}`;
  }, [status, from, to]);

  const { data, loading, refresh } = useApi<GoodsReceipt[]>(query, [query]);
  const rows = data ?? [];
  const postedValue = rows.filter((r) => r.status === 'POSTED').reduce((s, r) => s + num(r.totalCost), 0);

  const remove = async (id: number) => {
    setError(null);
    try {
      await api.delete(`/api/goods-receipts/${id}`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the draft.');
    }
  };

  const columns: Column<GoodsReceipt>[] = [
    {
      key: 'number',
      header: 'GRN',
      accessor: (r) => r.number,
      sortable: true,
      render: (r) => (
        <div>
          <Link to={`/goods-receipts/${r.id}`} className="font-medium text-primary hover:underline">
            {r.number}
          </Link>
          {r.deliveryNoteNo && <div className="text-[11px] text-muted-foreground font-mono">DN {r.deliveryNoteNo}</div>}
        </div>
      ),
    },
    { key: 'supplier', header: 'Supplier', accessor: (r) => r.supplier?.name ?? '', sortable: true, render: (r) => r.supplier?.name ?? '—' },
    { key: 'branch', header: 'Branch', render: (r) => r.branch?.name ?? '—' },
    { key: 'invoice', header: 'Their invoice', render: (r) => <span className="font-mono text-xs">{r.invoiceNo ?? '—'}</span> },
    { key: 'date', header: 'Received', accessor: (r) => r.receivedAt, sortable: true, render: (r) => dateShort(r.receivedAt) },
    { key: 'items', header: 'Lines', align: 'right', render: (r) => fmt(r._count?.items ?? r.items?.length ?? 0) },
    { key: 'total', header: 'Cost', align: 'right', accessor: (r) => num(r.totalCost), sortable: true, render: (r) => <span className="font-mono font-semibold">{money(r.totalCost)}</span> },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      render: (r) => <Pill tone={r.status === 'POSTED' ? 'green' : 'amber'}>{r.status.toLowerCase()}</Pill>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <RowActions>
          <RowAction to={`/goods-receipts/${r.id}`} icon={<Eye className="h-4 w-4" />} label={r.status === 'DRAFT' ? 'Edit receipt' : 'View receipt'} />
          {r.status === 'DRAFT' && (
            <RowAction onClick={() => remove(r.id)} icon={<Trash2 className="h-4 w-4" />} label="Delete draft" tone="danger" />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Goods received"
        subtitle="Key in supplier delivery notes; posting adds the stock to the branch."
        right={
          <>
            <Link to="/suppliers">
              <Button variant="outline">
                <Truck className="h-4 w-4" /> Suppliers
              </Button>
            </Link>
            <Link to="/goods-receipts/new">
              <Button>
                <Plus className="h-4 w-4" /> Receive goods
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
                { value: 'POSTED', label: 'Posted' },
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
        <KpiCard label="Receipts" value={fmt(rows.length)} tone="blue" icon={<Truck className="h-4 w-4" />} />
        <KpiCard label="Drafts" value={fmt(rows.filter((r) => r.status === 'DRAFT').length)} tone="amber" />
        <KpiCard label="Stock received (cost)" value={money(postedValue)} tone="purple" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.number} ${r.supplier?.name ?? ''} ${r.invoiceNo ?? ''} ${r.deliveryNoteNo ?? ''}`}
            searchPlaceholder="Search GRN, supplier or invoice number…"
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyText="No goods receipts in this period."
            pageSize={12}
            rowKey={(r) => r.id}
          />
        )}
      </Card>
    </div>
  );
}
