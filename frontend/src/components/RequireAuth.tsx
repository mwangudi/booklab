import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { userCan, type Capability } from '../lib/permissions';
import { Card } from './ui';

/** Gate that redirects to /login when there is no authenticated user. */
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Renders children only for ADMIN users, otherwise a friendly forbidden card. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (isAdmin) return <>{children}</>;
  return (
    <Card className="p-10 flex flex-col items-center text-center gap-2">
      <ShieldAlert className="h-8 w-8 text-[#9b2626]" />
      <p className="text-sm font-semibold text-foreground">Administrator access required</p>
      <p className="text-xs text-muted-foreground max-w-sm">
        You don’t have permission to view this page. Contact an administrator if you need access.
      </p>
    </Card>
  );
}

/** Renders children only for someone holding at least one of the capabilities. */
export function CapabilityOnly({ any, children }: { any: Capability[]; children: ReactNode }) {
  const { user } = useAuth();
  if (userCan(user, ...any)) return <>{children}</>;
  return (
    <Card className="p-10 flex flex-col items-center text-center gap-2">
      <ShieldAlert className="h-8 w-8 text-[#9b2626]" />
      <p className="text-sm font-semibold text-foreground">You don’t have access to this page</p>
      <p className="text-xs text-muted-foreground max-w-sm">An administrator can give it to you under Administration → Permissions.</p>
    </Card>
  );
}

/** Renders children only for ADMIN or MANAGER users. */
export function ManagerOnly({ children }: { children: ReactNode }) {
  const { canManage } = useAuth();
  if (canManage) return <>{children}</>;
  return (
    <Card className="p-10 flex flex-col items-center text-center gap-2">
      <ShieldAlert className="h-8 w-8 text-[#9b2626]" />
      <p className="text-sm font-semibold text-foreground">Manager access required</p>
      <p className="text-xs text-muted-foreground max-w-sm">This page is limited to managers and administrators.</p>
    </Card>
  );
}
