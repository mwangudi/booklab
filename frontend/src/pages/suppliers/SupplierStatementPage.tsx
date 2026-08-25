import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Plus, Truck, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { dateShort, fmt, money, num, today } from '../../lib/format';
import { PAYMENT_CHANNELS, titleCase } from '../../lib/categories';
import { downloadCsv } from '../../lib/reportExport';
import { printSupplierStatement } from '../../lib/documents';
import type { GoodsReceipt, SupplierStatement } from '../../types';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, Modal, PageHeader, Pill, SectionTitle, Table, Td, Th } from '../../components/ui';
import { Select2 } from '../../components/Select2';

const startOfYear = () => `${new Date().getFullYear()}-01-01`;

export default function SupplierStatementPage() {
  const { id } = useParams<{ id: string }>();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    return `/api/goods-receipts/suppliers/${id}/statement?${p.toString()}`;
  }, [id, from, to]);

  const { data, loading, refresh } = useApi<SupplierStatement>(query, [query]);
  const { data: receipts } = useApi<GoodsReceipt[]>(`/api/goods-receipts?supplierId=${id}`, [id]);

  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', paidAt: today(), method: 'BANK_TRANSFER', reference: '', receiptId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/goods-receipts/payments', {
        supplierId: Number(id),
        receiptId: pay.receiptId ? Number(pay.receiptId) : null,
        amount: Number(pay.amount),
        paidAt: pay.paidAt,
        method: pay.method,
        reference: pay.reference.trim() || null,
      });
      setPayOpen(false);
      setPay({ amount: '', paidAt: today(), method: 'BANK_TRANSFER', reference: '', receiptId: '' });
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
      `supplier-statement-${data.supplier.name.replace(/\s+/g, '-').toLowerCase()}.csv`,
      ['Date', 'Transaction', 'Amount', 'Balance'],
      [
        [dateShort(data.period.from), 'Balance forward', '', num(data.openingBalance)],
        ...data.rows.map((r) => [dateShort(r.date), r.label, num(r.amount), num(r.balance)]),
        ['', 'Closing balance', '', num(data.closingBalance)],
      ],
    );

  const posted = (receipts ?? []).filter((r) => r.status === 'POSTED');

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.supplier.name}
        subtitle="What we owe this supplier — reconcile against the statement they send us."
        right={
          <>
            <Link to="/suppliers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" /> Suppliers
              </Button>
            </Link>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => printSupplierStatement(data)}>
              <FileText className="h-4 w-4" /> Print
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
        <KpiCard label="Balance owed" value={money(data.amountDue)} tone={data.amountDue > 0 ? 'red' : 'green'} filled icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Billed in period" value={money(data.totals.billed)} tone="blue" />
        <KpiCard label="Paid in period" value={money(data.totals.paid)} tone="green" />
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
              <Th num>Balance</Th>
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
                      <Pill tone={r.kind === 'PAYMENT' ? 'green' : 'blue'}>{r.kind === 'PAYMENT' ? 'PMT' : 'BILL'}</Pill>
                      {r.label}
                    </span>
                  </Td>
                  <Td num>
                    <span className={r.amount < 0 ? 'text-[#1a7a4a] font-mono' : 'font-mono'}>
                      {money(Math.abs(r.amount))}
                      {r.amount < 0 ? ' DR' : ''}
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
        {data.rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No goods received or payments in this period.</p>}
      </Card>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Record payment to ${data.supplier.name}`}
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
            <FormField label="Date paid">
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
            <FormField label="Reference">
              <Input value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} placeholder="e.g. TRANSFER or cheque no." />
            </FormField>
          </div>
          <FormField label="Against goods receipt" hint="Optional — leave blank for a payment on account.">
            <Select2
              value={pay.receiptId}
              onChange={(v) => setPay((p) => ({ ...p, receiptId: v }))}
              options={[
                { value: '', label: 'General payment on account' },
                ...posted.map((r) => ({ value: String(r.id), label: `${r.invoiceNo ?? r.number} — ${money(r.totalCost)}` })),
              ]}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            <Truck className="inline h-3 w-3" /> Posted goods receipts: {fmt(posted.length)}
          </p>
        </div>
      </Modal>
    </div>
  );
}
