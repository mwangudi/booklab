import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Branch } from '../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader } from '../components/ui';

export default function BranchUpsertPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: branches, loading } = useApi<Branch[]>(isEdit ? '/api/branches' : null);
  const existing = useMemo(() => branches?.find((b) => String(b.id) === id) ?? null, [branches, id]);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setLocation(existing.location);
    }
  }, [existing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !location.trim()) return setError('Name and location are required.');
    setSaving(true);
    try {
      const payload = { name: name.trim(), location: location.trim() };
      if (isEdit) await api.patch(`/api/branches/${id}`, payload);
      else await api.post('/api/branches', payload);
      navigate('/branches');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the branch.');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit branch' : 'New branch'}
        right={
          <Button variant="outline" onClick={() => navigate('/branches')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />
      <Card className="p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Branch name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Westlands" autoFocus />
            </FormField>
            <FormField label="Location *">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Westlands, Nairobi" />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate('/branches')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create branch'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
