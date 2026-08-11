import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, FileText, Pencil, Plus, Users, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmt, money } from '../../lib/format';
import { downloadCsv } from '../../lib/reportExport';
import type { Customer, CustomerBalance } from '../../types';
import { DataTable, type Column } from '../../components/DataTable';
import { Alert, Button, Card, KpiCard, Loading, PageHeader, Pill, RowAction, RowActions } from '../../components/ui';

export default function CustomersPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: customers, loading, refresh } = useApi<Customer[]>(
    `/api/invoices/customers${showArchived ? '?archived=only' : ''}`,
    [showArchived],
  );
  const { data: balances } = useApi<CustomerBalance[]>('/api/invoices/customers/balances');
  const [error, setError] = useState<string | null>(null);

  const balanceById = useMemo(() => new Map((balances ?? []).map((b) => [b.id, b])), [balances]);
  const rows = customers ?? [];
  const owed = (balances ?? []).reduce((s, b) => s + b.balance, 0);
  const owing = (balances ?? []).filter((b) => b.balance > 0).length;

  const act = async (fn: () => Promise<unknown>, fail: string) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fail);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      'customer-balances.csv',
      ['Customer', 'Type', 'Contact', 'Phone', 'Invoices', 'Invoiced', 'Received', 'Balance'],
      (balances ?? []).map((b) => [b.name, b.type, b.contactPerson ?? '', b.phone ?? '', b.invoices, Math.round(b.invoiced), Math.round(b.received), Math.round(b.balance)]),
    );

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      accessor: (c) => c.name,
      sortable: true,
      render: (c) => (
        <div>
          <div className="font-medium text-foreground">{c.name}</div>
          {c.contactPerson && <div className="text-[11px] text-muted-foreground">{c.contactPerson}</div>}
        </div>
      ),
    },
    { key: 'type', header: 'Type', accessor: (c) => c.type, render: (c) => <Pill tone="blue">{c.type.toLowerCase()}</Pill> },
    { key: 'phone', header: 'Phone', render: (c) => c.phone ?? '—' },
    { key: 'terms', header: 'Terms', align: 'right', render: (c) => `${c.paymentTermsDays} days` },
    {
      key: 'invoices',
      header: 'Invoices',
      align: 'right',
      accessor: (c) => balanceById.get(c.id)?.invoices ?? 0,
      sortable: true,
      render: (c) => fmt(balanceById.get(c.id)?.invoices ?? 0),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      accessor: (c) => balanceById.get(c.id)?.balance ?? 0,
      sortable: true,
      render: (c) => {
        const b = balanceById.get(c.id)?.balance ?? 0;
        return <span className={b > 0 ? 'font-mono font-semibold text-[#9b2626]' : 'font-mono text-muted-foreground'}>{money(b)}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <RowActions>
          {c.deletedAt ? (
            <RowAction
              onClick={() => act(() => api.post(`/api/invoices/customers/${c.id}/restore`), 'Could not restore.')}
              icon={<ArchiveRestore className="h-4 w-4" />}
              label="Restore customer"
            />
          ) : (
            <>
              <RowAction to={`/customers/${c.id}/statement`} icon={<FileText className="h-4 w-4" />} label="Statement of account" />
              <RowAction to={`/customers/${c.id}/edit`} icon={<Pencil className="h-4 w-4" />} label="Edit customer" />
              <RowAction
                onClick={() => act(() => api.delete(`/api/invoices/customers/${c.id}`), 'Could not archive.')}
                icon={<Archive className="h-4 w-4" />}
                label="Archive customer"
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
        title={showArchived ? 'Archived customers' : 'Customers'}
        subtitle="Schools and institutions we supply on credit."
        right={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!balances?.length}>
              Export balances
            </Button>
            <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? <Users className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {showArchived ? 'Active list' : 'Archived'}
            </Button>
            <Link to="/customers/new">
              <Button>
                <Plus className="h-4 w-4" /> New customer
              </Button>
            </Link>
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Customers" value={fmt(rows.length)} tone="blue" icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Owing money" value={fmt(owing)} tone={owing > 0 ? 'amber' : 'green'} />
        <KpiCard label="Total outstanding" value={money(owed)} tone={owed > 0 ? 'red' : 'green'} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(c) => `${c.name} ${c.contactPerson ?? ''} ${c.phone ?? ''} ${c.type}`}
            searchPlaceholder="Search customer, contact, phone…"
            initialSort={{ key: 'name', dir: 'asc' }}
            emptyText={showArchived ? 'No archived customers.' : 'No customers yet. Add the schools you supply.'}
            pageSize={12}
            rowKey={(c) => c.id}
          />
        )}
      </Card>
    </div>
  );
}
