import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, Plus, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmt, money, num } from '../../lib/format';
import type { Employee } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, KpiCard, Loading, Modal, PageHeader, Pill, RowAction, RowActions } from '../../components/ui';

const fullName = (e: Employee) => `${e.firstName} ${e.lastName}`.trim();

export default function EmployeesPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, refresh } = useApi<Employee[]>(`/api/payroll/employees${showArchived ? '?archived=only' : ''}`, [showArchived]);
  const [target, setTarget] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = data ?? [];
  const activeCount = rows.filter((e) => e.active).length;
  const monthlyBill = rows
    .filter((e) => e.active)
    .reduce((s, e) => s + num(e.basicSalary) + num(e.houseAllowance) + num(e.transportAllowance) + num(e.otherAllowance), 0);

  const archive = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/payroll/employees/${target.id}`);
      setTarget(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not archive this employee.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (e: Employee) => {
    setError(null);
    try {
      await api.post(`/api/payroll/employees/${e.id}/restore`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not restore this employee.');
    }
  };

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      accessor: (e) => fullName(e),
      sortable: true,
      render: (e) => (
        <div>
          <div className="font-medium text-foreground">{fullName(e)}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{e.staffNo}</div>
        </div>
      ),
    },
    { key: 'job', header: 'Job title', accessor: (e) => e.jobTitle ?? '', render: (e) => e.jobTitle ?? '—' },
    { key: 'branch', header: 'Branch', accessor: (e) => e.branch?.name ?? '', render: (e) => e.branch?.name ?? '—' },
    { key: 'type', header: 'Type', accessor: (e) => e.employmentType, render: (e) => <Pill tone="blue">{e.employmentType.toLowerCase()}</Pill> },
    {
      key: 'gross',
      header: 'Gross pay',
      align: 'right',
      accessor: (e) => num(e.basicSalary) + num(e.houseAllowance) + num(e.transportAllowance) + num(e.otherAllowance),
      sortable: true,
      render: (e) => (
        <span className="font-mono">
          {money(num(e.basicSalary) + num(e.houseAllowance) + num(e.transportAllowance) + num(e.otherAllowance))}
        </span>
      ),
    },
    {
      key: 'login',
      header: 'Login',
      render: (e) => (e.user ? <Pill tone="green">{e.user.email}</Pill> : <span className="text-xs text-muted-foreground">No login</span>),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (e) => (e.active ? 1 : 0),
      render: (e) => (e.deletedAt ? <Pill tone="red">Archived</Pill> : e.active ? <Pill tone="green">Active</Pill> : <Pill tone="amber">Inactive</Pill>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <RowActions>
          {e.deletedAt ? (
            <RowAction onClick={() => restore(e)} icon={<ArchiveRestore className="h-4 w-4" />} label="Restore employee" />
          ) : (
            <>
              <RowAction to={`/people/employees/${e.id}/edit`} icon={<Pencil className="h-4 w-4" />} label="Edit employee" />
              <RowAction
                onClick={() => {
                  setTarget(e);
                  setError(null);
                }}
                icon={<Archive className="h-4 w-4" />}
                label="Archive employee"
                tone="danger"
              />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={showArchived ? 'Archived employees' : 'Employees'}
        subtitle="Staff on the payroll. They do not need a system login to be paid."
        right={
          <>
            <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? <Users className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {showArchived ? 'Active list' : 'Archived'}
            </Button>
            <Link to="/people/employees/new">
              <Button>
                <Plus className="h-4 w-4" /> New employee
              </Button>
            </Link>
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Employees" value={fmt(rows.length)} tone="blue" icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Active" value={fmt(activeCount)} tone="green" />
        <KpiCard label="Monthly gross bill" value={money(monthlyBill)} tone="purple" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(e) => `${fullName(e)} ${e.staffNo} ${e.jobTitle ?? ''} ${e.branch?.name ?? ''}`}
            searchPlaceholder="Search name, staff number, job title…"
            initialSort={{ key: 'name', dir: 'asc' }}
            emptyText={showArchived ? 'No archived employees.' : 'No employees yet. Add your first employee to run payroll.'}
            pageSize={12}
            rowKey={(e) => e.id}
          />
        )}
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Archive employee"
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={archive} loading={busy}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">{fullName(target)}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{target.staffNo}</div>
            </div>
            <Alert tone="amber">
              They will be left out of future payroll runs. Nothing is deleted — past payslips stay on record and you can
              restore them at any time.
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}
