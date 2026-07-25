import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { fmt, money, today } from '../../lib/format';
import { downloadCsv, downloadPdfReport } from '../../lib/reportExport';
import type { StockReport } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { DataTable, type Column } from '../../components/DataTable';
import { Button, Card, FormField, KpiCard, Loading, PageHeader, Pill } from '../../components/ui';

type Row = StockReport['rows'][number];

const tone = (s: string): 'red' | 'amber' | 'green' => (s === 'Out of stock' ? 'red' : s === 'Low stock' ? 'amber' : 'green');

export default function StockReportPage() {
  const { isAdmin } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    const s = p.toString();
    return `/api/reports/stock${s ? `?${s}` : ''}`;
  }, [isAdmin, branchId]);

  const { data, loading } = useApi<StockReport>(query, [query]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `stock-${today()}.csv`,
      ['Branch', 'Title', 'SKU', 'Quantity', 'Unit price', 'Value', 'Status'],
      data.rows.map((r) => [r.branch, r.title, r.sku, r.quantity, Math.round(r.unitPrice), Math.round(r.value), r.status]),
    );
  };

  const exportPdf = () => {
    if (!data) return;
    downloadPdfReport({
      title: 'Stock Report',
      meta: [`Generated: ${today()}`, `SKUs: ${data.summary.skuCount} · Retail value: ${money(data.summary.retailValue)}`],
      filename: `stock-${today()}.pdf`,
      sections: [
        {
          heading: 'On-hand stock',
          headers: ['Branch', 'Title', 'SKU', 'Qty', 'Unit price', 'Value', 'Status'],
          numeric: [3, 4, 5],
          rows: data.rows.map((r) => [r.branch, r.title, r.sku, r.quantity, money(r.unitPrice), money(r.value), r.status]),
        },
      ],
    });
  };

  const columns: Column<Row>[] = [
    { key: 'branch', header: 'Branch', accessor: (r) => r.branch, sortable: true },
    { key: 'title', header: 'Product', accessor: (r) => r.title, sortable: true, render: (r) => <span className="font-medium text-foreground">{r.title}</span> },
    { key: 'sku', header: 'SKU', accessor: (r) => r.sku, render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: 'qty', header: 'Qty', align: 'right', accessor: (r) => r.quantity, sortable: true, render: (r) => <span className="font-mono font-semibold">{fmt(r.quantity)}</span> },
    { key: 'price', header: 'Unit price', align: 'right', accessor: (r) => r.unitPrice, render: (r) => <span className="font-mono">{money(r.unitPrice)}</span> },
    { key: 'value', header: 'Value', align: 'right', accessor: (r) => r.value, sortable: true, render: (r) => <span className="font-mono">{money(r.value)}</span> },
    { key: 'status', header: 'Status', accessor: (r) => r.status, render: (r) => <Pill tone={tone(r.status)}>{r.status}</Pill> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock report"
        subtitle="Current on-hand valuation across branches."
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

      {isAdmin && (
        <Card className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FormField label="Branch">
              <BranchSelect value={branchId} onChange={setBranchId} includeAll />
            </FormField>
          </div>
        </Card>
      )}

      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="SKUs" value={fmt(data.summary.skuCount)} tone="blue" filled />
            <KpiCard label="Units on hand" value={fmt(data.summary.units)} tone="purple" />
            <KpiCard label="Retail value" value={money(data.summary.retailValue)} tone="green" />
            <KpiCard label="Cost value" value={money(data.summary.costValue)} tone="amber" />
          </div>

          <Card className="p-4">
            <DataTable
              data={data.rows}
              columns={columns}
              searchable={(r) => `${r.branch} ${r.title} ${r.sku} ${r.status}`}
              searchPlaceholder="Search stock…"
              initialSort={{ key: 'qty', dir: 'asc' }}
              emptyText="No stock to report."
              pageSize={12}
              rowKey={(r) => `${r.branch}-${r.sku}`}
            />
          </Card>
        </>
      )}
    </div>
  );
}
