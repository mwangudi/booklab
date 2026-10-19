import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { dateShort, isoDate } from '../lib/format';
import type { StockTakeFrequency, StockTakeScheduleRow } from '../types';
import { Alert, Button, Card, FormField, Input, Pill, SectionTitle, Select } from './ui';

const FREQUENCIES: Array<{ value: StockTakeFrequency; label: string }> = [
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'QUARTERLY', label: 'Every quarter' },
];

/** "Due in 3 days", "Overdue by 2 days", "Due today" — how a schedule stands. */
export function scheduleText(s: StockTakeScheduleRow): string {
  if (s.status === 'off' || s.nextDue == null || s.daysUntilDue == null) return 'Not scheduled';
  const d = s.daysUntilDue;
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? '' : 's'} (was due ${dateShort(s.nextDue)})`;
  if (d === 0) return 'Due today';
  return `Due ${dateShort(s.nextDue)} — in ${d} day${d === 1 ? '' : 's'}`;
}

const statusPill = (s: StockTakeScheduleRow) =>
  s.status === 'overdue' ? <Pill tone="red">Overdue</Pill>
  : s.status === 'due' ? <Pill tone="amber">Due</Pill>
  : s.status === 'scheduled' ? <Pill tone="green">Scheduled</Pill>
  : <Pill tone="gray">Off</Pill>;

/** Dashboard reminder: every branch whose full count is due or overdue. */
export function DueStockTakes() {
  const { data } = useApi<StockTakeScheduleRow[]>('/api/stock/take-schedules');
  const due = (data ?? []).filter((s) => s.status === 'due' || s.status === 'overdue');
  if (due.length === 0) return null;
  const overdue = due.some((s) => s.status === 'overdue');
  return (
    <Alert tone={overdue ? 'red' : 'amber'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="font-semibold">Stock take {overdue ? 'overdue' : 'due'}</div>
          {due.map((s) => (
            <div key={s.branchId}>
              {s.branchName}: {scheduleText(s)}
            </div>
          ))}
        </div>
        <Link to="/stock/take">
          <Button variant="outline">
            <CalendarClock className="h-4 w-4" /> Start stock take
          </Button>
        </Link>
      </div>
    </Alert>
  );
}

/** The chosen branch's schedule on the stock take page. Admins set it here. */
export function ScheduleCard({ branchId, refreshKey }: { branchId: number; refreshKey?: unknown }) {
  const { isAdmin } = useAuth();
  const { data, refresh } = useApi<StockTakeScheduleRow[]>('/api/stock/take-schedules', [refreshKey]);
  const row = data?.find((s) => s.branchId === branchId) ?? null;

  const [editing, setEditing] = useState(false);
  const [frequency, setFrequency] = useState<StockTakeFrequency>('MONTHLY');
  const [nextDue, setNextDue] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setError(null);
  }, [branchId]);

  const startEdit = () => {
    setFrequency(row?.frequency ?? 'MONTHLY');
    setNextDue(row?.nextDue ? isoDate(new Date(row.nextDue)) : '');
    // A new schedule starts switched on; an existing one keeps its setting.
    setActive(row?.frequency ? row.active : true);
    setEditing(true);
    setError(null);
  };

  const save = async () => {
    if (!nextDue) {
      setError('Choose the date of the next count.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/stock/take-schedules/${branchId}`, { frequency, nextDue, active });
      setEditing(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the schedule.');
    } finally {
      setBusy(false);
    }
  };

  if (!row) return null;

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle
        right={isAdmin && !editing && (
          <Button variant="outline" onClick={startEdit}>
            {row.frequency ? 'Change schedule' : 'Set a schedule'}
          </Button>
        )}
      >
        Scheduled stock take
      </SectionTitle>

      {!editing && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {statusPill(row)}
          <span>{scheduleText(row)}</span>
          {row.frequency && row.status !== 'off' && (
            <span className="text-muted-foreground">{FREQUENCIES.find((f) => f.value === row.frequency)?.label}</span>
          )}
          <span className="text-muted-foreground">
            Last full count: {row.lastDoneAt ? `${dateShort(row.lastDoneAt)}${row.lastDoneBy ? ` by ${row.lastDoneBy}` : ''}` : 'none recorded'}
          </span>
        </div>
      )}

      {!editing && row.status !== 'off' && (
        <p className="text-xs text-muted-foreground">
          Uploading a count that covers nearly every product this branch holds, from a week before the date onwards,
          marks it done and sets the next date.
        </p>
      )}

      {editing && (
        <div className="space-y-3">
          {error && <Alert tone="red">{error}</Alert>}
          <div className="grid sm:grid-cols-3 gap-3">
            <FormField label="How often">
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as StockTakeFrequency)}>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Next count on" hint="Later counts fall on the same day of the cycle. Choose the 1st–28th to keep it fixed every month.">
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </FormField>
            <FormField label="Status">
              <Select value={active ? 'on' : 'off'} onChange={(e) => setActive(e.target.value === 'on')}>
                <option value="on">On</option>
                <option value="off">Off — no reminders</option>
              </Select>
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} loading={busy}>
              Save schedule
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
