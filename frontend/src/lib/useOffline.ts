import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, OFFLINE_EVENT } from './api';
import { offlineState, markSynced, type OfflineState } from './offlineBudget';
import { forgetSale, pendingSales, recordAttempt, pendingCount, QUEUE_EVENT } from './offlineQueue';

/**
 * Replays everything the till recorded offline. Safe to call at any time: each
 * sale carries the uuid it will be created with, so a sale that already reached
 * the server is returned rather than duplicated.
 *
 * The lock is module-level, not per-hook: several components use this hook and
 * all of them react to the same `online` event, so a per-instance guard would
 * still let them replay the same sale at once.
 */
let flushing = false;

export async function flushPendingSales(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const sale of await pendingSales()) {
    try {
      await api.post('/api/sales', sale.payload);
      await forgetSale(sale.uuid);
      sent += 1;
    } catch (err) {
      // A sale the server refuses on its merits will never succeed, so it is
      // dropped rather than blocking the queue behind it forever. Anything else
      // — no connection, a server error — is left to retry.
      const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
      if (permanent) {
        await forgetSale(sale.uuid);
        failed += 1;
      } else {
        await recordAttempt(sale, err instanceof Error ? err.message : 'unknown error');
        break;
      }
    }
  }
  if (sent > 0) markSynced();
  return { sent, failed };
}

/** Connection state, the remaining offline budget, and what is still unsent. */
export function useOffline() {
  const [state, setState] = useState<OfflineState>(() => offlineState());
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(() => {
    void pendingCount().then(setPending);
  }, []);

  const flush = useCallback(async () => {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      const result = await flushPendingSales();
      setState(offlineState());
      refreshPending();
      return result;
    } finally {
      flushing = false;
    }
  }, [refreshPending]);

  useEffect(() => {
    const tick = () => setState(offlineState());
    const onOnline = () => {
      tick();
      void flush();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', tick);
    window.addEventListener(OFFLINE_EVENT, tick);
    window.addEventListener(QUEUE_EVENT, refreshPending);
    // The budget burns down on a timer, so the countdown has to move on its own.
    const timer = window.setInterval(tick, 20_000);

    refreshPending();
    if (navigator.onLine) void flush();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', tick);
      window.removeEventListener(OFFLINE_EVENT, tick);
      window.removeEventListener(QUEUE_EVENT, refreshPending);
      window.clearInterval(timer);
    };
  }, [flush, refreshPending]);

  return { ...state, pending, flush, refreshPending };
}
