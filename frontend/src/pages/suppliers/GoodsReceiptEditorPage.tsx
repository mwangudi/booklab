import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { money, num, today } from '../../lib/format';
import { PRODUCT_UNITS } from '../../lib/categories';
import type { Book, GoodsReceipt, Supplier } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { Alert, Button, Card, FormField, Input, Loading, Modal, PageHeader, Pill, SectionTitle, Textarea } from '../../components/ui';
import { Select2 } from '../../components/Select2';

interface Line {
  bookId: string;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
}

const blankLine = (): Line => ({ bookId: '', description: '', unit: 'Piece', quantity: '1', unitCost: '0' });

export default function GoodsReceiptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();

  const { data: grn, loading, refresh } = useApi<GoodsReceipt>(isEdit ? `/api/goods-receipts/${id}` : null, [id]);
  const { data: suppliers } = useApi<Supplier[]>('/api/goods-receipts/suppliers');
  const { data: books } = useApi<Book[]>('/api/books');

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [receivedAt, setReceivedAt] = useState(today());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [postOpen, setPostOpen] = useState(false);

  const readOnly = grn?.status === 'POSTED';

  useEffect(() => {
    if (!grn) return;
    setSupplierId(grn.supplierId);
    setBranchId(grn.branchId);
    setDeliveryNoteNo(grn.deliveryNoteNo ?? '');
    setInvoiceNo(grn.invoiceNo ?? '');
    setReceivedAt(grn.receivedAt.slice(0, 10));
    setNotes(grn.notes ?? '');
    setLines(
      (grn.items ?? []).map((i) => ({
        bookId: String(i.bookId),
        description: i.description,
        unit: i.unit,
        quantity: String(i.quantity),
        unitCost: String(num(i.unitCost)),
      })),
    );
  }, [grn]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /** Choosing a product carries its description, unit and last known cost across. */
  const chooseBook = (i: number, v: string) => {
    const b = books?.find((x) => String(x.id) === v);
    if (!b) return setLine(i, { bookId: '' });
    setLine(i, { bookId: v, description: b.title, unit: b.unit || 'Piece', unitCost: String(num(b.costPrice)) });
  };

  const total = useMemo(() => lines.reduce((s, l) => s + num(l.quantity) * num(l.unitCost), 0), [lines]);

  const save = async () => {
    setError(null);
    if (!supplierId) return setError('Choose the supplier.');
    if (!branchId) return setError('Choose the branch receiving the goods.');
    const items = lines
      .filter((l) => l.bookId && num(l.quantity) > 0)
      .map((l) => ({
        bookId: Number(l.bookId),
        description: l.description.trim(),
        unit: l.unit,
        quantity: Math.round(num(l.quantity)),
        unitCost: num(l.unitCost),
      }));
    if (items.length === 0) return setError('Add at least one product with a quantity.');

    const body = { supplierId, branchId, deliveryNoteNo: deliveryNoteNo.trim() || null, invoiceNo: invoiceNo.trim() || null, receivedAt, notes: notes.trim() || null, items };
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/goods-receipts/${id}`, body);
        refresh();
      } else {
        const created = await api.post<GoodsReceipt>('/api/goods-receipts', body);
        navigate(`/goods-receipts/${created.id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the goods receipt.');
    } finally {
      setSaving(false);
    }
  };

  const post = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/goods-receipts/${id}/post`);
      setPostOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post the goods receipt.');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <Loading />;

  const bookOptions = [
    { value: '', label: 'Choose a product…' },
    ...(books ?? []).map((b) => ({ value: String(b.id), label: `${b.title} — ${b.sku}` })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? `Goods receipt ${grn?.number ?? ''}` : 'Receive goods'}
        subtitle="Key in the supplier's delivery note. Posting adds the quantities to branch stock."
        right={
          <>
            <Button variant="outline" onClick={() => navigate('/goods-receipts')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {!readOnly && (
              <Button onClick={save} loading={saving}>
                <Save className="h-4 w-4" /> {isEdit ? 'Save draft' : 'Create draft'}
              </Button>
            )}
            {isEdit && !readOnly && (
              <Button onClick={() => setPostOpen(true)}>
                <CheckCircle2 className="h-4 w-4" /> Post to stock
              </Button>
            )}
          </>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}
      {readOnly ? (
        <Alert tone="green">
          Posted{grn?.postedAt ? ` on ${grn.postedAt.slice(0, 10)}` : ''}. The quantities are now in {grn?.branch?.name} stock
          and appear in the stock history as intake.
        </Alert>
      ) : (
        <Alert tone="amber">This is a draft. Nothing reaches stock until you post it.</Alert>
      )}

      <Card className="p-4 space-y-4">
        <SectionTitle>Delivery</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <FormField label="Supplier *">
              <Select2
                value={supplierId == null ? '' : String(supplierId)}
                onChange={(v) => setSupplierId(v ? Number(v) : null)}
                options={[{ value: '', label: 'Choose a supplier…' }, ...(suppliers ?? []).map((s) => ({ value: String(s.id), label: s.name }))]}
                disabled={readOnly}
              />
            </FormField>
          </div>
          <FormField label="Receiving branch *">
            <BranchSelect value={branchId} onChange={setBranchId} />
          </FormField>
          <FormField label="Date received">
            <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} disabled={readOnly} />
          </FormField>
          <FormField label="Their delivery note no." hint="As printed on the supplier's note.">
            <Input value={deliveryNoteNo} onChange={(e) => setDeliveryNoteNo(e.target.value)} className="font-mono" disabled={readOnly} />
          </FormField>
          <FormField label="Their invoice no." hint="Used to reconcile their statement.">
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="font-mono" disabled={readOnly} />
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
          Items received
        </SectionTitle>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-lg border border-border p-2.5">
              <div className="col-span-12 lg:col-span-4">
                <FormField label={i === 0 ? 'Product' : ''}>
                  <Select2 value={l.bookId} onChange={(v) => chooseBook(i, v)} options={bookOptions} disabled={readOnly} />
                </FormField>
              </div>
              <div className="col-span-12 lg:col-span-3">
                <FormField label={i === 0 ? 'Description on the note' : ''}>
                  <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} disabled={readOnly} />
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'Qty' : ''}>
                  <Input type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="font-mono" disabled={readOnly} />
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'Unit' : ''}>
                  <Select2
                    value={l.unit}
                    onChange={(v) => setLine(i, { unit: v })}
                    options={PRODUCT_UNITS.map((u) => ({ value: u, label: u }))}
                    searchable={false}
                    disabled={readOnly}
                  />
                </FormField>
              </div>
              <div className="col-span-4 lg:col-span-1">
                <FormField label={i === 0 ? 'Unit cost' : ''}>
                  <Input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} className="font-mono" disabled={readOnly} />
                </FormField>
              </div>
              <div className="col-span-10 lg:col-span-1 text-right">
                <div className="text-[11px] text-muted-foreground">Total</div>
                <div className="font-mono text-sm font-semibold">{money(num(l.quantity) * num(l.unitCost))}</div>
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
          <div className="w-full sm:w-72 flex justify-between border-t border-border pt-3 text-base font-semibold">
            <span>Total cost</span>
            <span className="font-mono">{money(total)}</span>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <SectionTitle>Notes</SectionTitle>
        <FormField label="Internal notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Damaged cartons, short delivery, anything worth recording." disabled={readOnly} />
        </FormField>
        {grn && <Pill tone={grn.status === 'POSTED' ? 'green' : 'amber'}>{grn.status.toLowerCase()}</Pill>}
      </Card>

      <Modal
        open={postOpen}
        onClose={() => setPostOpen(false)}
        title="Post goods to stock"
        footer={
          <>
            <Button variant="outline" onClick={() => setPostOpen(false)}>
              Cancel
            </Button>
            <Button onClick={post} loading={saving}>
              <CheckCircle2 className="h-4 w-4" /> Post to stock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="amber">
            This adds every line to <b>{grn?.branch?.name}</b> stock as an attributable intake movement and books{' '}
            <b>{money(total)}</b> as owed to {grn?.supplier?.name}. It cannot be edited afterwards.
          </Alert>
          <p className="text-xs text-muted-foreground">
            Product cost prices are updated to the costs on this delivery, so margins stay accurate.
          </p>
        </div>
      </Modal>
    </div>
  );
}
