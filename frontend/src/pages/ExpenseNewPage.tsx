import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BranchSelect } from '../components/BranchSelect';
import { EXPENSE_CATEGORIES, titleCase, type ExpenseCategory } from '../lib/categories';
import { today } from '../lib/format';
import { Alert, Button, Card, FormField, Input, PageHeader, Textarea } from '../components/ui';
import { Select2 } from '../components/Select2';

export default function ExpenseNewPage() {
  const { isAdmin, branchId: myBranch } = useAuth();
  const navigate = useNavigate();

  const [branchId, setBranchId] = useState<number | null>(myBranch);
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incurredAt, setIncurredAt] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Enter an amount greater than zero.');

    setSaving(true);
    try {
      await api.post('/api/expenses', {
        branchId: isAdmin ? branchId : undefined,
        category,
        description: description.trim() || undefined,
        amount: amt,
        incurredAt: incurredAt ? new Date(incurredAt).toISOString() : undefined,
      });
      navigate('/expenses');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Record expense"
        subtitle="Log an operating cost against a branch or head office."
        right={
          <Button variant="outline" onClick={() => navigate('/expenses')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <Card className="p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isAdmin && (
              <FormField label="Branch" hint="Leave on a branch, or pick none for head-office costs.">
                <BranchSelect value={branchId} onChange={setBranchId} includeAll allLabel="HQ / unassigned" />
              </FormField>
            )}
            <FormField label="Category *">
              <Select2
                value={category}
                onChange={(v) => setCategory(v as ExpenseCategory)}
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))}
              />
            </FormField>
            <FormField label="Amount (KES) *">
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="font-mono" autoFocus />
            </FormField>
            <FormField label="Date incurred">
              <Input type="date" value={incurredAt} onChange={(e) => setIncurredAt(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this expense for?" />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate('/expenses')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> Save expense
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
