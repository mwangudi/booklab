import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Eye, Lock, Plus, Trash2, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { dateShort, fmt, money, num } from '../../lib/format';
import type { PayrollRun } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, FormField, KpiCard, Loading, Modal, PageHeader, Pill, RowAction, RowActions } from '../../components/ui';
import { Select2 } from '../../components/Select2';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const period = (r: PayrollRun) => `${MONTHS[r.month - 1]} ${r.year}`;

export default function PayrollPage() {
  const { data, loading, refresh } = useApi<PayrollRun[]>('/api/payroll/runs');
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null);

  const rows = data ?? [];
  const closed = rows.filter((r) => r.status === 'CLOSED');
  const lastClosed = closed[0];

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await api.post<PayrollRun>('/api/payroll/runs', { year: Number(year), month: Number(month) });
      setOpen(false);
      refresh();
      window.location.assign(`/payroll/${run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start this payroll.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/payroll/runs/${deleteTarget.id}`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not discard this draft.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<PayrollRun>[] = [
    {
      key: 'period',
      header: 'Period',
      accessor: (r) => r.year * 100 + r.month,
      sortable: true,
      render: (r) => (
        <Link to={`/payroll/${r.id}`} className="font-medium text-primary hover:underline">
          {period(r)}
        </Link>
      ),
    },
    { key: 'staff', header: 'Employees', align: 'right', accessor: (r) => r._count?.payslips ?? 0, render: (r) => fmt(r._count?.payslips ?? 0) },
    { key: 'gross', header: 'Gross', align: 'right', accessor: (r) => num(r.grossTotal), sortable: true, render: (r) => <span className="font-mono">{money(r.grossTotal)}</span> },
    { key: 'ded', header: 'Deductions', align: 'right', accessor: (r) => num(r.deductionsTotal), render: (r) => <span className="font-mono">{money(r.deductionsTotal)}</span> },
    { key: 'net', header: 'Net pay', align: 'right', accessor: (r) => num(r.netTotal), sortable: true, render: (r) => <span className="font-mono font-semibold">{money(r.netTotal)}</span> },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      render: (r) =>
        r.status === 'CLOSED' ? (
          <Pill tone="green">Closed {r.closedAt ? `· ${dateShort(r.closedAt)}` : ''}</Pill>
        ) : (
          <Pill tone="amber">Draft</Pill>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <RowActions>
          <RowAction
            to={`/payroll/${r.id}`}
            icon={<Eye className="h-4 w-4" />}
            label={r.status === 'CLOSED' ? 'View payroll' : 'Review payroll'}
          />
          {r.status === 'DRAFT' && (
            <RowAction onClick={() => setDeleteTarget(r)} icon={<Trash2 className="h-4 w-4" />} label="Discard draft" tone="danger" />
          )}
        </RowActions>
      ),
    },
  ];

  const years = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - 3 + i));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payroll"
        subtitle="Run monthly pay, then close it to post the cost to your profit & loss."
      />

      {error && !open && <Alert tone="red">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Payroll runs" value={fmt(rows.length)} tone="blue" icon={<CalendarDays className="h-4 w-4" />} />
        <KpiCard label="Closed" value={fmt(closed.length)} tone="green" />
        <KpiCard label="Last closed net pay" value={lastClosed ? money(lastClosed.netTotal) : '—'} tone="purple" icon={<Wallet className="h-4 w-4" />} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${period(r)} ${r.status}`}
            searchPlaceholder="Search period…"
            initialSort={{ key: 'period', dir: 'desc' }}
            emptyText="No payroll has been run yet."
            pageSize={12}
            rowKey={(r) => r.id}
            actionSlot={
              <Button onClick={() => { setOpen(true); setError(null); }}>
                <Plus className="h-4 w-4" /> New payroll run
              </Button>
            }
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Start a payroll run"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A draft payslip is prepared for every active employee using their current salary and the statutory rates in
            Settings. Nothing is posted to your accounts until you close the run.
          </p>
          {error && <Alert tone="red">{error}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Month">
              <Select2 value={month} onChange={setMonth} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} searchable={false} />
            </FormField>
            <FormField label="Year">
              <Select2 value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} searchable={false} />
            </FormField>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Discard draft payroll"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={discard} loading={busy}>
              <Trash2 className="h-4 w-4" /> Discard
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3">
            <Alert tone="amber">
              The draft payslips for <b>{period(deleteTarget)}</b> will be removed. Nothing has been posted to your accounts
              yet, so no financial records are affected.
            </Alert>
            <p className="text-xs text-muted-foreground">
              <Lock className="inline h-3 w-3" /> Closed payroll runs can never be deleted.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
