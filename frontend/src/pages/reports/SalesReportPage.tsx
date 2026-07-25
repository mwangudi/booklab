import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { dateTime, fmt, money, startOfMonth, today } from '../../lib/format';
import { downloadCsv, downloadPdfReport } from '../../lib/reportExport';
import type { SalesReport } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { DataTable, type Column } from '../../components/DataTable';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, SectionTitle, Table, Td, Th } from '../../components/ui';

type Row = SalesReport['rows'][number];

export default function SalesReportPage() {
  const { isAdmin } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    return `/api/reports/sales?${p.toString()}`;
  }, [isAdmin, branchId, from, to]);

  const { data, loading } = useApi<SalesReport>(query, [query]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `sales-${from}-to-${to}.csv`,
      ['Sale #', 'Date', 'Branch', 'Cashier', 'Payment', 'Items', 'Total'],
      data.rows.map((r) => [r.id, dateTime(r.date), r.branch, r.cashier, r.payment, r.items, Math.round(r.total)]),
    );
  };

  const exportPdf = () => {
    if (!data) return;
    downloadPdfReport({
      title: 'Sales Report',
      meta: [`Period: ${from} to ${to}`, `Transactions: ${data.summary.txns} · Revenue: ${money(data.summary.revenue)}`],
      filename: `sales-${from}-to-${to}.pdf`,
      sections: [
        {
          heading: 'By branch',
          headers: ['Branch', 'Transactions', 'Revenue'],
          numeric: [1, 2],
          rows: data.byBranch.map((b) => [b.name, b.txns, money(b.revenue)]),
        },
        {
          heading: 'Transactions',
          headers: ['#', 'Date', 'Branch', 'Cashier', 'Payment', 'Items', 'Total'],
          numeric: [5, 6],
          rows: data.rows.map((r) => [r.id, dateTime(r.date), r.branch, r.cashier, r.payment, r.items, money(r.total)]),
        },
      ],
    });
  };

  const columns: Column<Row>[] = [
    { key: 'id', header: '#', accessor: (r) => r.id, sortable: true, render: (r) => <span className="font-mono text-xs">#{r.id}</span> },
    { key: 'date', header: 'Date', accessor: (r) => r.date, sortable: true, render: (r) => dateTime(r.date) },
    { key: 'branch', header: 'Branch', accessor: (r) => r.branch, sortable: true },
    { key: 'cashier', header: 'Cashier', accessor: (r) => r.cashier },
    { key: 'payment', header: 'Payment', accessor: (r) => r.payment },
    { key: 'items', header: 'Items', align: 'right', accessor: (r) => r.items, sortable: true },
    { key: 'total', header: 'Total', align: 'right', accessor: (r) => r.total, sortable: true, render: (r) => <span className="font-mono">{money(r.total)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales report"
        subtitle="Transaction detail and per-branch performance."
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
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Revenue" value={money(data.summary.revenue)} tone="green" filled />
            <KpiCard label="Transactions" value={fmt(data.summary.txns)} tone="blue" />
            <KpiCard label="Items sold" value={fmt(data.summary.itemsSold)} tone="purple" />
            <KpiCard label="Avg. basket" value={money(data.summary.avgBasket)} tone="amber" />
          </div>

          <Card className="p-5">
            <SectionTitle>By branch</SectionTitle>
            <Table>
              <thead>
                <tr>
                  <Th>Branch</Th>
                  <Th num>Transactions</Th>
                  <Th num>Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {data.byBranch.map((b) => (
                  <tr key={b.branchId}>
                    <Td>{b.name}</Td>
                    <Td num>{fmt(b.txns)}</Td>
                    <Td num>{money(b.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card className="p-4">
            <DataTable
              data={data.rows}
              columns={columns}
              searchable={(r) => `${r.id} ${r.branch} ${r.cashier} ${r.payment}`}
              searchPlaceholder="Search transactions…"
              initialSort={{ key: 'date', dir: 'desc' }}
              emptyText="No sales in this period."
              pageSize={12}
              rowKey={(r) => r.id}
            />
          </Card>
        </>
      )}
    </div>
  );
}
