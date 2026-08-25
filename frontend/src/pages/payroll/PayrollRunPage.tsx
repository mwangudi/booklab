import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Lock, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { dateTime, fmt, money, num } from '../../lib/format';
import { downloadCsv, downloadPdfReport } from '../../lib/reportExport';
import type { PayrollRun } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, KpiCard, Loading, Modal, PageHeader, Pill } from '../../components/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Slip = NonNullable<PayrollRun['payslips']>[number];
const slipName = (s: Slip) => `${s.employee?.firstName ?? ''} ${s.employee?.lastName ?? ''}`.trim() || `Employee #${s.employeeId}`;

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>();
  const { data: run, loading, refresh } = useApi<PayrollRun>(`/api/payroll/runs/${id}`, [id]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !run) return <Loading />;

  const slips = run.payslips ?? [];
  const label = `${MONTHS[run.month - 1]} ${run.year}`;
  const isClosed = run.status === 'CLOSED';

  const act = async (path: string, fail: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(path);
      setConfirmClose(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fail);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `payroll-${run.year}-${String(run.month).padStart(2, '0')}.csv`,
      ['Staff no', 'Employee', 'Branch', 'Basic', 'Allowances', 'Gross', 'NSSF', 'SHIF', 'Housing levy', 'Taxable', 'PAYE', 'Other', 'Total deductions', 'Net pay'],
      slips.map((s) => [
        s.employee?.staffNo ?? '',
        slipName(s),
        s.employee?.branch?.name ?? '',
        num(s.basicSalary),
        num(s.allowances),
        num(s.grossPay),
        num(s.nssf),
        num(s.shif),
        num(s.housingLevy),
        num(s.taxablePay),
        num(s.paye),
        num(s.otherDeductions),
        num(s.totalDeductions),
        num(s.netPay),
      ]),
    );

  const exportPdf = () =>
    downloadPdfReport({
      title: `Payroll — ${label}`,
      meta: [
        `Status: ${isClosed ? `Closed ${run.closedAt ? dateTime(run.closedAt) : ''}` : 'Draft (not yet posted)'}`,
        `Employees: ${slips.length} · Gross: ${money(run.grossTotal)} · Net pay: ${money(run.netTotal)}`,
        `Total employer cost: ${money(run.employerTotal)}`,
      ],
      filename: `payroll-${run.year}-${String(run.month).padStart(2, '0')}.pdf`,
      sections: [
        {
          heading: 'Payslips',
          headers: ['Staff no', 'Employee', 'Gross', 'NSSF', 'SHIF', 'Levy', 'PAYE', 'Net pay'],
          numeric: [2, 3, 4, 5, 6, 7],
          rows: slips.map((s) => [
            s.employee?.staffNo ?? '—',
            slipName(s),
            money(s.grossPay),
            money(s.nssf),
            money(s.shif),
            money(s.housingLevy),
            money(s.paye),
            money(s.netPay),
          ]),
        },
        {
          heading: 'Totals',
          headers: ['Metric', 'Amount'],
          numeric: [1],
          rows: [
            ['Gross pay', money(run.grossTotal)],
            ['Total deductions', money(run.deductionsTotal)],
            ['Net pay to staff', money(run.netTotal)],
            ['Total employer cost', money(run.employerTotal)],
          ],
        },
      ],
    });

  const columns: Column<Slip>[] = [
    {
      key: 'name',
      header: 'Employee',
      accessor: (s) => slipName(s),
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-medium text-foreground">{slipName(s)}</div>
          <div className="text-[11px] text-muted-foreground font-mono">
            {s.employee?.staffNo} {s.employee?.branch?.name ? `· ${s.employee.branch.name}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'gross', header: 'Gross', align: 'right', accessor: (s) => num(s.grossPay), sortable: true, render: (s) => <span className="font-mono">{money(s.grossPay)}</span> },
    { key: 'nssf', header: 'NSSF', align: 'right', render: (s) => <span className="font-mono text-muted-foreground">{money(s.nssf)}</span> },
    { key: 'shif', header: 'SHIF', align: 'right', render: (s) => <span className="font-mono text-muted-foreground">{money(s.shif)}</span> },
    { key: 'levy', header: 'Housing levy', align: 'right', render: (s) => <span className="font-mono text-muted-foreground">{money(s.housingLevy)}</span> },
    { key: 'paye', header: 'PAYE', align: 'right', accessor: (s) => num(s.paye), sortable: true, render: (s) => <span className="font-mono text-muted-foreground">{money(s.paye)}</span> },
    { key: 'net', header: 'Net pay', align: 'right', accessor: (s) => num(s.netPay), sortable: true, render: (s) => <span className="font-mono font-semibold text-foreground">{money(s.netPay)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Payroll — ${label}`}
        subtitle={isClosed ? 'Closed and posted to the profit & loss.' : 'Draft — review the figures, then close to post the cost.'}
        right={
          <>
            <Link to="/payroll">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            <Button variant="outline" onClick={exportCsv} disabled={slips.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={slips.length === 0}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            {!isClosed && (
              <>
                <Button variant="outline" onClick={() => act(`/api/payroll/runs/${id}/recalculate`, 'Could not recalculate.')} loading={busy}>
                  <RefreshCw className="h-4 w-4" /> Recalculate
                </Button>
                <Button onClick={() => setConfirmClose(true)}>
                  <Lock className="h-4 w-4" /> Close payroll
                </Button>
              </>
            )}
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}
      {isClosed ? (
        <Alert tone="green">
          Closed{run.closedAt ? ` on ${dateTime(run.closedAt)}` : ''}. A SALARY expense was posted for each branch, so this
          cost now appears in your Profit &amp; Loss for {label}.
        </Alert>
      ) : (
        <Alert tone="amber">
          This is a draft. Figures update if you change salaries or statutory rates and press Recalculate. Nothing reaches
          your accounts until you close it.
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Net pay to staff" value={money(run.netTotal)} tone="green" filled />
        <KpiCard label="Gross pay" value={money(run.grossTotal)} tone="blue" />
        <KpiCard label="Deductions" value={money(run.deductionsTotal)} tone="amber" />
        <KpiCard label="Total employer cost" value={money(run.employerTotal)} tone="purple" />
      </div>

      <Card className="p-4">
        <DataTable
          data={slips}
          columns={columns}
          searchable={(s) => `${slipName(s)} ${s.employee?.staffNo ?? ''} ${s.employee?.branch?.name ?? ''}`}
          searchPlaceholder="Search employee…"
          initialSort={{ key: 'name', dir: 'asc' }}
          emptyText="No payslips in this run."
          pageSize={15}
          rowKey={(s) => s.id}
          rightSlot={<Pill tone={isClosed ? 'green' : 'amber'}>{fmt(slips.length)} payslips</Pill>}
        />
      </Card>

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={`Close payroll for ${label}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Cancel
            </Button>
            <Button onClick={() => act(`/api/payroll/runs/${id}/close`, 'Could not close this payroll.')} loading={busy}>
              <Lock className="h-4 w-4" /> Close payroll
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="amber">
            Closing is permanent. The figures are locked and a <b>SALARY</b> expense is posted for each branch, dated the
            last day of {label}.
          </Alert>
          <div className="rounded-lg border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Employees</span>
              <span className="font-mono">{fmt(slips.length)}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Net pay to staff</span>
              <span className="font-mono">{money(run.netTotal)}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Posted to P&amp;L (total employer cost)</span>
              <span className="font-mono font-semibold">{money(run.employerTotal)}</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
