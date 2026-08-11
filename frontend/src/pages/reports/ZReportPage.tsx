import { useMemo, useState } from 'react';
import { Download, FileText, Wallet } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { dateTime, fmt, money, today } from '../../lib/format';
import { downloadCsv, downloadPdfReport } from '../../lib/reportExport';
import type { ZReport } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, SectionTitle, Table, Td, Th } from '../../components/ui';

export default function ZReportPage() {
  const { isAdmin } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [date, setDate] = useState(today());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    p.set('date', date);
    return `/api/reports/zreport?${p.toString()}`;
  }, [isAdmin, branchId, date]);

  const { data, loading } = useApi<ZReport>(query, [query]);
  const s = data?.summary;

  const exportCsv = () => {
    if (!data || !s) return;
    downloadCsv(
      `z-report-${date}.csv`,
      ['Section', 'Label', 'Transactions', 'Amount'],
      [
        ...data.byMethod.map((m) => ['Payment method', m.method, m.txns, Math.round(m.amount)] as Array<string | number>),
        ...data.byCashier.map((c) => ['Cashier', c.name, c.txns, Math.round(c.amount)] as Array<string | number>),
        ['Totals', 'Revenue', s.txns, Math.round(s.revenue)],
        ['Totals', 'Voided', s.voidedCount, Math.round(s.voidedAmount)],
        ['Totals', 'Expenses paid out', '', Math.round(s.expenses)],
        ['Totals', 'Expected cash in drawer', '', Math.round(s.expectedCash)],
      ],
    );
  };

  const exportPdf = () => {
    if (!data || !s) return;
    downloadPdfReport({
      title: 'Daily Z-Report',
      meta: [`Date: ${data.date}`, `Branch: ${isAdmin && branchId ? data.branch ?? 'Selected branch' : data.branch ?? 'Your branch'}`],
      filename: `z-report-${date}.pdf`,
      sections: [
        {
          heading: 'Cash-up summary',
          headers: ['Metric', 'Value'],
          numeric: [1],
          rows: [
            ['Sales (net of voids)', money(s.revenue)],
            ['Transactions', fmt(s.txns)],
            ['Items sold', fmt(s.itemsSold)],
            ['Average basket', money(s.avgBasket)],
            ['Discounts given', money(s.discounts)],
            ['Gross profit', money(s.grossProfit)],
            ['Voided sales', `${fmt(s.voidedCount)} (${money(s.voidedAmount)})`],
            ['Expenses paid out', money(s.expenses)],
            ['Expected cash in drawer', money(s.expectedCash)],
          ],
        },
        {
          heading: 'By payment method',
          headers: ['Method', 'Transactions', 'Amount'],
          numeric: [1, 2],
          rows: data.byMethod.map((m) => [m.method, fmt(m.txns), money(m.amount)]),
        },
        {
          heading: 'By cashier',
          headers: ['Cashier', 'Transactions', 'Amount'],
          numeric: [1, 2],
          rows: data.byCashier.map((c) => [c.name, fmt(c.txns), money(c.amount)]),
        },
        {
          heading: 'Voided sales',
          headers: ['Sale #', 'Amount', 'Reason', 'Voided by'],
          numeric: [1],
          rows: data.voids.map((v) => [`#${v.id}`, money(v.total), v.reason ?? '—', v.by]),
        },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daily Z-report"
        subtitle="End-of-day cash-up: what was taken, by whom, and what should be in the drawer."
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
          <FormField label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
          </FormField>
        </div>
      </Card>

      {loading || !s ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Expected cash" value={money(s.expectedCash)} tone="green" filled icon={<Wallet className="h-4 w-4" />} />
            <KpiCard label="Sales" value={money(s.revenue)} tone="blue" />
            <KpiCard label="Transactions" value={fmt(s.txns)} tone="purple" />
            <KpiCard label="Voided" value={`${fmt(s.voidedCount)} · ${money(s.voidedAmount)}`} tone={s.voidedCount > 0 ? 'red' : 'amber'} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="p-4">
              <SectionTitle>By payment method</SectionTitle>
              <Table>
                <thead>
                  <tr>
                    <Th>Method</Th>
                    <Th num>Txns</Th>
                    <Th num>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {data?.byMethod.length ? (
                    data.byMethod.map((m) => (
                      <tr key={m.method}>
                        <Td>{m.method}</Td>
                        <Td num>{fmt(m.txns)}</Td>
                        <Td num>{money(m.amount)}</Td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <Td>No sales on this day.</Td>
                      <Td num>—</Td>
                      <Td num>—</Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>

            <Card className="p-4">
              <SectionTitle>By cashier</SectionTitle>
              <Table>
                <thead>
                  <tr>
                    <Th>Cashier</Th>
                    <Th num>Txns</Th>
                    <Th num>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {data?.byCashier.length ? (
                    data.byCashier.map((c) => (
                      <tr key={c.name}>
                        <Td>{c.name}</Td>
                        <Td num>{fmt(c.txns)}</Td>
                        <Td num>{money(c.amount)}</Td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <Td>No sales on this day.</Td>
                      <Td num>—</Td>
                      <Td num>—</Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card className="p-4">
            <SectionTitle>Drawer reconciliation</SectionTitle>
            <Table>
              <tbody>
                <tr>
                  <Td>Cash sales</Td>
                  <Td num>{money(data?.byMethod.find((m) => m.method === 'CASH')?.amount ?? 0)}</Td>
                </tr>
                <tr>
                  <Td>Less: expenses paid from the till</Td>
                  <Td num>−{money(s.expenses)}</Td>
                </tr>
                <tr>
                  <Td className="font-semibold">Expected cash in drawer</Td>
                  <Td num>
                    <span className="font-semibold">{money(s.expectedCash)}</span>
                  </Td>
                </tr>
              </tbody>
            </Table>
          </Card>

          {(data?.voids.length ?? 0) > 0 && (
            <Card className="p-4">
              <SectionTitle>Voided sales</SectionTitle>
              <Table>
                <thead>
                  <tr>
                    <Th>Sale</Th>
                    <Th num>Amount</Th>
                    <Th>Reason</Th>
                    <Th>Voided by</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {data?.voids.map((v) => (
                    <tr key={v.id}>
                      <Td>#{v.id}</Td>
                      <Td num>{money(v.total)}</Td>
                      <Td>{v.reason ?? '—'}</Td>
                      <Td>{v.by}</Td>
                      <Td>{dateTime(v.at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
