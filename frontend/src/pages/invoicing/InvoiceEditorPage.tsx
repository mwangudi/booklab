import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, Receipt, Save, Trash2, Truck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useLocation } from 'react-router-dom';
import { useCan } from '../../lib/permissions';
import { useAuth } from '../../lib/auth';
import { money, num, today } from '../../lib/format';
import { PRODUCT_UNITS } from '../../lib/categories';
import { printDeliveryNote, printInvoice } from '../../lib/documents';
import type { Customer, Invoice, Stock } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { Alert, Button, Card, FormField, Input, Loading, Modal, PageHeader, Pill, SectionTitle, Textarea } from '../../components/ui';
import { Select2 } from '../../components/Select2';

interface Line {
  /** The saved line this is; absent on a line added since the last save. */
  id?: number;
  /** Units of this line that have already left the shelf. */
  delivered: number;
  bookId: number | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

const blankLine = (): Line => ({ delivered: 0, bookId: null, description: '', unit: 'Piece', quantity: '1', unitPrice: '0', vatRate: '16' });

export default function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  // Set when this draft was just made from a website request.
  const unpriced = ((useLocation().state as { unpriced?: string[] } | null)?.unpriced) ?? [];
  const can = useCan();

  const { data: invoice, loading, refresh } = useApi<Invoice>(isEdit ? `/api/invoices/${id}` : null, [id]);
  const { data: customers } = useApi<Customer[]>('/api/invoices/customers');
  const { user } = useAuth();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [chargeVat, setChargeVat] = useState(true);
  const [vatMode, setVatMode] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE');
  const [priceTier, setPriceTier] = useState('SCHOOL');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [received, setReceived] = useState({ receivedBy: '', receivedIdNo: '', receivedDesignation: '' });

  // Items are picked from what the invoicing branch has on its shelf.
  const stockBranch = branchId ?? user?.branchId ?? null;
  const { data: shelf, refresh: refreshShelf } = useApi<Stock[]>(stockBranch != null ? `/api/stock/branch/${stockBranch}` : null, [stockBranch]);
  const shelfByBook = useMemo(() => new Map((shelf ?? []).map((s) => [s.bookId, s])), [shelf]);

  const customer = useMemo(() => customers?.find((c) => c.id === customerId) ?? null, [customers, customerId]);
  // A delivered invoice stays open until it is paid: customers keep collecting against
  // it, and whatever is added leaves the shelf when it is saved.
  const delivered = invoice?.status === 'DELIVERED';
  const readOnly =
    !!invoice && (invoice.status === 'PAID' || invoice.status === 'CANCELLED' || (delivered && !can('invoice.deliver')));
  // Who the invoice is for and how it is priced are fixed once goods have gone out.
  const termsLocked = readOnly || delivered;

  useEffect(() => {
    if (!invoice) return;
    setCustomerId(invoice.customerId);
    setBranchId(invoice.branchId);
    setIssueDate(invoice.issueDate.slice(0, 10));
    setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : '');
    setChargeVat(invoice.chargeVat);
    setVatMode(invoice.vatMode);
    setPriceTier(invoice.priceTier);
    setNotes(invoice.notes ?? '');
    setLines(
      (invoice.items ?? []).map((i) => ({
        id: i.id,
        delivered: num(i.deliveredQty),
        bookId: i.bookId,
        description: i.description,
        unit: i.unit,
        quantity: String(num(i.quantity)),
        unitPrice: String(num(i.unitPrice)),
        vatRate: String(num(i.vatRate)),
      })),
    );
  }, [invoice]);

  // A new invoice inherits the customer's VAT arrangement.
  useEffect(() => {
    if (isEdit || !customer) return;
    setChargeVat(customer.chargeVat);
    setVatMode(customer.vatMode);
    if (customer.paymentTermsDays && issueDate) {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + customer.paymentTermsDays);
      setDueDate(d.toISOString().slice(0, 10));
    }
  }, [customer, isEdit, issueDate]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /** The branch's price for the invoice's tier, falling back to the catalogue — as the server does. */
  const tierPrice = (s: Stock) => {
    const b = s.book;
    const retail = num(s.price ?? b.unitPrice);
    if (priceTier === 'WHOLESALE') return num(s.priceWholesale ?? b.priceWholesale ?? retail);
    if (priceTier === 'SCHOOL') return num(s.priceSchool ?? b.priceSchool ?? retail);
    return retail;
  };

  /** Picking a product from the shelf fills the description, unit, price and VAT rate. */
  const chooseBook = (i: number, bookIdStr: string) => {
    if (!bookIdStr) return setLine(i, { bookId: null });
    const s = shelfByBook.get(Number(bookIdStr));
    if (!s) return;
    const b = s.book;
    setLine(i, { bookId: b.id, description: b.title, unit: b.unit || 'Piece', unitPrice: String(tierPrice(s)), vatRate: String(num(b.vatRate)) });
  };

  // Units each product still needs from the shelf: what is on the lines less what has gone out.
  const needed = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of lines) {
      if (l.bookId == null) continue;
      m.set(l.bookId, (m.get(l.bookId) ?? 0) + Math.max(0, Math.round(num(l.quantity)) - Math.round(l.delivered)));
    }
    return m;
  }, [lines]);
  const shortOf = (bookId: number | null) => {
    if (bookId == null || !shelf) return null;
    const onHand = shelfByBook.get(bookId)?.quantity ?? 0;
    return (needed.get(bookId) ?? 0) > onHand ? onHand : null;
  };
  const anyShort = lines.some((l) => shortOf(l.bookId) != null);
  // Goods that will leave the shelf when a delivered invoice is saved.
  const toBookOut = delivered ? [...needed.values()].reduce((a, b) => a + b, 0) : 0;

  const computed = useMemo(() => {
    let net = 0;
    let vat = 0;
    for (const l of lines) {
      const rate = chargeVat ? num(l.vatRate) : 0;
      const raw = num(l.quantity) * num(l.unitPrice);
      const lineNet = rate > 0 && vatMode === 'INCLUSIVE' ? raw / (1 + rate / 100) : raw;
      net += lineNet;
      vat += rate === 0 ? 0 : vatMode === 'INCLUSIVE' ? raw - lineNet : lineNet * (rate / 100);
    }
    return { net, vat, total: net + vat };
  }, [lines, chargeVat, vatMode]);

  const payload = () => ({
    customerId,
    branchId,
    priceTier,
    chargeVat,
    vatMode,
    issueDate,
    dueDate: dueDate || null,
    notes: notes.trim() || null,
    items: lines
      .filter((l) => l.description.trim() && (num(l.quantity) > 0 || l.delivered > 0))
      .map((l) => ({
        ...(l.id != null ? { id: l.id } : {}),
        bookId: l.bookId,
        description: l.description.trim(),
        unit: l.unit,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        vatRate: num(l.vatRate),
      })),
  });

  const save = async () => {
    setError(null);
    if (!customerId) return setError('Choose a customer.');
    const body = payload();
    if (body.items.length === 0) return setError('Add at least one item with a description and quantity.');
    const below = lines.find((l) => l.delivered > 0 && num(l.quantity) < l.delivered);
    if (below) return setError(`${below.description}: ${below.delivered} already delivered, so the quantity cannot go below that.`);
    if (anyShort) return setError('Some items need more than the branch has in stock. Lower the quantity or receive the stock first.');
    if (
      delivered &&
      toBookOut > 0 &&
      !window.confirm(`This invoice has been delivered. Saving books ${toBookOut} more unit${toBookOut === 1 ? '' : 's'} out of stock now. Continue?`)
    ) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/invoices/${id}`, body);
        refresh();
        refreshShelf();
      } else {
        const created = await api.post<Invoice>('/api/invoices', body);
        navigate(`/invoices/${created.id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the invoice.');
    } finally {
      setSaving(false);
    }
  };

  const act = async (path: string, fail: string, body?: unknown) => {
    setSaving(true);
    setError(null);
    try {
      await api.post(path, body);
      setDeliverOpen(false);
      refresh();
      refreshShelf();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fail);
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  const customerOptions = [
    { value: '', label: 'Select a customer…' },
    ...(customers ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ];
  // Only what is on the shelf can be picked; a product already on a line stays listed.
  const onLines = new Set(lines.map((l) => l.bookId).filter((x): x is number => x != null));
  const bookOptions = [
    { value: '', label: 'Free text (not from stock)' },
    ...(shelf ?? [])
      .filter((s) => s.quantity > 0 || onLines.has(s.bookId))
      .map((s) => ({ value: String(s.bookId), label: `${s.book.title} — ${s.book.sku} · ${s.quantity} in stock` })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? `Invoice ${invoice?.number ?? ''}` : 'New invoice'}
        subtitle={
          invoice
            ? `${invoice.status.toLowerCase()}${invoice.deliveryNoteNo ? ` · delivery note ${invoice.deliveryNoteNo}` : ''}`
            : 'Supply a school or institution on credit.'
        }
        right={
          <>
            <Button variant="outline" onClick={() => navigate('/invoices')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {invoice && (
              <>
                <Button variant="outline" onClick={() => printInvoice(invoice)}>
                  <Receipt className="h-4 w-4" /> Invoice
                </Button>
                <Button variant="outline" onClick={() => printDeliveryNote(invoice)}>
                  <Truck className="h-4 w-4" /> Delivery note
                </Button>
              </>
            )}
            {!readOnly && (
              <Button onClick={save} loading={saving}>
                <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create invoice'}
              </Button>
            )}
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}
      {unpriced.length > 0 && invoice?.status === 'DRAFT' && (
        <Alert tone="amber">
          Made from a website request. These items have no selling price yet, so they came in at 0. Enter their prices
          before issuing: {unpriced.join('; ')}.
        </Alert>
      )}
      {readOnly && (
        <Alert tone="blue">
          {delivered
            ? 'This invoice has been delivered. Adding goods to it needs the right to confirm deliveries.'
            : `This invoice is ${invoice?.status.toLowerCase()} and can no longer be edited.`}{' '}
          It remains available to print.
        </Alert>
      )}
      {delivered && !readOnly && (
        <Alert tone="amber">
          Delivered, not yet paid: the customer can keep collecting against this invoice. New lines and extra quantities
          are booked out of {invoice?.branch?.name ?? 'the branch'}&apos;s stock when you save. Lines already delivered keep
          their price and cannot go below what has gone out.
        </Alert>
      )}
      {!readOnly && stockBranch == null && (
        <Alert tone="amber">Choose a branch to pick items from its stock.</Alert>
      )}

      <Card className="p-4 space-y-4">
        <SectionTitle>Details</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <FormField label="Customer *">
              <Select2
                value={customerId == null ? '' : String(customerId)}
                onChange={(v) => setCustomerId(v ? Number(v) : null)}
                options={customerOptions}
                disabled={termsLocked}
              />
            </FormField>
          </div>
          <FormField label="Branch">
            <BranchSelect value={branchId} onChange={setBranchId} includeAll disabled={termsLocked} />
          </FormField>
          <FormField label="Price tier">
            <Select2
              value={priceTier}
              onChange={setPriceTier}
              options={[
                { value: 'SCHOOL', label: 'School price' },
                { value: 'WHOLESALE', label: 'Wholesale price' },
                { value: 'RETAIL', label: 'Retail price' },
              ]}
              searchable={false}
              disabled={termsLocked}
            />
          </FormField>
          <FormField label="Invoice date">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={readOnly} />
          </FormField>
          <FormField label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={readOnly} />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>VAT</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={chargeVat}
              onChange={(e) => setChargeVat(e.target.checked)}
              disabled={termsLocked}
              className="h-4 w-4 mt-0.5 rounded border-border"
            />
            <span>
              Charge VAT on this invoice
              <span className="block text-xs text-muted-foreground">
                {customer ? `${customer.name} is set to ${customer.chargeVat ? 'charge' : 'not charge'} VAT.` : 'Defaults to the customer’s setting.'}
              </span>
            </span>
          </label>
          <FormField label="Prices are">
            <Select2
              value={vatMode}
              onChange={(v) => setVatMode(v as 'EXCLUSIVE' | 'INCLUSIVE')}
              options={[
                { value: 'EXCLUSIVE', label: 'Exclusive of VAT (add on top)' },
                { value: 'INCLUSIVE', label: 'Inclusive of VAT' },
              ]}
              searchable={false}
              disabled={termsLocked || !chargeVat}
            />
          </FormField>
          <div className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-2">
            The rate is per item, so zero-rated goods such as printed books can sit on the same invoice as
            standard-rated stationery. Set an item&apos;s VAT to 0 to exempt just that line.
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <SectionTitle
          right={
            !readOnly ? (
              <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, blankLine()])}>
                <Plus className="h-3.5 w-3.5" /> Add line
              </Button>
            ) : undefined
          }
        >
          Items
        </SectionTitle>

        <div className="space-y-2">
          {lines.map((l, i) => {
            const raw = num(l.quantity) * num(l.unitPrice);
            // What has already gone out is fixed: its product, price and VAT, and the quantity's floor.
            const fixed = readOnly || l.delivered > 0;
            const short = readOnly ? null : shortOf(l.bookId);
            const onHand = l.bookId != null ? shelfByBook.get(l.bookId)?.quantity : undefined;
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-lg border border-border p-2.5">
                <div className="col-span-12 lg:col-span-3">
                  <FormField label={i === 0 ? 'Product' : ''}>
                    <Select2
                      value={l.bookId == null ? '' : String(l.bookId)}
                      onChange={(v) => chooseBook(i, v)}
                      options={bookOptions}
                      disabled={fixed || stockBranch == null}
                    />
                  </FormField>
                </div>
                <div className="col-span-12 lg:col-span-3">
                  <FormField label={i === 0 ? 'Description' : ''}>
                    <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Item description" disabled={fixed} />
                  </FormField>
                </div>
                <div className="col-span-4 lg:col-span-1">
                  <FormField label={i === 0 ? 'Qty' : ''}>
                    <Input
                      type="number"
                      min={l.delivered > 0 ? String(l.delivered) : '0'}
                      step="0.01"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      className={`font-mono ${short != null ? 'border-[#9b2626]' : ''}`}
                      disabled={readOnly}
                    />
                  </FormField>
                  {short != null ? (
                    <div className="mt-0.5 text-[11px] text-[#9b2626]">Only {short} in stock</div>
                  ) : l.delivered > 0 ? (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{l.delivered} delivered</div>
                  ) : !readOnly && onHand != null ? (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{onHand} in stock</div>
                  ) : null}
                </div>
                <div className="col-span-4 lg:col-span-1">
                  <FormField label={i === 0 ? 'Unit' : ''}>
                    <Select2
                      value={l.unit}
                      onChange={(v) => setLine(i, { unit: v })}
                      options={PRODUCT_UNITS.map((u) => ({ value: u, label: u }))}
                      searchable={false}
                      disabled={fixed}
                    />
                  </FormField>
                </div>
                <div className="col-span-4 lg:col-span-1">
                  <FormField label={i === 0 ? 'Unit cost' : ''}>
                    <Input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className="font-mono" disabled={fixed} />
                  </FormField>
                </div>
                <div className="col-span-4 lg:col-span-1">
                  <FormField label={i === 0 ? 'VAT %' : ''}>
                    <Input type="number" min="0" max="100" step="0.5" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} className="font-mono" disabled={fixed || !chargeVat} />
                  </FormField>
                </div>
                <div className="col-span-6 lg:col-span-1 text-right">
                  <div className="text-[11px] text-muted-foreground">Total</div>
                  <div className="font-mono text-sm font-semibold">{money(raw)}</div>
                </div>
                <div className="col-span-2 lg:col-span-1 text-right">
                  {!fixed && lines.length > 1 && (
                    <button
                      onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                      className="inline-grid h-8 w-8 place-items-center rounded-lg text-[#9b2626] hover:bg-[#9b2626]/10"
                      title="Remove line"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <div className="w-full sm:w-72 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (net)</span>
              <span className="font-mono">{money(computed.net)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT</span>
              <span className="font-mono">{chargeVat ? money(computed.vat) : 'Not charged'}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-border pt-2">
              <span>Total</span>
              <span className="font-mono">{money(computed.total)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>Notes</SectionTitle>
        <FormField label="Printed on the invoice">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, order reference, payment details…" disabled={readOnly} />
        </FormField>
      </Card>

      {invoice && (
        <Card className="p-4">
          <SectionTitle>Workflow</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Pill tone={invoice.status === 'PAID' ? 'green' : invoice.status === 'DRAFT' ? 'gray' : 'amber'}>{invoice.status.toLowerCase()}</Pill>
            {invoice.status === 'DRAFT' && can('invoice.create') && (
              <Button variant="outline" onClick={() => act(`/api/invoices/${invoice.id}/issue`, 'Could not issue.')} loading={saving}>
                Issue invoice
              </Button>
            )}
            {(invoice.status === 'ISSUED' || invoice.status === 'DRAFT') && can('invoice.deliver') && (
              <Button variant="outline" onClick={() => setDeliverOpen(true)}>
                <Truck className="h-4 w-4" /> Confirm delivery
              </Button>
            )}
            {invoice.status === 'DELIVERED' && can('payment.record') && (
              <Button variant="outline" onClick={() => act(`/api/invoices/${invoice.id}/paid`, 'Could not mark paid.')} loading={saving}>
                <CheckCircle2 className="h-4 w-4" /> Mark as paid
              </Button>
            )}
          </div>
          {invoice.saleId && (
            <p className="mt-3 text-xs text-muted-foreground">
              Delivered goods were booked out as sale #{invoice.saleId}
              {delivered ? ' (goods added later go out as further sales)' : ''}, so stock and profit already reflect this
              invoice.
            </p>
          )}
        </Card>
      )}

      <Modal
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        title="Confirm delivery"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeliverOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => act(`/api/invoices/${invoice?.id}/deliver`, 'Could not confirm delivery.', received)} loading={saving}>
              <Truck className="h-4 w-4" /> Confirm delivery
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="amber">
            Catalogue items will be booked out of {invoice?.branch?.name ?? 'the selected branch'} as a sale, so stock,
            cost of goods and profit all update. Until it is paid, more goods can still be added to the invoice; they
            leave the shelf when it is saved.
          </Alert>
          <FormField label="Received by">
            <Input value={received.receivedBy} onChange={(e) => setReceived((p) => ({ ...p, receivedBy: e.target.value }))} placeholder="Name of the person receiving" />
          </FormField>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="ID number">
              <Input value={received.receivedIdNo} onChange={(e) => setReceived((p) => ({ ...p, receivedIdNo: e.target.value }))} className="font-mono" />
            </FormField>
            <FormField label="Designation">
              <Input value={received.receivedDesignation} onChange={(e) => setReceived((p) => ({ ...p, receivedDesignation: e.target.value }))} placeholder="e.g. Bursar" />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
