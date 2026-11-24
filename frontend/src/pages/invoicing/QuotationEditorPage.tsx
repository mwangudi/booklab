import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Save, Send, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useCan } from '../../lib/permissions';
import { useAuth } from '../../lib/auth';
import { money, num, today } from '../../lib/format';
import { PRODUCT_UNITS } from '../../lib/categories';
import { buildQuotation, canShareFiles, deliverPdf, quotationInput, type PdfOutcome } from '../../lib/documents';
import { quotationPath } from '../../lib/quotationLink';
import type { Book, Customer, Quotation, QuotationStatus, Stock } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { Alert, Button, Card, FormField, Input, Loading, PageHeader, SectionTitle, Textarea } from '../../components/ui';
import { Select2 } from '../../components/Select2';

interface Line {
  /** A free-text line (a service, a delivery charge) rather than a catalogue product. */
  free?: boolean;
  bookId: number | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

/** The picker's "type your own" choice. */
const FREE_TEXT = '__free__';
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const blankLine = (): Line => ({ bookId: null, description: '', unit: 'Piece', quantity: '1', unitPrice: '0', vatRate: '16' });

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent to the customer',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
};

/** A PDF ready to share, kept when the phone refused to share it without a fresh tap. */
interface PendingShare {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
}

/** Messages carried to the quotation's own page after it is first created. */
interface Carried {
  error?: string;
  notice?: string;
  pendingShare?: PendingShare;
}

/** A quotation made on its own: pick the customer and items, then download or send it. */
export default function QuotationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const here = useLocation();
  const can = useCan();
  const { user } = useAuth();
  const readOnly = !can('invoice.create');

  const { data: quotation, loading, refresh } = useApi<Quotation>(isEdit ? `/api/quotations/${id}` : null, [id]);
  // An old link (/quotations/4) or a lower-case code moves to the quotation's own address.
  useEffect(() => {
    if (quotation?.ref && id !== quotation.ref) navigate(quotationPath(quotation), { replace: true, state: here.state });
  }, [quotation, id, navigate, here.state]);
  const { data: customers } = useApi<Customer[]>('/api/invoices/customers');

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(today());
  const [validDays, setValidDays] = useState('30');
  const [status, setStatus] = useState<QuotationStatus>('DRAFT');
  const [chargeVat, setChargeVat] = useState(true);
  const [vatMode, setVatMode] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE');
  const [priceTier, setPriceTier] = useState('SCHOOL');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const carried = (here.state as Carried | null) ?? {};
  const [error, setError] = useState<string | null>(carried.error ?? null);
  const [notice, setNotice] = useState<string | null>(carried.notice ?? null);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(carried.pendingShare ?? null);
  const [saving, setSaving] = useState(false);
  const shareable = useMemo(() => canShareFiles(), []);

  // Prices (and stock levels, for information) come from the quoting branch.
  const stockBranch = branchId ?? user?.branchId ?? null;
  const { data: shelf } = useApi<Stock[]>(stockBranch != null ? `/api/stock/branch/${stockBranch}` : null, [stockBranch]);
  const { data: catalogueBooks } = useApi<Book[]>(stockBranch == null ? '/api/books' : null, [stockBranch]);
  const shelfByBook = useMemo(() => new Map((shelf ?? []).map((s) => [s.bookId, s])), [shelf]);

  const customer = useMemo(() => customers?.find((c) => c.id === customerId) ?? null, [customers, customerId]);

  useEffect(() => {
    if (!quotation) return;
    setCustomerId(quotation.customerId);
    setBranchId(quotation.branchId);
    setIssueDate(quotation.issueDate.slice(0, 10));
    setValidDays(String(quotation.validDays));
    setStatus(quotation.status);
    setChargeVat(quotation.chargeVat);
    setVatMode(quotation.vatMode);
    setPriceTier(quotation.priceTier);
    setNotes(quotation.notes ?? '');
    setLines(
      (quotation.items ?? []).map((i) => ({
        free: i.bookId == null,
        bookId: i.bookId,
        description: i.description,
        unit: i.unit,
        quantity: String(num(i.quantity)),
        unitPrice: String(num(i.unitPrice)),
        vatRate: String(num(i.vatRate)),
      })),
    );
  }, [quotation]);

  // A new quotation takes the customer's VAT arrangement.
  useEffect(() => {
    if (isEdit || !customer) return;
    setChargeVat(customer.chargeVat);
    setVatMode(customer.vatMode);
  }, [customer, isEdit]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /** The branch's price for the chosen tier, falling back to the catalogue — as the server checks. */
  const tierPrice = (s: Stock) => {
    const b = s.book;
    const retail = num(s.price ?? b.unitPrice);
    if (priceTier === 'WHOLESALE') return num(s.priceWholesale ?? b.priceWholesale ?? retail);
    if (priceTier === 'SCHOOL') return num(s.priceSchool ?? b.priceSchool ?? retail);
    return retail;
  };

  /** Picking a product fills its description, unit, price and VAT; picking one already listed adds to that line. */
  const chooseBook = (i: number, value: string) => {
    if (value === FREE_TEXT) return setLine(i, { bookId: null, free: true, description: '' });
    if (!value) return setLine(i, { bookId: null, free: false, description: '' });
    const bookId = Number(value);
    const s = shelfByBook.get(bookId) ?? (() => {
      const b = catalogueBooks?.find((x) => x.id === bookId);
      return b ? ({ bookId: b.id, quantity: 0, price: null, book: b } as unknown as Stock) : undefined;
    })();
    if (!s) return;
    const b = s.book;
    const other = lines.findIndex((l, j) => j !== i && l.bookId === b.id);
    if (other >= 0) {
      const newQty = r2(num(lines[other].quantity) + Math.max(1, num(lines[i].quantity) || 1));
      setLines((p) => p.map((l, idx) => (idx === other ? { ...l, quantity: String(newQty) } : l)).filter((_, idx) => idx !== i));
      setNotice(`${b.title} is already on this quotation, so its quantity is now ${newQty} instead of a second line.`);
      return;
    }
    setNotice(null);
    setLine(i, { bookId: b.id, free: false, description: b.title, unit: b.unit || 'Piece', unitPrice: String(tierPrice(s)), vatRate: String(num(b.vatRate)) });
  };

  /** Products on more than one line at the same price, VAT and unit, which can become one line. */
  const sameTerms = (a: Line, b: Line) => num(a.unitPrice) === num(b.unitPrice) && num(a.vatRate) === num(b.vatRate) && a.unit === b.unit;
  const groups = (() => {
    const byBook = new Map<number, number[]>();
    lines.forEach((l, idx) => l.bookId != null && byBook.set(l.bookId, [...(byBook.get(l.bookId) ?? []), idx]));
    return [...byBook.values()].filter((g) => g.length > 1).map((g) => ({
      keep: g[0],
      merge: g.slice(1).filter((idx) => sameTerms(lines[idx], lines[g[0]])),
      differs: g.slice(1).some((idx) => !sameTerms(lines[idx], lines[g[0]])),
      name: lines[g[0]].description,
      count: g.length,
    }));
  })();
  const mergeable = groups.filter((g) => g.merge.length > 0);
  const differing = groups.filter((g) => g.differs);
  const combineDuplicates = () => {
    const drop = new Set(mergeable.flatMap((g) => g.merge));
    const extra = new Map(mergeable.map((g) => [g.keep, g.merge.reduce((t, idx) => t + num(lines[idx].quantity), 0)]));
    setLines((p) => p.map((l, idx) => (extra.has(idx) ? { ...l, quantity: String(r2(num(l.quantity) + extra.get(idx)!)) } : l)).filter((_, idx) => !drop.has(idx)));
    setNotice(`Combined ${drop.size} duplicate line${drop.size === 1 ? '' : 's'}. Save to keep the change.`);
  };

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

  const payload = (nextStatus: QuotationStatus) => ({
    customerId,
    branchId,
    priceTier,
    status: nextStatus,
    chargeVat,
    vatMode,
    issueDate,
    validDays: Math.min(365, Math.max(1, Math.round(num(validDays)) || 30)),
    notes: notes.trim() || null,
    items: lines
      .filter((l) => l.description.trim() && num(l.quantity) > 0)
      .map((l) => ({
        bookId: l.bookId,
        description: l.description.trim(),
        unit: l.unit,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        vatRate: num(l.vatRate),
      })),
  });

  /** Save what is on screen; returns the saved quotation, or null (with the reason shown). */
  const persist = async (nextStatus: QuotationStatus): Promise<Quotation | null> => {
    setError(null);
    if (!customerId) {
      setError('Choose the customer the quotation is for.');
      return null;
    }
    const body = payload(nextStatus);
    if (body.items.length === 0) {
      setError('Add at least one item with a description and quantity.');
      return null;
    }
    try {
      const saved = isEdit
        ? await api.patch<Quotation>(`/api/quotations/${quotation?.id ?? id}`, body)
        : await api.post<Quotation>('/api/quotations', body);
      setStatus(saved.status);
      return saved;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the quotation.');
      return null;
    }
  };

  const save = async () => {
    setNotice(null);
    setSaving(true);
    const saved = await persist(status);
    setSaving(false);
    if (!saved) return;
    afterSave(saved, {});
  };

  /** Where to go after a save: a new quotation moves to its own page, carrying any message. */
  const afterSave = (saved: Quotation, carry: Carried) => {
    if (isEdit) refresh();
    else navigate(quotationPath(saved), { replace: true, state: carry });
  };

  /** Save, then download the PDF (or share it on a phone). Handing it over marks a draft as sent. */
  const send = async (mode: 'download' | 'share') => {
    setNotice(null);
    setPendingShare(null);
    setSaving(true);
    const saved = await persist(status === 'DRAFT' ? 'SENT' : status);
    if (!saved) return setSaving(false);
    const carry: Carried = {};
    try {
      const { blob, fileName } = await buildQuotation(quotationInput(saved, user?.name));
      const share = { title: `Quotation ${saved.number}`, text: `Quotation ${saved.number} from Booklab Bookshop for ${saved.customer?.name ?? ''}.` };
      const outcome: PdfOutcome = await deliverPdf(blob, fileName, mode === 'share' ? share : undefined);
      // The phone wants a fresh tap to share: keep the PDF and offer one.
      if (outcome === 'blocked') carry.pendingShare = { blob, fileName, ...share };
    } catch {
      carry.error = 'The quotation was saved, but its PDF could not be made. Try again.';
    } finally {
      setSaving(false);
    }
    if (carry.error) setError(carry.error);
    if (carry.pendingShare) setPendingShare(carry.pendingShare);
    afterSave(saved, carry);
  };

  const shareNow = async () => {
    if (!pendingShare) return;
    const { blob, fileName, title, text } = pendingShare;
    const outcome = await deliverPdf(blob, fileName, { title, text });
    if (outcome !== 'blocked') setPendingShare(null);
  };

  /** For someone who may only look: the saved quotation's PDF, without saving anything. */
  const downloadSaved = async () => {
    if (!quotation) return;
    setError(null);
    try {
      const { blob, fileName } = await buildQuotation(quotationInput(quotation, user?.name));
      await deliverPdf(blob, fileName);
    } catch {
      setError('Could not make the quotation PDF. Try again.');
    }
  };

  if (isEdit && loading) return <Loading />;
  if (isEdit && !loading && !quotation) return <Alert tone="red">Quotation not found.</Alert>;

  const customerOptions = [
    { value: '', label: 'Select a customer…' },
    ...(customers ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const qtyListed = new Map<number, number>();
  for (const l of lines) if (l.bookId != null) qtyListed.set(l.bookId, r2((qtyListed.get(l.bookId) ?? 0) + num(l.quantity)));
  const listed = (bookId: number) => (qtyListed.has(bookId) ? ` · on this quotation (qty ${qtyListed.get(bookId)})` : '');
  const bookOptions = [
    { value: FREE_TEXT, label: 'Free text — type your own description (a service, delivery…)' },
    ...(stockBranch == null
      ? [...(catalogueBooks ?? [])]
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((b) => ({ value: String(b.id), label: `${b.title} — ${b.sku}${listed(b.id)}` }))
      : [...(shelf ?? [])]
          .sort((a, b) => a.book.title.localeCompare(b.book.title))
          .map((s) => ({
            value: String(s.bookId),
            label: `${s.book.title} — ${s.book.sku} · ${s.quantity > 0 ? `${s.quantity} in stock` : 'out of stock'}${listed(s.bookId)}`,
          }))),
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? `Quotation ${quotation?.number ?? ''}` : 'New quotation'}
        subtitle={isEdit ? QUOTATION_STATUS_LABEL[status].toLowerCase() : 'Offer a school or customer prices before they order.'}
        right={
          <>
            <Button variant="outline" onClick={() => navigate('/quotations')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {readOnly && quotation && (
              <Button variant="outline" onClick={downloadSaved}>
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            )}
            {!readOnly && (
              <>
                <Button variant="outline" onClick={() => send('download')} loading={saving} title="Save, then download the quotation PDF">
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
                {shareable && (
                  <Button variant="outline" onClick={() => send('share')} loading={saving} title="Save, then send the PDF by WhatsApp, email…">
                    <Send className="h-4 w-4" /> Send
                  </Button>
                )}
                <Button onClick={save} loading={saving}>
                  <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create quotation'}
                </Button>
              </>
            )}
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}
      {notice && <Alert tone="blue">{notice}</Alert>}
      {pendingShare && (
        <Alert tone="blue">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>The quotation is saved and ready. Tap Share now to send it by WhatsApp, email or another app.</span>
            <Button size="sm" onClick={shareNow}>
              <Send className="h-4 w-4" /> Share now
            </Button>
          </div>
        </Alert>
      )}
      {!readOnly && mergeable.length > 0 && (
        <Alert tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <b>The same product is on more than one line:</b> {mergeable.map((g) => `${g.name} (${g.count} lines)`).join('; ')}.
              Combine them into one line each, with the quantities added up.
            </span>
            <Button size="sm" onClick={combineDuplicates}>
              Combine duplicates
            </Button>
          </div>
        </Alert>
      )}
      {!readOnly && differing.length > 0 && (
        <Alert tone="amber">
          <b>Check these repeated products:</b> {differing.map((g) => g.name).join('; ')}: they are on more than one line at a different
          price or unit, so they are not combined automatically.
        </Alert>
      )}

      <Card className="p-4 space-y-4">
        <SectionTitle>Details</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <FormField label="Customer *">
              <Select2 value={customerId == null ? '' : String(customerId)} onChange={(v) => setCustomerId(v ? Number(v) : null)} options={customerOptions} disabled={readOnly} />
            </FormField>
          </div>
          <FormField label="Branch">
            <BranchSelect value={branchId} onChange={setBranchId} includeAll disabled={readOnly} />
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
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Quotation date">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={readOnly} />
          </FormField>
          <FormField label="Valid for (days)">
            <Input type="number" min="1" max="365" step="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} className="font-mono" disabled={readOnly} />
          </FormField>
          <FormField label="Status">
            <Select2
              value={status}
              onChange={(v) => setStatus(v as QuotationStatus)}
              options={(Object.keys(QUOTATION_STATUS_LABEL) as QuotationStatus[]).map((s) => ({ value: s, label: QUOTATION_STATUS_LABEL[s] }))}
              searchable={false}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>VAT</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={chargeVat} onChange={(e) => setChargeVat(e.target.checked)} disabled={readOnly} className="h-4 w-4 mt-0.5 rounded border-border" />
            <span>
              Charge VAT on this quotation
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
              disabled={readOnly || !chargeVat}
            />
          </FormField>
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
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-lg border border-border p-2.5">
              <div className="col-span-12 lg:col-span-6">
                <FormField label={i === 0 ? 'Item description' : ''}>
                  {l.bookId == null && l.free ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={l.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        placeholder="Type the item description, e.g. Delivery charge"
                        aria-label={`Item description, line ${i + 1}`}
                        className="flex-1"
                        autoFocus={!l.description}
                        disabled={readOnly}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            if (l.description.trim() && !window.confirm(`Replace "${l.description.trim()}" with a product from the list?`)) return;
                            setLine(i, { free: false, description: '' });
                          }}
                          className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                        >
                          Pick a product
                        </button>
                      )}
                    </div>
                  ) : (
                    <Select2
                      value={l.bookId == null ? '' : String(l.bookId)}
                      onChange={(v) => chooseBook(i, v)}
                      options={bookOptions}
                      placeholder="Search for a product…"
                      ariaLabel={`Product, line ${i + 1}`}
                      displayLabel={l.bookId != null && l.description ? l.description : undefined}
                      wrap
                      disabled={readOnly}
                    />
                  )}
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'Qty' : ''}>
                  <Input type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="font-mono" disabled={readOnly} aria-label={`Quantity, line ${i + 1}`} />
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'Unit' : ''}>
                  <Select2 value={l.unit} onChange={(v) => setLine(i, { unit: v })} options={PRODUCT_UNITS.map((u) => ({ value: u, label: u }))} searchable={false} disabled={readOnly} ariaLabel={`Unit, line ${i + 1}`} />
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'Unit price' : ''}>
                  <Input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className="font-mono" disabled={readOnly} aria-label={`Unit price, line ${i + 1}`} />
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'VAT %' : ''}>
                  <Input type="number" min="0" max="100" step="0.5" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} className="font-mono" disabled={readOnly || !chargeVat} aria-label={`VAT %, line ${i + 1}`} />
                </FormField>
              </div>
              <div className="col-span-6 lg:col-span-1 text-right">
                <div className="text-[11px] text-muted-foreground">Total</div>
                <div className="font-mono text-sm font-semibold">{money(num(l.quantity) * num(l.unitPrice))}</div>
              </div>
              <div className="col-span-2 lg:col-span-1 text-right">
                {!readOnly && lines.length > 1 && (
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
          ))}
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
        <FormField label="For the shop's records (not printed on the quotation)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who asked, follow-up date…" disabled={readOnly} />
        </FormField>
      </Card>
    </div>
  );
}
