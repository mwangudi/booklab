import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { money, num } from '../../lib/format';
import { BranchSelect } from '../../components/BranchSelect';
import type { Employee, User } from '../../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader, SectionTitle } from '../../components/ui';
import { Select2 } from '../../components/Select2';

const TYPES = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'INTERN', label: 'Intern' },
];

export default function EmployeeUpsertPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: employees, loading } = useApi<Employee[]>(isEdit ? '/api/payroll/employees?archived=all' : null);
  const { data: users } = useApi<User[]>('/api/auth/users');
  const existing = useMemo(() => employees?.find((e) => String(e.id) === id) ?? null, [employees, id]);

  const [f, setF] = useState({
    staffNo: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    employmentType: 'PERMANENT',
    branchId: null as number | null,
    userId: null as number | null,
    nationalId: '',
    kraPin: '',
    nssfNo: '',
    shifNo: '',
    phone: '',
    email: '',
    basicSalary: '',
    houseAllowance: '',
    transportAllowance: '',
    otherAllowance: '',
    otherDeductions: '',
    bankName: '',
    bankAccount: '',
    hiredAt: '',
    active: true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setF({
      staffNo: existing.staffNo,
      firstName: existing.firstName,
      lastName: existing.lastName,
      jobTitle: existing.jobTitle ?? '',
      employmentType: existing.employmentType,
      branchId: existing.branchId,
      userId: existing.userId,
      nationalId: existing.nationalId ?? '',
      kraPin: existing.kraPin ?? '',
      nssfNo: existing.nssfNo ?? '',
      shifNo: existing.shifNo ?? '',
      phone: existing.phone ?? '',
      email: existing.email ?? '',
      basicSalary: String(num(existing.basicSalary)),
      houseAllowance: String(num(existing.houseAllowance)),
      transportAllowance: String(num(existing.transportAllowance)),
      otherAllowance: String(num(existing.otherAllowance)),
      otherDeductions: String(num(existing.otherDeductions)),
      bankName: existing.bankName ?? '',
      bankAccount: existing.bankAccount ?? '',
      hiredAt: existing.hiredAt ? existing.hiredAt.slice(0, 10) : '',
      active: existing.active,
    });
  }, [existing]);

  const gross = num(f.basicSalary) + num(f.houseAllowance) + num(f.transportAllowance) + num(f.otherAllowance);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.staffNo.trim()) return setError('Staff number is required.');
    if (!f.firstName.trim() || !f.lastName.trim()) return setError('First and last name are required.');

    const payload = {
      staffNo: f.staffNo.trim(),
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      jobTitle: f.jobTitle.trim() || null,
      employmentType: f.employmentType,
      branchId: f.branchId,
      userId: f.userId,
      nationalId: f.nationalId.trim() || null,
      kraPin: f.kraPin.trim() || null,
      nssfNo: f.nssfNo.trim() || null,
      shifNo: f.shifNo.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      basicSalary: num(f.basicSalary),
      houseAllowance: num(f.houseAllowance),
      transportAllowance: num(f.transportAllowance),
      otherAllowance: num(f.otherAllowance),
      otherDeductions: num(f.otherDeductions),
      bankName: f.bankName.trim() || null,
      bankAccount: f.bankAccount.trim() || null,
      hiredAt: f.hiredAt || null,
      active: f.active,
    };

    setSaving(true);
    try {
      if (isEdit) await api.patch(`/api/payroll/employees/${id}`, payload);
      else await api.post('/api/payroll/employees', payload);
      navigate('/people/employees');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the employee.');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  const loginOptions = [
    { value: '', label: 'No system login' },
    ...(users ?? []).map((u) => ({ value: String(u.id), label: `${u.name} — ${u.email}` })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit employee' : 'New employee'}
        subtitle="Personal details, statutory numbers and monthly pay."
        right={
          <Button variant="outline" onClick={() => navigate('/people/employees')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <form onSubmit={submit} className="space-y-5">
        {error && <Alert tone="red">{error}</Alert>}

        <Card className="p-4 space-y-4">
          <SectionTitle>Person</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Staff number">
              <Input value={f.staffNo} onChange={(e) => set('staffNo', e.target.value)} placeholder="EMP-001" autoFocus />
            </FormField>
            <FormField label="Job title">
              <Input value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Cashier" />
            </FormField>
            <FormField label="First name">
              <Input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </FormField>
            <FormField label="Last name">
              <Input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07XX XXX XXX" />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </FormField>
            <FormField label="Branch">
              <BranchSelect value={f.branchId} onChange={(v) => set('branchId', v)} includeAll />
            </FormField>
            <FormField label="Employment type">
              <Select2 value={f.employmentType} onChange={(v) => set('employmentType', v)} options={TYPES} searchable={false} />
            </FormField>
            <FormField label="Date hired">
              <Input type="date" value={f.hiredAt} onChange={(e) => set('hiredAt', e.target.value)} />
            </FormField>
            <FormField label="System login" hint="Optional — staff who never sign in can still be paid.">
              <Select2
                value={f.userId == null ? '' : String(f.userId)}
                onChange={(v) => set('userId', v ? Number(v) : null)}
                options={loginOptions}
              />
            </FormField>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <SectionTitle>Statutory numbers</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="National ID">
              <Input value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="KRA PIN">
              <Input value={f.kraPin} onChange={(e) => set('kraPin', e.target.value)} className="font-mono" placeholder="A000000000X" />
            </FormField>
            <FormField label="NSSF number">
              <Input value={f.nssfNo} onChange={(e) => set('nssfNo', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="SHIF number">
              <Input value={f.shifNo} onChange={(e) => set('shifNo', e.target.value)} className="font-mono" />
            </FormField>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <SectionTitle right={<span className="text-sm font-semibold text-foreground">Gross: {money(gross)}</span>}>
            Monthly pay
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <FormField label="Basic salary (KES)">
              <Input type="number" min="0" step="0.01" value={f.basicSalary} onChange={(e) => set('basicSalary', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="House allowance">
              <Input type="number" min="0" step="0.01" value={f.houseAllowance} onChange={(e) => set('houseAllowance', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="Transport allowance">
              <Input type="number" min="0" step="0.01" value={f.transportAllowance} onChange={(e) => set('transportAllowance', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="Other allowance">
              <Input type="number" min="0" step="0.01" value={f.otherAllowance} onChange={(e) => set('otherAllowance', e.target.value)} className="font-mono" />
            </FormField>
            <FormField label="Other deductions" hint="e.g. salary advance or staff loan repayment.">
              <Input type="number" min="0" step="0.01" value={f.otherDeductions} onChange={(e) => set('otherDeductions', e.target.value)} className="font-mono" />
            </FormField>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Bank name">
              <Input value={f.bankName} onChange={(e) => set('bankName', e.target.value)} />
            </FormField>
            <FormField label="Bank account">
              <Input value={f.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} className="font-mono" />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 rounded border-border" />
            Include in payroll runs
          </label>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/people/employees')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create employee'}
          </Button>
        </div>
      </form>
    </div>
  );
}
