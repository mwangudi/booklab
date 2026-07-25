import { Link } from 'react-router-dom';
import { Pencil, Plus, Users as UsersIcon } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { titleCase } from '../lib/categories';
import type { User } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { Button, Card, KpiCard, Loading, PageHeader, Pill } from '../components/ui';

const roleTone = (r: string): 'purple' | 'blue' | 'gray' => (r === 'ADMIN' ? 'purple' : r === 'MANAGER' ? 'blue' : 'gray');

export default function UsersPage() {
  const { data: users, loading } = useApi<User[]>('/api/auth/users');
  const rows = users ?? [];

  const columns: Column<User>[] = [
    { key: 'name', header: 'Name', accessor: (u) => u.name, sortable: true, render: (u) => <span className="font-medium text-foreground">{u.name}</span> },
    { key: 'email', header: 'Email', accessor: (u) => u.email, sortable: true, render: (u) => <span className="text-muted-foreground">{u.email}</span> },
    { key: 'role', header: 'Role', accessor: (u) => u.role, render: (u) => <Pill tone={roleTone(u.role)}>{titleCase(u.role)}</Pill> },
    { key: 'branch', header: 'Branch', accessor: (u) => u.branch?.name ?? '', render: (u) => u.branch?.name ?? <span className="text-muted-foreground">—</span> },
    {
      key: 'status',
      header: 'Status',
      accessor: (u) => (u.active === false ? 0 : 1),
      render: (u) => (u.active === false ? <Pill tone="red">Inactive</Pill> : <Pill tone="green">Active</Pill>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <Link to={`/settings/users/${u.id}/edit`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle="Staff accounts and their access."
        right={
          <Link to="/settings/users/new">
            <Button>
              <Plus className="h-4 w-4" /> New user
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Total users" value={rows.length} tone="blue" icon={<UsersIcon className="h-4 w-4" />} />
        <KpiCard label="Administrators" value={rows.filter((u) => u.role === 'ADMIN').length} tone="purple" />
        <KpiCard label="Active" value={rows.filter((u) => u.active !== false).length} tone="green" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(u) => `${u.name} ${u.email} ${u.role} ${u.branch?.name ?? ''}`}
            searchPlaceholder="Search users…"
            initialSort={{ key: 'name', dir: 'asc' }}
            emptyText="No users yet."
            rowKey={(u) => u.id}
          />
        )}
      </Card>
    </div>
  );
}
