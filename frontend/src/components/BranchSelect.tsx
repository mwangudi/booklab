import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import type { Branch } from '../types';
import { Select2, type Select2Option } from './Select2';

export function useBranches() {
  return useApi<Branch[]>('/api/branches');
}

/**
 * Branch dropdown. Admins can pick any branch (and optionally "All branches");
 * for non-admins the backend only returns their own branch, so it is fixed.
 */
export function BranchSelect({
  value,
  onChange,
  includeAll = false,
  allLabel = 'All branches',
  className,
  disabled,
}: {
  value: number | null;
  onChange: (branchId: number | null) => void;
  includeAll?: boolean;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { isAdmin } = useAuth();
  const { data: branches } = useBranches();
  const list = branches ?? [];
  const options: Select2Option[] = [
    ...(includeAll ? [{ value: '', label: allLabel }] : []),
    ...list.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  return (
    <Select2
      className={className}
      value={value == null ? '' : String(value)}
      disabled={disabled || (!isAdmin && list.length <= 1)}
      options={options}
      onChange={(v) => onChange(v ? Number(v) : null)}
      placeholder={includeAll ? allLabel : 'Select branch…'}
    />
  );
}
