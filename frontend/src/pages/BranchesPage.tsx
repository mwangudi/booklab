import { Link } from 'react-router-dom';
import { Building2, Pencil, Plus } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { dateShort } from '../lib/format';
import type { Branch } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { Button, Card, KpiCard, Loading, PageHeader, RowAction, RowActions } from '../components/ui';

export default function BranchesPage() {
  const { data: branches, loading } = useApi<Branch[]>('/api/branches');
  const rows = branches ?? [];

  const columns: Column<Branch>[] = [
    { key: 'name', header: 'Branch', accessor: (b) => b.name, sortable: true, render: (b) => <span className="font-medium text-foreground">{b.name}</span> },
    { key: 'code', header: 'Code', accessor: (b) => b.code ?? '', sortable: true, render: (b) => <span className="font-mono text-xs">{b.code}</span> },
    { key: 'location', header: 'Location', accessor: (b) => b.location, sortable: true },
    { key: 'created', header: 'Created', accessor: (b) => b.createdAt ?? '', render: (b) => dateShort(b.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (b) => (
        <RowActions>
          <RowAction to={`/branches/${b.id}/edit`} icon={<Pencil className="h-4 w-4" />} label="Edit branch" />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Branches"
        subtitle="Shops and outlets in your network."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Total branches" value={rows.length} tone="blue" icon={<Building2 className="h-4 w-4" />} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(b) => `${b.name} ${b.location}`}
            searchPlaceholder="Search branches…"
            initialSort={{ key: 'name', dir: 'asc' }}
            emptyText="No branches yet."
            rowKey={(b) => b.id}
            actionSlot={
              <Link to="/branches/new">
                <Button>
                  <Plus className="h-4 w-4" /> New branch
                </Button>
              </Link>
            }
          />
        )}
      </Card>
    </div>
  );
}
