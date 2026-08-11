import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------- row actions */

/** Icon-only action for table rows; the label stays available as a tooltip and to screen readers. */
export const RowAction = ({
  icon,
  label,
  to,
  onClick,
  tone = 'default',
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  to?: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) => {
  const cls = cn(
    'inline-grid h-8 w-8 place-items-center rounded-lg transition-colors',
    tone === 'danger' ? 'text-[#9b2626] hover:bg-[#9b2626]/10' : 'text-primary hover:bg-primary/10',
    disabled && 'opacity-40 pointer-events-none',
  );
  if (to) {
    return (
      <Link to={to} title={label} aria-label={label} className={cls}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={cls}>
      {icon}
    </button>
  );
};

/** Right-aligned container for a row's actions. */
export const RowActions = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-end gap-1">{children}</div>
);

/* ------------------------------------------------------------------ layout */

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={cn('rounded-xl border border-border bg-card shadow-sm', className)}>{children}</div>
);

export const PageCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Card className={cn('p-5', className)}>{children}</Card>
);

export const PageHeader = ({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
    <div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
  </div>
);

export const SectionTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    {right}
  </div>
);

/* --------------------------------------------------------------------- KPI */

type KpiTone = 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'neutral';
const kpiTone: Record<KpiTone, { chipBg: string; chipFg: string }> = {
  green: { chipBg: 'bg-[#e8f5ee]', chipFg: 'text-[#1a7a4a]' },
  red: { chipBg: 'bg-[#fdf0f0]', chipFg: 'text-[#9b2626]' },
  blue: { chipBg: 'bg-[#eaf0f8]', chipFg: 'text-[#1a4a7a]' },
  amber: { chipBg: 'bg-[#fdf3e0]', chipFg: 'text-[#8a5a00]' },
  purple: { chipBg: 'bg-[#f0ebf8]', chipFg: 'text-[#4a2a7a]' },
  neutral: { chipBg: 'bg-muted', chipFg: 'text-muted-foreground' },
};

export const KpiCard = ({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  filled = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: KpiTone;
  icon?: ReactNode;
  filled?: boolean;
}) => {
  if (filled) {
    return (
      <div className="rounded-xl bg-primary text-primary-foreground p-4 flex flex-col justify-between min-h-[104px]">
        <div className="flex items-start justify-between">
          <span className="text-[11px] uppercase tracking-wide font-semibold opacity-80">{label}</span>
          {icon && <div className="w-8 h-8 rounded-lg grid place-items-center bg-white/15">{icon}</div>}
        </div>
        <div>
          <div className="text-2xl font-semibold font-mono mt-2 leading-tight break-words">{value}</div>
          {sub && <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>}
        </div>
      </div>
    );
  }
  const t = kpiTone[tone];
  return (
    <Card className="p-4 flex flex-col justify-between min-h-[104px]">
      <div className="flex items-start justify-between">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</span>
        {icon && <div className={cn('w-8 h-8 rounded-lg grid place-items-center', t.chipBg, t.chipFg)}>{icon}</div>}
      </div>
      <div>
        <div className="text-2xl font-semibold font-mono mt-2 text-foreground leading-tight break-words">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------ badges */

type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple';
const badgeMap: Record<BadgeTone, string> = {
  green: 'bg-[#e8f5ee] text-[#1a7a4a]',
  red: 'bg-[#fdf0f0] text-[#9b2626]',
  amber: 'bg-[#fdf3e0] text-[#8a5a00]',
  blue: 'bg-[#eaf0f8] text-[#1a4a7a]',
  purple: 'bg-[#f0ebf8] text-[#4a2a7a]',
  gray: 'bg-muted text-muted-foreground',
};
export const Pill = ({ children, tone = 'gray' }: { children: ReactNode; tone?: BadgeTone }) => (
  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap', badgeMap[tone])}>
    {children}
  </span>
);

/* ------------------------------------------------------------- plain table */

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse">{children}</table>
  </div>
);

export const Th = ({ children, num = false }: { children: ReactNode; num?: boolean }) => (
  <th
    className={cn(
      'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 border-b border-border whitespace-nowrap',
      num ? 'text-right' : 'text-left',
    )}
  >
    {children}
  </th>
);

export const Td = ({ children, num = false, className = '' }: { children: ReactNode; num?: boolean; className?: string }) => (
  <td className={cn('py-2.5 px-3 text-sm border-b border-border/70', num && 'text-right font-mono', className)}>{children}</td>
);

/* ------------------------------------------------------------------- forms */

export const FormField = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div>
    <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const fieldCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

export const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cn(fieldCls, className)} />
);

export const Select = ({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cn(fieldCls, 'appearance-none pr-8', className)} />
);

export const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={cn(fieldCls, className)} />
);

export const Button = ({
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}) => {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-border bg-background hover:bg-muted text-foreground',
    danger: 'bg-[#9b2626] text-white hover:bg-[#9b2626]/90',
    ghost: 'hover:bg-muted text-foreground',
  };
  return (
    <button {...rest} disabled={disabled || loading} className={cn(base, sizes[size], variants[variant], className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
};

/* --------------------------------------------------------------- feedback */

export const Spinner = ({ className = '' }: { className?: string }) => (
  <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />
);

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
    <Spinner /> {label}
  </div>
);

export const Alert = ({ tone = 'amber', children }: { tone?: 'amber' | 'red' | 'green' | 'blue'; children: ReactNode }) => {
  const map = {
    amber: 'bg-[#fdf3e0] text-[#8a5a00] border-[#8a5a00]/20',
    red: 'bg-[#fdf0f0] text-[#9b2626] border-[#9b2626]/20',
    green: 'bg-[#e8f5ee] text-[#1a7a4a] border-[#1a7a4a]/20',
    blue: 'bg-[#eaf0f8] text-[#1a4a7a] border-[#1a4a7a]/20',
  };
  return <div className={cn('rounded-lg border px-4 py-3 text-sm', map[tone])}>{children}</div>;
};

export const EmptyState = ({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
    {icon && <div className="text-muted-foreground/50">{icon}</div>}
    <p className="text-sm font-medium text-foreground">{title}</p>
    {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
  </div>
);

export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn('relative w-full rounded-xl border border-border bg-card shadow-xl', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
};
