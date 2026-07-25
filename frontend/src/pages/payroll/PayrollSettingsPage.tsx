import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { money } from '../../lib/format';
import { computePayPreview } from '../../lib/payrollPreview';
import type { PayeBand, PayrollSettings } from '../../types';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader, SectionTitle, Table, Td, Th } from '../../components/ui';

const pctStr = (r: number) => String(Math.round(r * 10000) / 100);
const toRate = (s: string) => (Number(s) || 0) / 100;

export default function PayrollSettingsPage() {
  const { data, loading, refresh } = useApi<PayrollSettings>('/api/payroll/settings');
  const [bands, setBands] = useState<PayeBand[]>([]);
  const [f, setF] = useState({
    personalRelief: '',
    insuranceRelief: '',
    nssfTier1Limit: '',
    nssfTier2Limit: '',
    nssfRate: '',
    shifRate: '',
    shifMinimum: '',
    housingLevyRate: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sample, setSample] = useState('50000');

  useEffect(() => {
    if (!data) return;
    setBands(data.payeBands);
    setF({
      personalRelief: String(data.personalRelief),
      insuranceRelief: String(data.insuranceRelief),
      nssfTier1Limit: String(data.nssfTier1Limit),
      nssfTier2Limit: String(data.nssfTier2Limit),
      nssfRate: pctStr(data.nssfRate),
      shifRate: pctStr(data.shifRate),
      shifMinimum: String(data.shifMinimum),
      housingLevyRate: pctStr(data.housingLevyRate),
    });
  }, [data]);

  if (loading || !data) return <Loading />;

  const payload = {
    payeBands: bands,
    personalRelief: Number(f.personalRelief) || 0,
    insuranceRelief: Number(f.insuranceRelief) || 0,
    nssfTier1Limit: Number(f.nssfTier1Limit) || 0,
    nssfTier2Limit: Number(f.nssfTier2Limit) || 0,
    nssfRate: toRate(f.nssfRate),
    shifRate: toRate(f.shifRate),
    shifMinimum: Number(f.shifMinimum) || 0,
    housingLevyRate: toRate(f.housingLevyRate),
  };

  const preview = computePayPreview(Number(sample) || 0, payload);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put('/api/payroll/settings', payload);
      setSaved(true);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the rates.');
    } finally {
      setSaving(false);
    }
  };

  const setBand = (i: number, patch: Partial<PayeBand>) => setBands((p) => p.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payroll settings"
        subtitle="Statutory rates used to calculate every payslip. Update them here when the law changes."
        right={
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" /> Save rates
          </Button>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}
      {saved && <Alert tone="green">Rates saved. Open a draft payroll and press Recalculate to apply them.</Alert>}
      <Alert tone="blue">
        Changing rates never alters payslips that have already been closed — those figures are locked when the payroll is
        closed.
      </Alert>

      <Card className="p-4 space-y-4">
        <SectionTitle
          right={
            <Button size="sm" variant="outline" onClick={() => setBands((p) => [...p, { upTo: null, rate: 0.3 }])}>
              <Plus className="h-3.5 w-3.5" /> Add band
            </Button>
          }
        >
          PAYE bands
        </SectionTitle>
        <p className="text-xs text-muted-foreground">
          Each rate applies only to the slice of taxable pay inside that band. Leave the top band&apos;s ceiling blank for
          &ldquo;and above&rdquo;.
        </p>
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Band</Th>
                <Th num>Up to (KES)</Th>
                <Th num>Rate (%)</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i}>
                  <Td>{i === 0 ? 'First' : i === bands.length - 1 ? 'Above' : `Next`}</Td>
                  <Td num>
                    <Input
                      type="number"
                      min="0"
                      value={b.upTo == null ? '' : String(b.upTo)}
                      placeholder="and above"
                      onChange={(e) => setBand(i, { upTo: e.target.value === '' ? null : Number(e.target.value) })}
                      className="font-mono text-right"
                    />
                  </Td>
                  <Td num>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={pctStr(b.rate)}
                      onChange={(e) => setBand(i, { rate: toRate(e.target.value) })}
                      className="font-mono text-right"
                    />
                  </Td>
                  <Td num>
                    <button
                      onClick={() => setBands((p) => p.filter((_, idx) => idx !== i))}
                      className="text-[#9b2626] hover:underline"
                      aria-label="Remove band"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Personal relief (KES / month)">
            <Input type="number" min="0" value={f.personalRelief} onChange={(e) => set('personalRelief', e.target.value)} className="font-mono" />
          </FormField>
          <FormField label="Insurance relief (KES / month)">
            <Input type="number" min="0" value={f.insuranceRelief} onChange={(e) => set('insuranceRelief', e.target.value)} className="font-mono" />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>NSSF</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormField label="Contribution rate (%)" hint="Matched by the employer.">
            <Input type="number" min="0" max="100" step="0.01" value={f.nssfRate} onChange={(e) => set('nssfRate', e.target.value)} className="font-mono" />
          </FormField>
          <FormField label="Tier I upper limit (KES)">
            <Input type="number" min="0" value={f.nssfTier1Limit} onChange={(e) => set('nssfTier1Limit', e.target.value)} className="font-mono" />
          </FormField>
          <FormField label="Tier II upper limit (KES)">
            <Input type="number" min="0" value={f.nssfTier2Limit} onChange={(e) => set('nssfTier2Limit', e.target.value)} className="font-mono" />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>SHIF &amp; Housing Levy</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormField label="SHIF rate (% of gross)">
            <Input type="number" min="0" max="100" step="0.01" value={f.shifRate} onChange={(e) => set('shifRate', e.target.value)} className="font-mono" />
          </FormField>
          <FormField label="SHIF minimum (KES)">
            <Input type="number" min="0" value={f.shifMinimum} onChange={(e) => set('shifMinimum', e.target.value)} className="font-mono" />
          </FormField>
          <FormField label="Housing levy (% of gross)" hint="Matched by the employer.">
            <Input type="number" min="0" max="100" step="0.01" value={f.housingLevyRate} onChange={(e) => set('housingLevyRate', e.target.value)} className="font-mono" />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>Check your figures</SectionTitle>
        <FormField label="Sample gross pay (KES)" hint="Live preview using the rates above — nothing is saved.">
          <Input type="number" min="0" value={sample} onChange={(e) => setSample(e.target.value)} className="font-mono sm:w-56" />
        </FormField>
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          {[
            ['Gross pay', preview.grossPay],
            ['NSSF', -preview.nssf],
            ['SHIF', -preview.shif],
            ['Housing levy', -preview.housingLevy],
            ['Taxable pay', preview.taxablePay],
            ['PAYE', -preview.paye],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">{label as string}</span>
              <span className="font-mono">{money(Math.abs(value as number))}</span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 bg-muted/40">
            <span className="font-semibold text-foreground">Net pay</span>
            <span className="font-mono font-semibold">{money(preview.netPay)}</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" /> Save rates
        </Button>
      </div>
    </div>
  );
}
