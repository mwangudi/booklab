/**
 * Sales recorded while the till had no connection.
 *
 * Each queued sale carries the uuid it will be created with, so replaying it is
 * safe: the server returns the existing sale rather than ringing it up again.
 * That makes a flaky connection harmless — the worst case is a sale sent twice
 * and accepted once.
 *
 * IndexedDB rather than localStorage because this is money: it survives a tab
 * crash and is not capped at a few megabytes.
 */

const DB_NAME = 'booklab-offline';
const STORE = 'pendingSales';
const VERSION = 1;

/** Raised whenever the queue changes, so every view of it agrees. */
export const QUEUE_EVENT = 'booklab:queue-change';
const announce = () => window.dispatchEvent(new Event(QUEUE_EVENT));

export interface PendingSale {
  uuid: string;
  /** Exactly the body POST /api/sales expects. */
  payload: Record<string, unknown>;
  branchId: number;
  total: number;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'uuid' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function queueSale(sale: PendingSale): Promise<void> {
  await tx('readwrite', (s) => s.put(sale));
  announce();
}

export async function pendingSales(): Promise<PendingSale[]> {
  const rows = await tx<PendingSale[]>('readonly', (s) => s.getAll() as IDBRequest<PendingSale[]>);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(): Promise<number> {
  try {
    return await tx<number>('readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

export async function forgetSale(uuid: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(uuid));
  announce();
}

export async function recordAttempt(sale: PendingSale, error: string): Promise<void> {
  await queueSale({ ...sale, attempts: sale.attempts + 1, lastError: error });
}
