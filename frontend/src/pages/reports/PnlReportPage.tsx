import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { fmt, money, num, pct, startOfMonth, today } from '../../lib/format';
import { titleCase } from '../../lib/categories';
import { downloadCsv, downloadPdfReport } from '../../lib/reportExport';
import type { PnlReport } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, SectionTitle, Table, Td, Th } from '../../components/ui';

export default function PnlReportPage() {
  const { isAdmin } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    return `/api/reports/pnl?${p.toString()}`;
  }, [isAdmin, branchId, from, to]);

  const { data, loading } = useApi<PnlReport>(query, [query]);
  const period = `${from} to ${to}`;

  const maxCat = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.amount));

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `pnl-${from}-to-${to}.csv`,
      ['Branch', 'Revenue', 'COGS', 'Gross profit', 'Expenses', 'Net profit'],
      data.byBranch.map((b) => [b.name, num(b.revenue), num(b.cogs), num(b.grossProfit), num(b.expenses), num(b.netProfit)]),
    );
  };

  const exportPdf = () => {
    if (!data) return;
    const s = data.summary;
    downloadPdfReport({
      title: 'Profit & Loss',
      meta: [`Period: ${period}`, `Scope: ${isAdmin && branchId ? 'Selected branch' : 'All branches'}`],
      filename: `pnl-${from}-to-${to}.pdf`,
      sections: [
        {
          heading: 'Summary',
          headers: ['Metric', 'Amount'],
          numeric: [1],
          rows: [
            ['Revenue', money(s.revenue)],
            ['Cost of goods sold', money(s.cogs)],
            ['Gross profit', `${money(s.grossProfit)} (${pct(s.grossMargin)})`],
            ['Expenses', money(s.expenses)],
            ['Net profit', `${money(s.netProfit)} (${pct(s.netMargin)})`],
          ],
        },
        {
          heading: 'By branch',
          headers: ['Branch', 'Revenue', 'COGS', 'Gross', 'Expenses', 'Net'],
          numeric: [1, 2, 3, 4, 5],
          rows: data.byBranch.map((b) => [b.name, money(b.revenue), money(b.cogs), money(b.grossProfit), money(b.expenses), money(b.netProfit)]),
        },
        {
          heading: 'Expenses by category',
          headers: ['Category', 'Amount'],
          numeric: [1],
          rows: data.byCategory.map((c) => [titleCase(c.category), money(c.amount)]),
        },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Profit &amp; Loss"
        subtitle="Revenue − cost of goods − expenses = net profit."
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard label="Revenue" value={money(data.summary.revenue)} tone="blue" filled />
            <KpiCard label="COGS" value={money(data.summary.cogs)} tone="amber" />
            <KpiCard label="Gross profit" value={money(data.summary.grossProfit)} sub={pct(data.summary.grossMargin) + ' margin'} tone="green" />
            <KpiCard label="Expenses" value={money(data.summary.expenses)} tone="purple" />
            <KpiCard label="Net profit" value={money(data.summary.netProfit)} sub={pct(data.summary.netMargin) + ' margin'} tone={data.summary.netProfit >= 0 ? 'green' : 'red'} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <SectionTitle>By branch</SectionTitle>
              <Table>
                <thead>
                  <tr>
                    <Th>Branch</Th>
                    <Th num>Revenue</Th>
                    <Th num>Gross</Th>
                    <Th num>Net</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBranch.length === 0 ? (
                    <tr>
                      <Td className="text-muted-foreground text-center" >—</Td>
                      <Td num>—</Td>
                      <Td num>—</Td>
                      <Td num>—</Td>
                    </tr>
                  ) : (
                    data.byBranch.map((b) => (
                      <tr key={b.branchId ?? b.name}>
                        <Td>{b.name}</Td>
                        <Td num>{money(b.revenue)}</Td>
                        <Td num>{money(b.grossProfit)}</Td>
                        <Td num className={b.netProfit < 0 ? 'text-[#9b2626]' : ''}>{money(b.netProfit)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>

            <Card className="p-5">
              <SectionTitle>Expenses by category</SectionTitle>
              {data.byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No expenses in this period.</p>
              ) : (
                <div className="space-y-3 pt-1">
                  {data.byCategory.map((c) => (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-foreground shrink-0">{titleCase(c.category)}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                      </div>
                      <span className="w-24 text-right text-sm font-mono text-foreground shrink-0">{money(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
