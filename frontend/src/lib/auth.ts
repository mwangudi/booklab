import { useEffect, useState } from 'react';
import { AUTH_EVENT, setToken } from './api';

export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  branchId: number | null;
  /** Optional display name of the assigned branch. */
  branchName?: string | null;
}

const KEY = 'bookshop_user';

const read = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const setAuthUser = (u: AuthUser | null, token?: string | null) => {
  if (u) localStorage.setItem(KEY, JSON.stringify(u));
  else localStorage.removeItem(KEY);
  if (token !== undefined) setToken(token);
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export const logout = () => setAuthUser(null, null);

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(read);

  useEffect(() => {
    const refresh = () => setUser(read());
    window.addEventListener('storage', refresh);
    window.addEventListener(AUTH_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(AUTH_EVENT, refresh);
    };
  }, []);

  return {
    user,
    isAuthenticated: user !== null,
    isAdmin: user?.role === 'ADMIN',
    isManager: user?.role === 'MANAGER',
    /** Admin or Manager — the roles allowed to manage catalogue/stock/expenses. */
    canManage: user?.role === 'ADMIN' || user?.role === 'MANAGER',
    branchId: user?.branchId ?? null,
    branchName: user?.branchName ?? null,
    /** Returns admin-chosen branchId or, for non-admins, their fixed branchId. */
    effectiveBranchId(adminChoice?: number | null): number | null {
      if (!user) return null;
      if (user.role === 'ADMIN') return adminChoice ?? null;
      return user.branchId;
    },
  };
};
