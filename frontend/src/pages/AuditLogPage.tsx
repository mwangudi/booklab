import { useMemo, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { dateShort, dateTime, fmt, isoDate, today } from '../lib/format';
import { downloadCsv } from '../lib/reportExport';
import type { AuditEntry } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { Button, Card, FormField, Input, KpiCard, Loading, PageHeader, Pill } from '../components/ui';
import { Select2 } from '../components/Select2';

const ACTION_TONE = (action: string): 'green' | 'red' | 'amber' | 'blue' | 'purple' => {
  if (action.startsWith('LOGIN_FAILED') || action === 'LOGIN_BLOCKED' || action === 'VOID' || action === 'ARCHIVE') return 'red';
  if (action === 'LOGIN') return 'green';
  if (action.startsWith('UPDATE') || action === 'SET_PRICE' || action === 'CLEAR_PRICE' || action === 'STOCK_TAKE') return 'amber';
  if (action === 'CREATE' || action === 'RESTORE' || action === 'INTAKE' || action === 'IMPORT') return 'blue';
  return 'purple';
};

const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * One detail value as text, however deeply it is nested. Objects become
 * "key: value" lists in brackets — String() on them printed "[object Object]".
 */
const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') {
    if (!ISO_DATE.test(v)) return v;
    // A date with no time of day (a due date) stored as local midnight: show just the date.
    const d = new Date(v);
    return d.getHours() === 0 && d.getMinutes() === 0 ? dateShort(v) : dateTime(v);
  }
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.length ? v.map(show).join('; ') : 'none';
  const o = v as Record<string, unknown>;
  // A permission exception: "allowed until 20 Oct 2026, 23:59" or "refused".
  if ('allowed' in o && Object.keys(o).every((k) => k === 'allowed' || k === 'expiresAt')) {
    if (!o.allowed) return o.expiresAt ? `refused until ${show(o.expiresAt)}` : 'refused';
    return o.expiresAt ? `allowed until ${show(o.expiresAt)}` : 'allowed (no end date)';
  }
  const parts = Object.entries(o).map(([k, x]) => `${k}: ${show(x)}`);
  return parts.length ? `(${parts.join(', ')})` : '—';
};

/** Render the stored JSON detail blob as a compact, readable summary. */
const summarise = (details: string | null): string => {
  if (!details) return '—';
  try {
    const d = JSON.parse(details) as Record<string, unknown>;
    if (d.changes && typeof d.changes === 'object') {
      const entries = Object.entries(d.changes as Record<string, { from: unknown; to: unknown }>);
      if (entries.length === 0) return 'No field changes';
      return entries.map(([k, v]) => `${k}: ${show(v.from)} → ${show(v.to)}`).join(', ');
    }
    // A before/after pair reads better as one arrow than as two separate fields.
    if ('from' in d && 'to' in d) {
      const rest = Object.entries(d).filter(([k]) => k !== 'from' && k !== 'to');
      return [...rest.map(([k, v]) => `${k}: ${show(v)}`), `${show(d.from)} → ${show(d.to)}`].join(', ');
    }
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${show(v)}`)
      .join(', ');
  } catch {
    return details;
  }
};

const weekAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return isoDate(d);
};

export default function AuditLogPage() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());

  const { data: facets } = useApi<{ entities: string[]; actions: string[] }>('/api/audit/facets');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (entity) p.set('entity', entity);
    if (action) p.set('action', action);
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    const s = p.toString();
    return `/api/audit${s ? `?${s}` : ''}`;
  }, [entity, action, from, to]);

  const { data, loading } = useApi<AuditEntry[]>(query, [query]);
  const rows = data ?? [];

  const failedLogins = rows.filter((r) => r.action === 'LOGIN_FAILED' || r.action === 'LOGIN_BLOCKED').length;
  const actors = new Set(rows.map((r) => r.user)).size;

  const exportCsv = () =>
    downloadCsv(
      `audit-log-${from}-to-${to}.csv`,
      ['When', 'User', 'Email', 'Role', 'Entity', 'Record', 'Action', 'IP', 'Details'],
      rows.map((r) => [
        dateTime(r.createdAt),
        r.user,
        r.email ?? '',
        r.role ?? '',
        r.entity,
        r.entityId ?? '',
        r.action,
        r.ip ?? '',
        summarise(r.details),
      ]),
    );

  const columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'When', accessor: (r) => r.createdAt, sortable: true, render: (r) => dateTime(r.createdAt) },
    {
      key: 'user',
      header: 'User',
      accessor: (r) => r.user,
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-medium text-foreground">{r.user}</div>
          {r.email && <div className="text-[11px] text-muted-foreground">{r.email}</div>}
        </div>
      ),
    },
    { key: 'entity', header: 'Area', accessor: (r) => r.entity, sortable: true, render: (r) => <Pill tone="blue">{r.entity}</Pill> },
    { key: 'action', header: 'Action', accessor: (r) => r.action, sortable: true, render: (r) => <Pill tone={ACTION_TONE(r.action)}>{pretty(r.action)}</Pill> },
    { key: 'record', header: 'Record', align: 'right', render: (r) => <span className="font-mono text-xs">{r.entityId ?? '—'}</span> },
    { key: 'ip', header: 'IP', render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.ip ?? '—'}</span> },
    { key: 'details', header: 'Details', render: (r) => <span className="text-xs text-muted-foreground">{summarise(r.details)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        subtitle="Who did what, when and from where — across every branch."
        right={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FormField label="Area">
            <Select2
              value={entity}
              onChange={setEntity}
              options={[{ value: '', label: 'All areas' }, ...(facets?.entities ?? []).map((e) => ({ value: e, label: e }))]}
            />
          </FormField>
          <FormField label="Action">
            <Select2
              value={action}
              onChange={setAction}
              options={[{ value: '', label: 'All actions' }, ...(facets?.actions ?? []).map((a) => ({ value: a, label: pretty(a) }))]}
            />
          </FormField>
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Events" value={fmt(rows.length)} tone="blue" icon={<ShieldCheck className="h-4 w-4" />} />
        <KpiCard label="People active" value={fmt(actors)} tone="purple" />
        <KpiCard label="Failed / blocked sign-ins" value={fmt(failedLogins)} tone={failedLogins > 0 ? 'red' : 'green'} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.user} ${r.email ?? ''} ${r.entity} ${r.action} ${r.ip ?? ''} ${r.details ?? ''}`}
            searchPlaceholder="Search user, action, IP, details…"
            initialSort={{ key: 'when', dir: 'desc' }}
            emptyText="No audited activity in this period."
            pageSize={15}
            rowKey={(r) => r.id}
          />
        )}
      </Card>
    </div>
  );
}
