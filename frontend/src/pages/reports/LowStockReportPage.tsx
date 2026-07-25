import { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { fmt, money, today } from '../../lib/format';
import { downloadCsv, downloadPdfReport } from '../../lib/reportExport';
import type { LowStockReport } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { DataTable, type Column } from '../../components/DataTable';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill } from '../../components/ui';

type Row = LowStockReport['rows'][number];

export default function LowStockReportPage() {
  const { isAdmin } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [threshold, setThreshold] = useState('5');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    const t = Number(threshold);
    p.set('threshold', String(Number.isFinite(t) && t >= 0 ? t : 5));
    return `/api/reports/low-stock?${p.toString()}`;
  }, [isAdmin, branchId, threshold]);

  const { data, loading } = useApi<LowStockReport>(query, [query]);
  const rows = data?.rows ?? [];

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `low-stock-${today()}.csv`,
      ['Branch', 'Product', 'SKU', 'Category', 'On hand', 'Suggested order', 'Unit cost', 'Order cost', 'Status'],
      rows.map((r) => [
        r.branch,
        r.title,
        r.sku,
        r.category,
        r.quantity,
        r.suggestedOrder,
        Math.round(r.costPrice),
        Math.round(r.suggestedOrder * r.costPrice),
        r.status,
      ]),
    );
  };

  const exportPdf = () => {
    if (!data) return;
    downloadPdfReport({
      title: 'Re-order Report',
      meta: [
        `Generated: ${today()}`,
        `Threshold: ${data.threshold} units or fewer`,
        `${data.summary.outCount} out of stock · ${data.summary.lowCount} running low · est. ${money(data.summary.reorderCost)} to restock`,
      ],
      filename: `low-stock-${today()}.pdf`,
      sections: [
        {
          heading: 'Items to re-order',
          headers: ['Branch', 'Product', 'SKU', 'On hand', 'Order', 'Unit cost', 'Order cost', 'Status'],
          numeric: [3, 4, 5, 6],
          rows: rows.map((r) => [
            r.branch,
            r.title,
            r.sku,
            r.quantity,
            r.suggestedOrder,
            money(r.costPrice),
            money(r.suggestedOrder * r.costPrice),
            r.status,
          ]),
        },
      ],
    });
  };

  const columns: Column<Row>[] = [
    { key: 'branch', header: 'Branch', accessor: (r) => r.branch, sortable: true },
    {
      key: 'title',
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
    { key: 'category', header: 'Category', accessor: (r) => r.category, render: (r) => <Pill tone="blue">{r.category}</Pill> },
    { key: 'qty', header: 'On hand', align: 'right', accessor: (r) => r.quantity, sortable: true, render: (r) => <span className="font-mono font-semibold">{fmt(r.quantity)}</span> },
    { key: 'order', header: 'Suggested order', align: 'right', accessor: (r) => r.suggestedOrder, sortable: true, render: (r) => <span className="font-mono">{fmt(r.suggestedOrder)}</span> },
    { key: 'cost', header: 'Order cost', align: 'right', accessor: (r) => r.suggestedOrder * r.costPrice, sortable: true, render: (r) => <span className="font-mono">{money(r.suggestedOrder * r.costPrice)}</span> },
    { key: 'status', header: 'Status', accessor: (r) => r.status, render: (r) => <Pill tone={r.quantity <= 0 ? 'red' : 'amber'}>{r.status}</Pill> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Re-order report"
        subtitle="What has run out or is running low, and what it costs to restock."
        right={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={!data}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isAdmin && (
            <FormField label="Branch">
              <BranchSelect value={branchId} onChange={setBranchId} includeAll />
            </FormField>
          )}
          <FormField label="Low-stock threshold" hint="Show items with this many units or fewer.">
            <Input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="font-mono" />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Out of stock" value={fmt(data?.summary.outCount ?? 0)} tone="red" icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Running low" value={fmt(data?.summary.lowCount ?? 0)} tone="amber" />
        <KpiCard label="Est. restock cost" value={money(data?.summary.reorderCost ?? 0)} tone="purple" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.title} ${r.sku} ${r.branch} ${r.category}`}
            searchPlaceholder="Search product, SKU, branch…"
            initialSort={{ key: 'qty', dir: 'asc' }}
            emptyText="Nothing needs re-ordering at this threshold."
            pageSize={15}
            rowKey={(r) => `${r.branch}-${r.sku}`}
          />
        )}
      </Card>
    </div>
  );
}
