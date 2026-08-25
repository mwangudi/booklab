import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Download, Eye, FileText, Plus, Printer, ReceiptText } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { dateTime, fmt, money, num, startOfMonth, today } from '../lib/format';
import { reprintSale } from '../lib/reprint';
import { downloadCsv, downloadPdfReport } from '../lib/reportExport';
import type { Sale } from '../types';
import { BranchSelect } from '../components/BranchSelect';
import { DataTable, type Column } from '../components/DataTable';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, Modal, PageHeader, Pill, RowAction, RowActions, Table, Td, Th } from '../components/ui';

const paymentTone = (m: string) => (m === 'MPESA' ? 'green' : m === 'CARD' ? 'purple' : 'blue');
const isVoid = (s: Sale) => !!s.voidedAt;

export default function SalesPage() {
  const { isAdmin, canManage, user } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [selected, setSelected] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState<number | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (isAdmin && branchId) p.set('branchId', String(branchId));
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    const s = p.toString();
    return `/api/sales${s ? `?${s}` : ''}`;
  }, [isAdmin, branchId, from, to]);

  const { data: sales, loading, refresh } = useApi<Sale[]>(query, [query]);
  const rows = sales ?? [];

  // Voided sales stay visible for the audit trail but never count as revenue.
  const live = rows.filter((r) => !isVoid(r));
  const revenue = live.reduce((s, r) => s + num(r.total), 0);
  const itemsSold = live.reduce((s, r) => s + r.items.reduce((a, i) => a + i.quantity, 0), 0);
  const voidedCount = rows.length - live.length;

  const period = `${from} to ${to}`;

  const exportCsv = () =>
    downloadCsv(
      `sales-${from}-to-${to}.csv`,
      ['#', 'Date', 'Branch', 'Cashier', 'Payment', 'Items', 'Total', 'Status'],
      rows.map((r) => [
        r.id,
        dateTime(r.createdAt),
        r.branch?.name ?? '',
        r.user?.name ?? '',
        r.paymentMethod,
        r.items.reduce((a, i) => a + i.quantity, 0),
        num(r.total),
        isVoid(r) ? `VOIDED: ${r.voidReason ?? ''}` : 'Completed',
      ]),
    );

  const exportPdf = () =>
    downloadPdfReport({
      title: 'Sales',
      meta: [`Period: ${period}`, `Revenue: ${money(revenue)} · ${live.length} sales · ${voidedCount} voided`],
      filename: `sales-${from}-to-${to}.pdf`,
      sections: [
        {
          heading: 'Transactions',
          headers: ['#', 'Date', 'Branch', 'Cashier', 'Payment', 'Items', 'Total', 'Status'],
          numeric: [5, 6],
          rows: rows.map((r) => [
            r.id,
            dateTime(r.createdAt),
            r.branch?.name ?? '—',
            r.user?.name ?? '—',
            r.paymentMethod,
            r.items.reduce((a, i) => a + i.quantity, 0),
            money(r.total),
            isVoid(r) ? 'Voided' : 'Completed',
          ]),
        },
      ],
    });

  const openVoid = (sale: Sale) => {
    setVoidTarget(sale);
    setVoidReason('');
    setVoidError(null);
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (voidReason.trim().length < 3) {
      setVoidError('Give a reason of at least 3 characters.');
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      await api.post(`/api/sales/${voidTarget.id}/void`, { reason: voidReason.trim() });
      setVoidTarget(null);
      setSelected(null);
      refresh();
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : 'Could not void this sale.');
    } finally {
      setVoiding(false);
    }
  };

  const printSale = async (sale: Sale) => {
    setReprinting(sale.id);
    setVoidError(null);
    try {
      await reprintSale(sale.id, user?.name);
      refresh();
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : 'Could not reprint this receipt.');
    } finally {
      setReprinting(null);
    }
  };

  const columns: Column<Sale>[] = [
    { key: 'id', header: '#', accessor: (r) => r.id, sortable: true, render: (r) => <span className="font-mono text-xs">#{r.id}</span> },
    { key: 'date', header: 'Date', accessor: (r) => r.createdAt, sortable: true, render: (r) => dateTime(r.createdAt) },
    { key: 'branch', header: 'Branch', accessor: (r) => r.branch?.name ?? '', render: (r) => r.branch?.name ?? '—' },
    { key: 'cashier', header: 'Cashier', accessor: (r) => r.user?.name ?? '', render: (r) => r.user?.name ?? '—' },
    { key: 'items', header: 'Items', align: 'right', accessor: (r) => r.items.reduce((a, i) => a + i.quantity, 0) },
    {
      key: 'payment',
      header: 'Payment',
      render: (r) => (isVoid(r) ? <Pill tone="red">Voided</Pill> : <Pill tone={paymentTone(r.paymentMethod)}>{r.paymentMethod}</Pill>),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      accessor: (r) => num(r.total),
      sortable: true,
      render: (r) => <span className={isVoid(r) ? 'font-mono text-muted-foreground line-through' : 'font-mono'}>{money(r.total)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <RowActions>
          <RowAction onClick={() => setSelected(r)} icon={<Eye className="h-4 w-4" />} label="View sale" />
          <RowAction
            onClick={() => printSale(r)}
            disabled={reprinting === r.id}
            icon={<Printer className="h-4 w-4" />}
            label="Reprint receipt (duplicate copy)"
          />
          {canManage && !isVoid(r) && (
            <RowAction onClick={() => openVoid(r)} icon={<Ban className="h-4 w-4" />} label="Void sale" tone="danger" />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales"
        subtitle="Recent transactions across the shop."
        right={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={rows.length === 0}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isAdmin && (
            <FormField label="Branch">
              <BranchSelect value={branchId} onChange={setBranchId} includeAll />
            </FormField>
          )}
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {voidError && !voidTarget && <Alert tone="red">{voidError}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Revenue" value={money(revenue)} tone="green" filled />
        <KpiCard label="Transactions" value={fmt(live.length)} tone="blue" />
        <KpiCard label="Items sold" value={fmt(itemsSold)} tone="purple" />
        <KpiCard label="Voided" value={fmt(voidedCount)} tone={voidedCount > 0 ? 'red' : 'amber'} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.id} ${r.branch?.name ?? ''} ${r.user?.name ?? ''} ${r.paymentMethod}`}
            searchPlaceholder="Search sales…"
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyText="No sales in this period."
            pageSize={12}
            rowKey={(r) => r.id}
            actionSlot={
              <Link to="/pos">
                <Button>
                  <Plus className="h-4 w-4" /> New sale
                </Button>
              </Link>
            }
          />
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Sale #${selected.id}` : ''}
        wide
        footer={
          selected ? (
            <>
              <Button variant="outline" onClick={() => printSale(selected)} loading={reprinting === selected.id}>
                <Printer className="h-4 w-4" /> Reprint receipt
              </Button>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            {isVoid(selected) && (
              <Alert tone="red">
                <b>Voided</b> on {dateTime(selected.voidedAt)} by {selected.voidedBy?.name ?? '—'}
                {selected.voidReason ? ` — ${selected.voidReason}` : ''}. Stock was returned and this sale is excluded from revenue.
              </Alert>
            )}
            {(selected.reprintCount ?? 0) > 0 && (
              <Alert tone="amber">
                {selected.reprintCount} duplicate {selected.reprintCount === 1 ? 'copy has' : 'copies have'} been printed. Reprints are
                stamped <b>DUPLICATE</b> and recorded in the audit log.
              </Alert>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Date</div>
                <div className="text-foreground">{dateTime(selected.createdAt)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Branch</div>
                <div className="text-foreground">{selected.branch?.name ?? '—'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Cashier</div>
                <div className="text-foreground">{selected.user?.name ?? '—'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Payment</div>
                <Pill tone={paymentTone(selected.paymentMethod)}>{selected.paymentMethod}</Pill>
              </div>
            </div>
            <div className="rounded-lg border border-border">
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th num>Qty</Th>
                    <Th num>Unit price</Th>
                    <Th num>Line total</Th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((i) => (
                    <tr key={i.id}>
                      <Td>
                        <div className="font-medium text-foreground">{i.book?.title ?? `Book #${i.bookId}`}</div>
                        {i.book?.sku && <div className="text-[11px] text-muted-foreground font-mono">{i.book.sku}</div>}
                      </Td>
                      <Td num>{i.quantity}</Td>
                      <Td num>{money(i.unitPrice)}</Td>
                      <Td num>{money(i.quantity * num(i.unitPrice))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="flex justify-end">
              <div className="w-56 flex items-center justify-between text-base font-semibold border-t border-border pt-3">
                <span className="flex items-center gap-2"><ReceiptText className="h-4 w-4" /> Total</span>
                <span className="font-mono">{money(selected.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void sale #${voidTarget.id}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmVoid} loading={voiding}>
              <Ban className="h-4 w-4" /> Void sale
            </Button>
          </>
        }
      >
        {voidTarget && (
          <div className="space-y-4">
            <Alert tone="amber">
              This reverses {money(voidTarget.total)} and returns {voidTarget.items.reduce((a, i) => a + i.quantity, 0)} item(s) to stock at{' '}
              {voidTarget.branch?.name ?? 'this branch'}. The sale stays on record and the action is logged against your account.
            </Alert>
            {voidError && <Alert tone="red">{voidError}</Alert>}
            <FormField label="Reason" hint="Required — shown in the audit trail and the Z-report.">
              <Input
                autoFocus
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Wrong item scanned, customer returned goods"
                maxLength={200}
              />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
