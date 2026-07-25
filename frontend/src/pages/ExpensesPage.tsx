import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { dateShort, fmt, money, num, startOfMonth, today } from '../lib/format';
import { EXPENSE_CATEGORIES, titleCase } from '../lib/categories';
import type { Expense } from '../types';
import { BranchSelect } from '../components/BranchSelect';
import { DataTable, type Column } from '../components/DataTable';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill } from '../components/ui';
import { Select2 } from '../components/Select2';

const catTone = (c: string): 'blue' | 'purple' | 'amber' | 'green' | 'gray' =>
  ({ RENT: 'blue', SALARY: 'purple', UTILITIES: 'amber', SUPPLIES: 'green', MARKETING: 'blue', MISC: 'gray' } as const)[c] ?? 'gray';

export default function ExpensesPage() {
  const { isAdmin, canManage } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    const s = p.toString();
    return `/api/expenses${s ? `?${s}` : ''}`;
  }, [isAdmin, branchId, from, to]);

  const { data: expenses, loading } = useApi<Expense[]>(query, [query]);
  const all = expenses ?? [];
  const rows = useMemo(() => (category ? all.filter((e) => e.category === category) : all), [all, category]);

  const total = rows.reduce((s, e) => s + num(e.amount), 0);
  const topCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) m.set(e.category, (m.get(e.category) ?? 0) + num(e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [all]);

  const columns: Column<Expense>[] = [
    { key: 'date', header: 'Date', accessor: (e) => e.incurredAt, sortable: true, render: (e) => dateShort(e.incurredAt) },
    { key: 'branch', header: 'Branch', accessor: (e) => e.branch?.name ?? 'HQ', render: (e) => e.branch?.name ?? <span className="text-muted-foreground">HQ / unassigned</span> },
    { key: 'category', header: 'Category', accessor: (e) => e.category, render: (e) => <Pill tone={catTone(e.category)}>{titleCase(e.category)}</Pill> },
    { key: 'description', header: 'Description', accessor: (e) => e.description ?? '', render: (e) => e.description || <span className="text-muted-foreground">—</span> },
    { key: 'amount', header: 'Amount', align: 'right', accessor: (e) => num(e.amount), sortable: true, render: (e) => <span className="font-mono">{money(e.amount)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenses"
        subtitle="Rent, salaries, utilities, supplies and more."
        right={
          canManage && (
            <Link to="/expenses/new">
              <Button>
                <Plus className="h-4 w-4" /> Record expense
              </Button>
            </Link>
          )
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
          <FormField label="Category">
            <Select2
              value={category}
              onChange={setCategory}
              options={[{ value: '', label: 'All categories' }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))]}
            />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Total expenses" value={money(total)} tone="amber" icon={<Wallet className="h-4 w-4" />} filled />
        <KpiCard label="Entries" value={fmt(rows.length)} tone="blue" />
        <KpiCard label="Top category" value={topCat ? titleCase(topCat[0]) : '—'} sub={topCat ? money(topCat[1]) : undefined} tone="purple" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(e) => `${e.category} ${e.description ?? ''} ${e.branch?.name ?? ''}`}
            searchPlaceholder="Search expenses…"
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyText="No expenses in this period."
            pageSize={12}
            rowKey={(e) => e.id}
          />
        )}
      </Card>
    </div>
  );
}
