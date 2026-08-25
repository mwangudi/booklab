import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Plus, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { dateShort, fmt, money, num, today } from '../../lib/format';
import { PAYMENT_CHANNELS, titleCase } from '../../lib/categories';
import { downloadCsv } from '../../lib/reportExport';
import { printStatement } from '../../lib/documents';
import type { Invoice, Statement } from '../../types';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, Modal, PageHeader, Pill, SectionTitle, Table, Td, Th } from '../../components/ui';
import { Select2 } from '../../components/Select2';

const startOfYear = () => `${new Date().getFullYear()}-01-01`;

export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    return `/api/invoices/customers/${id}/statement?${p.toString()}`;
  }, [id, from, to]);

  const { data, loading, refresh } = useApi<Statement>(query, [query]);
  const { data: invoices } = useApi<Invoice[]>(`/api/invoices?customerId=${id}`, [id]);

  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', paidAt: today(), method: 'BANK_TRANSFER', reference: '', invoiceId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/invoices/payments', {
        customerId: Number(id),
        invoiceId: pay.invoiceId ? Number(pay.invoiceId) : null,
        amount: Number(pay.amount),
        paidAt: pay.paidAt,
        method: pay.method,
        reference: pay.reference.trim() || null,
      });
      setPayOpen(false);
      setPay({ amount: '', paidAt: today(), method: 'BANK_TRANSFER', reference: '', invoiceId: '' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the payment.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) return <Loading />;

  const exportCsv = () =>
    downloadCsv(
      `statement-${data.customer.name.replace(/\s+/g, '-').toLowerCase()}.csv`,
      ['Date', 'Transaction', 'Amount', 'Balance'],
      [
        [dateShort(data.period.from), 'Balance forward', '', num(data.openingBalance)],
        ...data.rows.map((r) => [dateShort(r.date), r.label, num(r.amount), num(r.balance)]),
        ['', 'Closing balance', '', num(data.closingBalance)],
      ],
    );

  const unpaid = (invoices ?? []).filter((i) => i.status === 'ISSUED' || i.status === 'DELIVERED');

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.customer.name}
        subtitle="Statement of account"
        right={
          <>
            <Link to="/customers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" /> Customers
              </Button>
            </Link>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => printStatement(data)}>
              <FileText className="h-4 w-4" /> Print statement
            </Button>
            <Button onClick={() => setPayOpen(true)}>
              <Plus className="h-4 w-4" /> Record payment
            </Button>
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Amount due" value={money(data.amountDue)} tone={data.amountDue > 0 ? 'red' : 'green'} filled icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Invoiced in period" value={money(data.totals.invoiced)} tone="blue" />
        <KpiCard label="Received in period" value={money(data.totals.received)} tone="green" />
        <KpiCard label="Balance forward" value={money(data.openingBalance)} tone="purple" />
      </div>

      <Card className="p-4">
        <SectionTitle>Ageing</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th num>Current</Th>
              <Th num>1–30 days</Th>
              <Th num>31–60 days</Th>
              <Th num>61–90 days</Th>
              <Th num>Over 90 days</Th>
              <Th num>Amount due</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td num>{money(data.ageing.current)}</Td>
              <Td num>{money(data.ageing.d1_30)}</Td>
              <Td num>{money(data.ageing.d31_60)}</Td>
              <Td num>{money(data.ageing.d61_90)}</Td>
              <Td num>
                <span className={data.ageing.over90 > 0 ? 'text-[#9b2626] font-semibold' : ''}>{money(data.ageing.over90)}</span>
              </Td>
              <Td num>
                <span className="font-semibold">{money(data.amountDue)}</span>
              </Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card className="p-4">
        <SectionTitle>Transactions</SectionTitle>
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Transaction</Th>
                <Th num>Amount</Th>
                <Th num>Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>{dateShort(data.period.from)}</Td>
                <Td>Balance forward</Td>
                <Td num>—</Td>
                <Td num>{money(data.openingBalance)}</Td>
              </tr>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <Td>{dateShort(r.date)}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Pill tone={r.kind === 'PAYMENT' ? 'green' : 'blue'}>{r.kind === 'PAYMENT' ? 'PMT' : 'INV'}</Pill>
                      {r.label}
                    </span>
                  </Td>
                  <Td num>
                    <span className={r.amount < 0 ? 'text-[#1a7a4a] font-mono' : 'font-mono'}>
                      {money(Math.abs(r.amount))}
                      {r.amount < 0 ? ' CR' : ''}
                    </span>
                  </Td>
                  <Td num>{money(r.balance)}</Td>
                </tr>
              ))}
              <tr className="bg-muted/40">
                <Td> </Td>
                <Td>
                  <span className="font-semibold">Closing balance</span>
                </Td>
                <Td num> </Td>
                <Td num>
                  <span className="font-semibold font-mono">{money(data.closingBalance)}</span>
                </Td>
              </tr>
            </tbody>
          </Table>
        </div>
        {data.rows.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No invoices or payments in this period.</p>
        )}
      </Card>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Record payment from ${data.customer.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={record} loading={busy} disabled={!pay.amount || Number(pay.amount) <= 0}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Amount (KES) *">
              <Input type="number" min="0" step="0.01" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} className="font-mono" autoFocus />
            </FormField>
            <FormField label="Date received">
              <Input type="date" value={pay.paidAt} onChange={(e) => setPay((p) => ({ ...p, paidAt: e.target.value }))} />
            </FormField>
            <FormField label="Method">
              <Select2
                value={pay.method}
                onChange={(v) => setPay((p) => ({ ...p, method: v }))}
                options={PAYMENT_CHANNELS.map((m) => ({ value: m, label: titleCase(m.replace('_', ' ')) }))}
                searchable={false}
              />
            </FormField>
            <FormField label="Reference" hint="Shown on the statement, e.g. TRANSFER or an M-Pesa code.">
              <Input value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Against invoice" hint="Optional — settles that invoice once fully paid.">
            <Select2
              value={pay.invoiceId}
              onChange={(v) => setPay((p) => ({ ...p, invoiceId: v }))}
              options={[
                { value: '', label: 'General payment on account' },
                ...unpaid.map((i) => ({ value: String(i.id), label: `${i.number} — ${money(i.total)}` })),
              ]}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Outstanding invoices: {fmt(unpaid.length)}
          </p>
        </div>
      </Modal>
    </div>
  );
}
