import { useMemo, useState } from 'react';
import { Download, History } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { dateTime, fmt, startOfMonth, today } from '../lib/format';
import { downloadCsv } from '../lib/reportExport';
import type { StockMovement } from '../types';
import { BranchSelect } from '../components/BranchSelect';
import { DataTable, type Column } from '../components/DataTable';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill } from '../components/ui';

const TYPE_TONE: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'purple'> = {
  INTAKE: 'green',
  ADJUST: 'amber',
  SALE: 'blue',
  VOID: 'purple',
  TRANSFER_IN: 'green',
  TRANSFER_OUT: 'red',
};

const label = (t: string) => t.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export default function StockMovementsPage() {
  const { isAdmin } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    const s = p.toString();
    return `/api/stock/movements${s ? `?${s}` : ''}`;
  }, [isAdmin, branchId, from, to]);

  const { data, loading } = useApi<StockMovement[]>(query, [query]);
  const rows = data ?? [];

  const received = rows.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0);
  const removed = rows.filter((r) => r.delta < 0).reduce((a, r) => a + Math.abs(r.delta), 0);

  const exportCsv = () =>
    downloadCsv(
      `stock-movements-${from}-to-${to}.csv`,
      ['Date', 'Branch', 'Product', 'SKU', 'Type', 'Change', 'User', 'Note'],
      rows.map((r) => [dateTime(r.createdAt), r.branch, r.title, r.sku, label(r.type), r.delta, r.user, r.note ?? '']),
    );

  const columns: Column<StockMovement>[] = [
    { key: 'date', header: 'Date', accessor: (r) => r.createdAt, sortable: true, render: (r) => dateTime(r.createdAt) },
    { key: 'branch', header: 'Branch', accessor: (r) => r.branch, sortable: true },
    {
      key: 'product',
      header: 'Product',
      accessor: (r) => r.title,
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-medium text-foreground">{r.title}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{r.sku}</div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', accessor: (r) => r.type, render: (r) => <Pill tone={TYPE_TONE[r.type] ?? 'blue'}>{label(r.type)}</Pill> },
    {
      key: 'delta',
      header: 'Change',
      align: 'right',
      accessor: (r) => r.delta,
      sortable: true,
      render: (r) => (
        <span className={r.delta >= 0 ? 'font-mono font-semibold text-[#1a7a4a]' : 'font-mono font-semibold text-[#9b2626]'}>
          {r.delta > 0 ? '+' : ''}
          {fmt(r.delta)}
        </span>
      ),
    },
    { key: 'user', header: 'By', accessor: (r) => r.user, sortable: true },
    { key: 'note', header: 'Note', render: (r) => <span className="text-xs text-muted-foreground">{r.note ?? '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock history"
        subtitle="Every quantity change, who made it and why."
        right={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isAdmin && (
            <FormField label="Branch">
              <BranchSelect value={branchId} onChange={setBranchId} includeAll />
            </FormField>
          )}
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Movements" value={fmt(rows.length)} tone="blue" icon={<History className="h-4 w-4" />} />
        <KpiCard label="Units in" value={fmt(received)} tone="green" />
        <KpiCard label="Units out" value={fmt(removed)} tone="red" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.title} ${r.sku} ${r.branch} ${r.user} ${r.type} ${r.note ?? ''}`}
            searchPlaceholder="Search product, user, note…"
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyText="No stock movements in this period."
            pageSize={15}
            rowKey={(r) => r.id}
          />
        )}
      </Card>
    </div>
  );
}
