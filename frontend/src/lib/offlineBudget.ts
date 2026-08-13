/**
 * Offline trading budget.
 *
 * A phone may keep selling without a connection, but only for a bounded window.
 * The longer a till runs blind the more its stock figures drift from the shop's
 * and the more unsent money sits on one device, so past the budget the till
 * stops taking sales until it has reconciled.
 *
 * The clock runs from the last *successful* contact with the server, not from
 * when the connection dropped, so a till that has been sitting unused overnight
 * is treated as stale rather than fresh.
 */

const KEY = 'booklab.lastSync';
export const OFFLINE_BUDGET_MS = 2 * 60 * 60 * 1000;
/** Warn once the remaining budget drops below this. */
const WARN_AT_MS = 30 * 60 * 1000;

export type OfflineState = {
  online: boolean;
  /** Milliseconds of trading left before the till must reconnect. */
  remainingMs: number;
  /** Budget exhausted — selling is blocked until the next successful sync. */
  expired: boolean;
  /** Running low; worth telling the user before they are cut off. */
  warning: boolean;
  lastSyncAt: number | null;
};

export function markSynced(at = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    /* private browsing — the budget simply behaves as never-synced */
  }
}

export function lastSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function offlineState(now = Date.now()): OfflineState {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const last = lastSyncAt();
  // Online means the budget is not running; it refills on the next call that succeeds.
  if (online) return { online: true, remainingMs: OFFLINE_BUDGET_MS, expired: false, warning: false, lastSyncAt: last };
  // Never synced on this device: there is nothing to trade against.
  if (last == null) return { online: false, remainingMs: 0, expired: true, warning: true, lastSyncAt: null };

  const remainingMs = Math.max(0, last + OFFLINE_BUDGET_MS - now);
  return {
    online: false,
    remainingMs,
    expired: remainingMs <= 0,
    warning: remainingMs <= WARN_AT_MS,
    lastSyncAt: last,
  };
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
