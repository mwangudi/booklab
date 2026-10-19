import { useEffect } from 'react';
import { api } from './api';
import { setAuthUser, useAuth, type AuthUser, type Role } from './auth';

/** Mirrors backend/src/middleware/permissions.ts. The server is the authority; this
 *  only decides what to show, so a stale list can hide a button but never grant one. */
export type Capability =
  | 'customer.view'
  | 'invoice.create'
  | 'customer.manage'
  | 'invoice.deliver'
  | 'payment.record'
  | 'sale.tierPrice'
  | 'sale.discount'
  | 'price.edit'
  | 'stock.quantity.edit'
  | 'stock.intake'
  | 'goods.receive'
  | 'product.create'
  | 'expense.manage';

/** Role defaults, used only for a session signed in before capabilities were sent. */
const ROLE_DEFAULTS: Record<Role, Capability[] | 'all'> = {
  ADMIN: 'all',
  MANAGER: 'all',
  CASHIER: ['customer.view', 'invoice.create', 'price.edit', 'stock.quantity.edit', 'stock.intake'],
};

export function userCan(user: AuthUser | null, ...any: Capability[]): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const held = user.capabilities ?? ROLE_DEFAULTS[user.role];
  if (held === 'all') return true;
  return any.some((c) => (held as string[]).includes(c));
}

/** `can('invoice.create')` — true if the signed-in person holds any of the given capabilities. */
export function useCan() {
  const { user } = useAuth();
  return (...any: Capability[]) => userCan(user, ...any);
}

/**
 * Refresh the signed-in person's capabilities from the server when the app opens,
 * so a permission an admin changed today shows without signing out. Offline, the
 * last list stays in force.
 */
export function useRefreshCapabilities() {
  const { user } = useAuth();
  const id = user?.id;
  useEffect(() => {
    if (id == null || !navigator.onLine) return;
    let cancelled = false;
    api
      .get<{ capabilities: Capability[]; maxDiscountPct: number | null; role: Role; branchId: number | null }>('/api/auth/me')
      .then((me) => {
        const current = JSON.parse(localStorage.getItem('bookshop_user') ?? 'null') as AuthUser | null;
        if (cancelled || !me || !current || current.id !== id) return;
        const changed =
          JSON.stringify(current.capabilities ?? null) !== JSON.stringify(me.capabilities) ||
          current.maxDiscountPct !== me.maxDiscountPct ||
          current.role !== me.role ||
          current.branchId !== me.branchId;
        if (changed) {
          setAuthUser({ ...current, capabilities: me.capabilities, maxDiscountPct: me.maxDiscountPct, role: me.role, branchId: me.branchId });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id]);
}
