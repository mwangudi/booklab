import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Printer,
  ReceiptText,
  RefreshCw,
  Image as ImageIcon,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Users,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react';
import { logout, useAuth, type Role } from '../lib/auth';
import { cn } from '../lib/utils';
import { ConnectionBar } from './ConnectionBar';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
  end?: boolean;
}
interface NavGroup {
  key: string;
  heading: string;
  icon: ReactNode;
  items: NavItem[];
}

const ic = 'h-[18px] w-[18px] shrink-0';

/** Everyday actions live at the top level so they are always one tap away. */
const QUICK: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className={ic} />, end: true },
  { to: '/pos', label: 'Point of Sale', icon: <ShoppingCart className={ic} /> },
  { to: '/sales', label: 'Sales', icon: <ReceiptText className={ic} /> },
];

/** Everything else is grouped into collapsible sections. */
const GROUPS: NavGroup[] = [
  {
    key: 'stock',
    heading: 'Catalogue & Stock',
    icon: <Boxes className={ic} />,
    items: [
      { to: '/products', label: 'Products', icon: <BookOpen className={ic} /> },
      { to: '/stock', label: 'Stock levels', icon: <Boxes className={ic} />, end: true },
      { to: '/stock/take', label: 'Stock take', icon: <ClipboardList className={ic} /> },
      { to: '/stock/movements', label: 'Stock history', icon: <History className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/expenses', label: 'Expenses', icon: <Wallet className={ic} />, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    key: 'trade',
    heading: 'Customers & Invoicing',
    icon: <FileText className={ic} />,
    items: [
      { to: '/invoices', label: 'Invoices', icon: <FileText className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/customers', label: 'Customers', icon: <Users className={ic} />, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    key: 'supply',
    heading: 'Suppliers & Purchasing',
    icon: <Truck className={ic} />,
    items: [
      { to: '/goods-receipts', label: 'Goods received', icon: <Truck className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/suppliers', label: 'Suppliers', icon: <Building2 className={ic} />, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    key: 'people',
    heading: 'People & Payroll',
    icon: <Users className={ic} />,
    items: [
      { to: '/people/employees', label: 'Employees', icon: <Users className={ic} />, roles: ['ADMIN'] },
      { to: '/payroll', label: 'Payroll runs', icon: <Wallet className={ic} />, roles: ['ADMIN'] },
      { to: '/settings/payroll', label: 'Payroll settings', icon: <SlidersHorizontal className={ic} />, roles: ['ADMIN'] },
    ],
  },
  {
    key: 'admin',
    heading: 'Administration',
    icon: <Building2 className={ic} />,
    items: [
      { to: '/branches', label: 'Branches', icon: <Building2 className={ic} />, roles: ['ADMIN'] },
      { to: '/settings/users', label: 'Users', icon: <Users className={ic} />, roles: ['ADMIN'] },
      { to: '/settings/audit', label: 'Audit log', icon: <ShieldCheck className={ic} />, roles: ['ADMIN'] },
      { to: '/settings/branch-sync', label: 'Branch sync', icon: <RefreshCw className={ic} />, roles: ['ADMIN'] },
      { to: '/settings/login-screen', label: 'Login screen', icon: <ImageIcon className={ic} />, roles: ['ADMIN'] },
      // Deliberately open to every role: receipt settings live on the device, so
      // each till has to be able to set up its own printer.
      { to: '/settings/receipt', label: 'Receipt & printer', icon: <Printer className={ic} /> },
    ],
  },
  // Reports sit last: they are read at the end of a day, not worked through.
  {
    key: 'reports',
    heading: 'Reports',
    icon: <BarChart3 className={ic} />,
    items: [
      { to: '/reports/zreport', label: 'Daily Z-report', icon: <ClipboardList className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/reports/pnl', label: 'Profit & Loss', icon: <BarChart3 className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/reports/sales', label: 'Sales report', icon: <LineChart className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/reports/stock', label: 'Stock report', icon: <Warehouse className={ic} />, roles: ['ADMIN', 'MANAGER'] },
      { to: '/reports/low-stock', label: 'Re-order report', icon: <Package className={ic} />, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
];

const OPEN_KEY = 'booklab_nav_open';

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const isItemActive = (pathname: string, it: NavItem) =>
  it.end ? pathname === it.to : pathname === it.to || pathname.startsWith(`${it.to}/`);

const linkClass = (isActive: boolean, nested = false) =>
  cn(
    'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
    // Comfortable touch targets on phones, tighter on desktop.
    nested ? 'py-2.5 sm:py-2 pl-9 pr-3' : 'px-3 py-2.5 sm:py-2',
    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

function CollapsibleGroup({
  group,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const hasActive = group.items.some((it) => isItemActive(pathname, it));
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 sm:py-2 text-sm font-medium transition-colors',
          hasActive && !open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {group.icon}
        <span className="flex-1 text-left">{group.heading}</span>
        {/* When collapsed, a dot shows the active page is hiding inside. */}
        {hasActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <div className={cn('grid transition-all duration-200 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 border-l border-border ml-4">
            {group.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={onNavigate}
                className={({ isActive }) => linkClass(isActive, true)}
              >
                {it.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const { pathname } = useLocation();

  const quick = useMemo(() => QUICK.filter((it) => !it.roles || it.roles.includes(role)), [role]);
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.includes(role)) })).filter((g) => g.items.length > 0),
    [role],
  );

  // Remember which sections the user left open, and always reveal the active page.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved) return JSON.parse(saved) as Record<string, boolean>;
    } catch {
      /* fall through to defaults */
    }
    return { stock: true, reports: true, admin: false };
  });

  useEffect(() => {
    const owner = groups.find((g) => g.items.some((it) => isItemActive(pathname, it)));
    if (owner) setOpen((p) => (p[owner.key] ? p : { ...p, [owner.key]: true }));
  }, [pathname, groups]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open));
    } catch {
      /* storage unavailable — not critical */
    }
  }, [open]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0">
        <img src="/logo-print.png" alt="" className="h-9 w-auto shrink-0 object-contain" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-foreground">Booklab Bookshop</div>
          <div className="text-[10px] text-muted-foreground">For Quality, For You</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {quick.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate} className={({ isActive }) => linkClass(isActive)}>
              {it.icon}
              {it.label}
            </NavLink>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border space-y-1">
          {groups.map((g) => (
            <CollapsibleGroup
              key={g.key}
              group={g}
              pathname={pathname}
              open={!!open[g.key]}
              onToggle={() => setOpen((p) => ({ ...p, [g.key]: !p[g.key] }))}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // While the drawer is open, trap scrolling and allow Escape to dismiss it.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (!user) return null;

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const scopeLabel = user.role === 'ADMIN' ? 'All branches' : user.branchName ?? 'Unassigned branch';

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 border-r border-border bg-card">
        <SidebarContent role={user.role} />
      </aside>

      {/* Mobile drawer */}
      <div className={cn('lg:hidden fixed inset-0 z-50', mobileOpen ? '' : 'pointer-events-none')}>
        <div
          className={cn('absolute inset-0 bg-black/50 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-card border-r border-border shadow-xl transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent role={user.role} onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 border-b border-border bg-card/80 backdrop-blur px-3 sm:px-6 safe-top">
          <button
            className="lg:hidden grid h-10 w-10 -ml-1 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <Package className="h-4 w-4 shrink-0" />
            <span className="font-medium text-foreground truncate">{scopeLabel}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium text-foreground">{user.name}</span>
              <span className="text-[11px] text-muted-foreground capitalize">{user.role.toLowerCase()}</span>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {initials(user.name)}
            </div>
            <button
              onClick={onLogout}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* pb-24 leaves room for the mobile bottom bar */}
        <main key={location.pathname} className="p-3 sm:p-6 pb-24 lg:pb-6">
          <ConnectionBar />
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom bar — the three things staff use all day, plus the full menu. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {QUICK.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {it.icon}
              <span className="truncate max-w-full px-1">{it.label === 'Point of Sale' ? 'Sell' : it.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className={ic} />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
