import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Boxes, History, PackagePlus, SlidersHorizontal, Tag } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { BranchSelect, useBranches } from '../components/BranchSelect';
import { fmt, money, num } from '../lib/format';
import type { Stock } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, Modal, PageHeader, Pill, RowAction, RowActions } from '../components/ui';
import { Select2 } from '../components/Select2';

const LOW = 5;
const statusOf = (q: number) => (q <= 0 ? { label: 'Out of stock', tone: 'red' as const } : q < LOW ? { label: 'Low stock', tone: 'amber' as const } : { label: 'OK', tone: 'green' as const });

export default function StockPage() {
  const { isAdmin, canManage, branchId: myBranch } = useAuth();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(myBranch);
  const [editRow, setEditRow] = useState<Stock | null>(null);
  const [qty, setQty] = useState('');
  const [priceRow, setPriceRow] = useState<Stock | null>(null);
  const [priceVal, setPriceVal] = useState('');
  const [xferRow, setXferRow] = useState<Stock | null>(null);
  const [xferTo, setXferTo] = useState<number | null>(null);
  const [xferQty, setXferQty] = useState('');
  const [xferNote, setXferNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default admins to the first branch once the list loads.
  useEffect(() => {
    if (branchId == null && branches && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const path = branchId ? `/api/stock/branch/${branchId}` : null;
  const { data: stock, loading, refresh } = useApi<Stock[]>(path, [branchId]);
  const rows = stock ?? [];

  const totals = useMemo(() => {
    let units = 0, retail = 0, cost = 0, low = 0, out = 0;
    for (const r of rows) {
      units += r.quantity;
      retail += r.quantity * num(r.price ?? r.book.unitPrice);
      cost += r.quantity * num(r.book.costPrice);
      if (r.quantity <= 0) out += 1;
      else if (r.quantity < LOW) low += 1;
    }
    return { units, retail, cost, low, out };
  }, [rows]);

  const openEdit = (row: Stock) => {
    setEditRow(row);
    setQty(String(row.quantity));
    setError(null);
  };

  const saveQty = async () => {
    if (!editRow || !branchId) return;
    setSaving(true);
    setError(null);
    try {
      await api.put('/api/stock', { branchId, bookId: editRow.bookId, quantity: Number(qty) || 0 });
      setEditRow(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update stock.');
    } finally {
      setSaving(false);
    }
  };

  const openPrice = (row: Stock) => {
    setPriceRow(row);
    setPriceVal(row.price != null ? String(num(row.price)) : '');
    setError(null);
  };

  const openXfer = (row: Stock) => {
    setXferRow(row);
    setXferTo(null);
    setXferQty('');
    setXferNote('');
    setError(null);
  };

  const saveXfer = async () => {
    if (!xferRow || !branchId || !xferTo) {
      setError('Choose a destination branch.');
      return;
    }
    const qty = Number(xferQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Enter a whole quantity greater than zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/stock/transfer', {
        fromBranchId: branchId,
        toBranchId: xferTo,
        bookId: xferRow.bookId,
        quantity: qty,
        note: xferNote.trim() || undefined,
      });
      setXferRow(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not transfer stock.');
    } finally {
      setSaving(false);
    }
  };

  const savePrice = async (clear = false) => {
    if (!priceRow || !branchId) return;
    setSaving(true);
    setError(null);
    try {
      const price = clear || priceVal.trim() === '' ? null : Number(priceVal);
      await api.put('/api/stock/price', { branchId, bookId: priceRow.bookId, price });
      setPriceRow(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update price.');
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Stock>[] = [
    {
      key: 'title',
      header: 'Product',
      accessor: (r) => r.book.title,
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-medium text-foreground">{r.book.title}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{r.book.sku}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      accessor: (r) => r.book.category ?? '',
      render: (r) => (r.book.category ? <Pill tone="blue">{r.book.category}</Pill> : <span className="text-muted-foreground">—</span>),
    },
    { key: 'qty', header: 'On hand', align: 'right', accessor: (r) => r.quantity, sortable: true, render: (r) => <span className="font-mono font-semibold">{fmt(r.quantity)}</span> },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.quantity,
      render: (r) => {
        const s = statusOf(r.quantity);
        return <Pill tone={s.tone}>{s.label}</Pill>;
      },
    },
    {
      key: 'price',
      header: 'Unit price',
      align: 'right',
      accessor: (r) => num(r.price ?? r.book.unitPrice),
      sortable: true,
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <span className="font-mono">{money(r.price ?? r.book.unitPrice)}</span>
          {r.price != null && <Pill tone="amber">custom</Pill>}
        </div>
      ),
    },
    { key: 'value', header: 'Value', align: 'right', accessor: (r) => r.quantity * num(r.price ?? r.book.unitPrice), sortable: true, render: (r) => <span className="font-mono">{money(r.quantity * num(r.price ?? r.book.unitPrice))}</span> },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <RowActions>
          <RowAction onClick={() => openEdit(r)} icon={<SlidersHorizontal className="h-4 w-4" />} label="Set quantity (stock take)" />
          <RowAction onClick={() => openPrice(r)} icon={<Tag className="h-4 w-4" />} label="Set branch price" />
          {r.quantity > 0 && (branches?.length ?? 0) > 1 && (
            <RowAction onClick={() => openXfer(r)} icon={<ArrowLeftRight className="h-4 w-4" />} label="Transfer to another branch" />
          )}
        </RowActions>
      ),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        subtitle="On-hand quantities and inventory value."
        right={
          <div className="flex items-center gap-2">
            {isAdmin && branches && branches.length > 0 && (
              <BranchSelect value={branchId} onChange={setBranchId} className="w-48" />
            )}
            {canManage && (
              <Link to="/stock/movements">
                <Button variant="outline">
                  <History className="h-4 w-4" /> History
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Units on hand" value={fmt(totals.units)} tone="blue" icon={<Boxes className="h-4 w-4" />} />
        <KpiCard label="Retail value" value={money(totals.retail)} tone="green" />
        <KpiCard label="Cost value" value={money(totals.cost)} tone="purple" />
        <KpiCard label="Low / out" value={`${fmt(totals.low)} / ${fmt(totals.out)}`} tone={totals.out > 0 ? 'red' : 'amber'} />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(r) => `${r.book.title} ${r.book.sku} ${r.book.category ?? ''}`}
            searchPlaceholder="Search stock…"
            initialSort={{ key: 'qty', dir: 'asc' }}
            emptyText="No stock recorded for this branch yet."
            pageSize={12}
            rowKey={(r) => r.id}
            actionSlot={
              <Link to="/stock/intake">
                <Button>
                  <PackagePlus className="h-4 w-4" /> Receive stock
                </Button>
              </Link>
            }
          />
        )}
      </Card>

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="Stock take"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button onClick={saveQty} loading={saving}>
              Save quantity
            </Button>
          </>
        }
      >
        {editRow && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">{editRow.book.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{editRow.book.sku}</div>
            </div>
            {error && <Alert tone="red">{error}</Alert>}
            <FormField label="Counted quantity" hint="Sets the absolute on-hand quantity for this branch.">
              <Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="font-mono" autoFocus />
            </FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={!!priceRow}
        onClose={() => setPriceRow(null)}
        title="Branch price"
        footer={
          <>
            {priceRow?.price != null && (
              <Button variant="outline" onClick={() => savePrice(true)} loading={saving}>
                Reset to catalogue
              </Button>
            )}
            <Button variant="outline" onClick={() => setPriceRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => savePrice(false)} loading={saving}>
              Save price
            </Button>
          </>
        }
      >
        {priceRow && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">{priceRow.book.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{priceRow.book.sku}</div>
            </div>
            {error && <Alert tone="red">{error}</Alert>}
            <FormField
              label="Selling price at this branch (KES)"
              hint={`Catalogue price is ${money(priceRow.book.unitPrice)}. Leave blank to use the catalogue price.`}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={priceVal}
                onChange={(e) => setPriceVal(e.target.value)}
                className="font-mono"
                autoFocus
                placeholder={String(num(priceRow.book.unitPrice))}
              />
            </FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={!!xferRow}
        onClose={() => setXferRow(null)}
        title="Transfer stock to another branch"
        footer={
          <>
            <Button variant="outline" onClick={() => setXferRow(null)}>
              Cancel
            </Button>
            <Button onClick={saveXfer} loading={saving}>
              <ArrowLeftRight className="h-4 w-4" /> Transfer
            </Button>
          </>
        }
      >
        {xferRow && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">{xferRow.book.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{xferRow.book.sku}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                On hand at {branches?.find((b) => b.id === branchId)?.name ?? 'this branch'}: <b>{fmt(xferRow.quantity)}</b>
              </div>
            </div>
            {error && <Alert tone="red">{error}</Alert>}
            <FormField label="Send to">
              <Select2
                value={xferTo == null ? '' : String(xferTo)}
                onChange={(v) => setXferTo(v ? Number(v) : null)}
                options={[
                  { value: '', label: 'Select a branch…' },
                  ...(branches ?? []).filter((b) => b.id !== branchId).map((b) => ({ value: String(b.id), label: b.name })),
                ]}
              />
            </FormField>
            <FormField label="Quantity" hint={`Maximum ${fmt(xferRow.quantity)}.`}>
              <Input
                type="number"
                min="1"
                max={xferRow.quantity}
                value={xferQty}
                onChange={(e) => setXferQty(e.target.value)}
                className="font-mono"
              />
            </FormField>
            <FormField label="Note (optional)">
              <Input value={xferNote} onChange={(e) => setXferNote(e.target.value)} placeholder="e.g. Restocking Kapsabet for term opening" maxLength={200} />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
