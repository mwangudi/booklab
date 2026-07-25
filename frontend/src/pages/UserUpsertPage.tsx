import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { ROLES, titleCase, type Role } from '../lib/categories';
import { BranchSelect } from '../components/BranchSelect';
import type { User } from '../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader } from '../components/ui';
import { Select2 } from '../components/Select2';

export default function UserUpsertPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: users, loading } = useApi<User[]>(isEdit ? '/api/auth/users' : null);
  const existing = useMemo(() => users?.find((u) => String(u.id) === id) ?? null, [users, id]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('CASHIER');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setEmail(existing.email);
      setRole(existing.role);
      setBranchId(existing.branchId);
      setActive(existing.active !== false);
    }
  }, [existing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!isEdit && !email.trim()) return setError('Email is required.');
    if (!isEdit && password.length < 6) return setError('Password must be at least 6 characters.');
    if (isEdit && password && password.length < 6) return setError('Password must be at least 6 characters.');

    setSaving(true);
    try {
      if (isEdit) {
        const payload: Record<string, unknown> = { name: name.trim(), role, branchId, active };
        if (password) payload.password = password;
        await api.patch(`/api/auth/users/${id}`, payload);
      } else {
        await api.post('/api/auth/users', { name: name.trim(), email: email.trim(), password, role, branchId });
      }
      navigate('/settings/users');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the user.');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit user' : 'New user'}
        subtitle="Staff account and access level."
        right={
          <Button variant="outline" onClick={() => navigate('/settings/users')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <Card className="p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Full name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
            </FormField>
            <FormField label="Email *" hint={isEdit ? 'Email cannot be changed.' : undefined}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@bookshop.co.ke" disabled={isEdit} />
            </FormField>
            <FormField label="Role *">
              <Select2
                value={role}
                onChange={(v) => setRole(v as Role)}
                options={ROLES.map((r) => ({ value: r, label: titleCase(r) }))}
                searchable={false}
              />
            </FormField>
            <FormField label="Branch" hint="Leave unset for administrators / head office.">
              <BranchSelect value={branchId} onChange={setBranchId} includeAll allLabel="No branch (HQ)" />
            </FormField>
            <FormField label={isEdit ? 'New password' : 'Password *'} hint={isEdit ? 'Leave blank to keep current password.' : 'At least 6 characters.'}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </FormField>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />
              Account is active
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate('/settings/users')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
