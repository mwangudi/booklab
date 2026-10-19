import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { fmt } from '../lib/format';
import { Alert, Card, KpiCard, PageHeader, Pill, Select } from '../components/ui';

type CatalogueRow = { capability: string; label: string; hint: string };
type UserCap = { capability: string; allowed: boolean; fromRole: boolean; expiresAt: string | null };
type PermUser = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  role: string;
  branchName: string | null;
  capabilities: UserCap[];
};

const MAX_DAYS = 365;
const PAGE_SIZE = 10;

/** Temporary access is the common case, so the shortcuts come first. */
const DURATIONS: { label: string; days: number | null }[] = [
  { label: 'Until end of today', days: 0 },
  { label: 'For 1 day', days: 1 },
  { label: 'For 3 days', days: 3 },
  { label: 'For 7 days', days: 7 },
  { label: 'For 30 days', days: 30 },
  { label: 'Until I turn it off', days: null },
];

/** 0 days means the end of today, so "until Monday" behaves the way people say it. */
const expiryFor = (days: number | null): string | null => {
  if (days === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

/** Counts calendar days, not elapsed hours: "for 3 days" must not read back as "4d left". */
const remaining = (iso: string): string => {
  const end = new Date(iso);
  if (end.getTime() <= Date.now()) return 'expired';
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(end) - midnight(new Date())) / 86_400_000);
  if (days <= 0) return 'ends today';
  if (days === 1) return 'ends tomorrow';
  return `${days}d left`;
};

/** Who can do what — ported from PharmaCare. Roles set the default; a tick makes one person an exception. */
export default function PermissionsPage() {
  const { data: catalogue } = useApi<CatalogueRow[]>('/api/permissions/catalogue');
  const { data: usersData, loading, refresh } = useApi<PermUser[]>('/api/permissions/users');
  const users = usersData ?? [];

  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState('');

  const openPicker = (key: string) => {
    setCustomDays('');
    setPicking(key);
  };

  /** Whole days only, and bounded — an exception is not meant to outlive the year. */
  const customValue = (() => {
    if (!/^\d+$/.test(customDays.trim())) return null;
    const n = Number(customDays);
    return n >= 1 && n <= MAX_DAYS ? n : null;
  })();

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return `${u.name} ${u.username ?? ''} ${u.email} ${u.branchName ?? ''}`.toLowerCase().includes(q);
    });
  }, [users, roleFilter, search]);

  // Narrowing the list can leave you past the end of it.
  useEffect(() => setPage(0), [roleFilter, search]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = matching.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const showFrom = matching.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const showTo = Math.min((safePage + 1) * PAGE_SIZE, matching.length);

  const set = async (user: PermUser, capability: string, allowed: boolean | null, expiresAt: string | null = null) => {
    setErr(null);
    setPicking(null);
    setBusy(`${user.id}:${capability}`);
    try {
      await api.put(`/api/permissions/users/${user.id}`, { capability, allowed, expiresAt });
      refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  };

  const exceptions = users.reduce((n, u) => n + u.capabilities.filter((c) => !c.fromRole).length, 0);
  const expiring = users.reduce((n, u) => n + u.capabilities.filter((c) => !c.fromRole && c.expiresAt).length, 0);
  const cashiers = users.filter((u) => u.role === 'CASHIER').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Permissions"
        subtitle="Each role has a default. Tick a box to grant something to one person, and choose how long it lasts; untick to refuse it."
        right={
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-44">
            <option value="">All roles</option>
            <option value="CASHIER">Cashiers</option>
            <option value="MANAGER">Managers</option>
            <option value="ADMIN">Administrators</option>
          </Select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="People" value={fmt(users.length)} sub="Active accounts" tone="blue" />
        <KpiCard label="Cashiers" value={fmt(cashiers)} sub="Till, customers and invoices by default" tone="amber" />
        <KpiCard
          label="Exceptions"
          value={fmt(exceptions)}
          sub={expiring > 0 ? `${expiring} expire on their own` : 'Differ from their role'}
          tone={exceptions > 0 ? 'purple' : 'neutral'}
        />
        <KpiCard label="Switches" value={fmt(catalogue?.length ?? 0)} sub="Things worth controlling" tone="green" />
      </div>

      {err && <Alert tone="red">{err}</Alert>}

      <Card className="p-4">
        <div className="mb-3 relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username or branch…"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="sticky left-0 z-[1] bg-muted px-3 py-2 text-left font-semibold">Person</th>
                {(catalogue ?? []).map((c) => (
                  <th key={c.capability} className="px-2 py-2 text-center font-semibold" title={c.hint}>
                    <span className="block w-[92px] mx-auto text-xs leading-tight">{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-[1] bg-card px-3 py-2">
                    <div className="font-medium text-foreground whitespace-nowrap">{u.name}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                      <Pill tone={u.role === 'ADMIN' ? 'purple' : u.role === 'MANAGER' ? 'blue' : 'gray'}>{u.role.toLowerCase()}</Pill>
                      {u.branchName ?? 'No branch'}
                    </div>
                  </td>
                  {u.capabilities.map((c) => {
                    const key = `${u.id}:${c.capability}`;
                    return (
                      <td key={c.capability} className="relative px-2 py-2 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <input
                            type="checkbox"
                            aria-label={`${c.capability} for ${u.name}`}
                            className="h-4 w-4 accent-[#b45309] disabled:opacity-40"
                            checked={c.allowed}
                            disabled={u.role === 'ADMIN' || busy === key}
                            onChange={(e) => (e.target.checked ? openPicker(key) : set(u, c.capability, false))}
                          />
                          {u.role !== 'ADMIN' && !c.fromRole &&
                            (c.expiresAt ? (
                              <button
                                type="button"
                                onClick={() => openPicker(key)}
                                className="text-[10px] text-[#8a5a00] hover:underline whitespace-nowrap"
                                title={`Ends ${new Date(c.expiresAt).toLocaleString()} — click to change`}
                              >
                                {remaining(c.expiresAt)}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => set(u, c.capability, null)}
                                className="text-[10px] text-primary hover:underline"
                                title="Put this person back on their role default"
                              >
                                exception
                              </button>
                            ))}
                        </div>

                        {picking === key && (
                          <>
                            <button type="button" aria-label="Cancel" className="fixed inset-0 z-10 cursor-default" onClick={() => setPicking(null)} />
                            <div className="absolute left-1/2 z-20 mt-1 w-44 -translate-x-1/2 rounded-md border border-border bg-background py-1 text-left shadow-lg">
                              {DURATIONS.map((d) => (
                                <button
                                  key={d.label}
                                  type="button"
                                  onClick={() => set(u, c.capability, true, expiryFor(d.days))}
                                  className="block w-full px-3 py-1.5 text-xs hover:bg-muted"
                                >
                                  {d.label}
                                </button>
                              ))}
                              <div className="mt-1 flex items-center gap-1 border-t border-border px-2 pt-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={MAX_DAYS}
                                  value={customDays}
                                  autoFocus
                                  onChange={(e) => setCustomDays(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && customValue) set(u, c.capability, true, expiryFor(customValue));
                                    if (e.key === 'Escape') setPicking(null);
                                  }}
                                  placeholder="days"
                                  aria-label="Number of days"
                                  className="w-14 rounded border border-input bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
                                />
                                <button
                                  type="button"
                                  disabled={!customValue}
                                  onClick={() => customValue && set(u, c.capability, true, expiryFor(customValue))}
                                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-40"
                                >
                                  Set
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={1 + (catalogue?.length ?? 0)} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? 'Loading…' : 'Nobody to show'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>
            Showing <b className="text-foreground">{showFrom}</b>–<b className="text-foreground">{showTo}</b> of{' '}
            <b className="text-foreground">{matching.length}</b>
          </span>
          <div className="flex items-center gap-2">
            <span>
              Page <b className="text-foreground">{safePage + 1}</b> of <b className="text-foreground">{pageCount}</b>
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="rounded-md border border-input p-1 hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
              className="rounded-md border border-input p-1 hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Administrators always have every permission, so a mistake here can never lock you out. A box marked{' '}
          <b>exception</b> differs from the role default — click it to undo. Changes reach a signed-in phone the next time
          the app is opened online. Hover a heading for what it covers.
        </p>
      </Card>
    </div>
  );
}
