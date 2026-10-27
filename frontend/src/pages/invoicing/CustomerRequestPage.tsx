import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, MapPin, Phone } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { useCan } from '../../lib/permissions';
import { dateTime, fmt } from '../../lib/format';
import type { Customer } from '../../types';
import { BranchSelect } from '../../components/BranchSelect';
import { Select2 } from '../../components/Select2';
import { Alert, Button, Card, FormField, Loading, PageHeader, Pill, SectionTitle, Select, Table, Td, Th } from '../../components/ui';
import { REQUEST_TONE, type CustomerRequestRow } from './CustomerRequestsPage';

interface Detail extends CustomerRequestRow {
  handledBy: string | null;
  invoice: { id: number; number: string; status: string } | null;
  items: Array<{ id: number; bookId: number; title: string; quantity: number; onHand: number; book: { sku: string; unit: string; deletedAt: string | null } }>;
}

/** One website request: who asked, for what, and turning it into an invoice. */
export default function CustomerRequestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, branchId: myBranch } = useAuth();
  const can = useCan();
  const { data: r, loading, refresh } = useApi<Detail>(`/api/requests/${id}`, [id]);
  const { data: customers } = useApi<Customer[]>('/api/invoices/customers');
  const [customerId, setCustomerId] = useState<string>('');
  const [branchId, setBranchId] = useState<number | null>(isAdmin ? null : myBranch);
  const [tier, setTier] = useState('SCHOOL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (status: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/requests/${id}`, { status });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the request.');
    } finally {
      setBusy(false);
    }
  };

  const makeInvoice = async (createCustomer: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ invoice: { id: number }; unpriced: string[] }>(`/api/invoices/from-request/${id}`, {
        customerId: createCustomer ? undefined : Number(customerId),
        createCustomer: createCustomer || undefined,
        branchId: isAdmin ? branchId : undefined,
        priceTier: tier,
      });
      navigate(`/invoices/${res.invoice.id}`, { state: { unpriced: res.unpriced } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not make the invoice.');
      setBusy(false);
    }
  };

  if (loading || !r) return <Loading />;
  const done = r.status === 'INVOICED';
  const short = r.items.filter((i) => i.onHand < i.quantity);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Website request ${r.number}`}
        subtitle={`Received ${dateTime(r.createdAt)}${r.handledBy ? ` · handled by ${r.handledBy}` : ''}`}
        right={
          <Link to="/requests">
            <Button variant="outline"><ArrowLeft className="h-4 w-4" /> All requests</Button>
          </Link>
        }
      />
      {error && <Alert tone="red">{error}</Alert>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 space-y-2 lg:col-span-1">
          <SectionTitle right={<Pill tone={REQUEST_TONE[r.status]}>{r.status.toLowerCase()}</Pill>}>From</SectionTitle>
          <div className="font-semibold">{r.organisation || r.name}</div>
          {r.organisation && <div className="text-sm">{r.name}</div>}
          <div className="text-sm flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a></div>
          {r.email && <div className="text-sm flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a></div>}
          <div className="text-sm flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />{r.location}</div>
          {r.preferredBranch && <div className="text-sm">Preferred branch: <b>{r.preferredBranch}</b></div>}
          {r.note && <div className="rounded-md bg-muted/60 p-2 text-sm whitespace-pre-wrap">{r.note}</div>}
          {!done && can('invoice.create') && (
            <div className="flex flex-wrap gap-2 pt-2">
              {r.status === 'NEW' && <Button variant="outline" onClick={() => setStatus('CONTACTED')} loading={busy}>Mark contacted</Button>}
              {r.status !== 'CANCELLED' && <Button variant="outline" onClick={() => setStatus('CANCELLED')} loading={busy}>Cancel request</Button>}
              {r.status === 'CANCELLED' && <Button variant="outline" onClick={() => setStatus('NEW')} loading={busy}>Reopen</Button>}
            </div>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <SectionTitle>Items asked for</SectionTitle>
          {r.listText && (
            <div className="mb-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">Their list, as typed on the website</div>
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{r.listText}</div>
            </div>
          )}
          {r.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No catalogue items picked — work from their list above. The invoice starts empty; add the lines in the invoice editor.</p>
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr><Th>SKU</Th><Th>Product</Th><Th num>Asked</Th><Th num>We hold</Th></tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <Td><span className="font-mono text-xs">{i.book.sku}</span></Td>
                    <Td>{i.title}{i.book.deletedAt && <span className="ml-2 text-xs text-[#9b2626]">archived</span>}</Td>
                    <Td num>{fmt(i.quantity)} {i.book.unit.toLowerCase()}</Td>
                    <Td num><span className={i.onHand < i.quantity ? 'text-[#9b2626] font-semibold' : ''}>{fmt(i.onHand)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          )}
          {short.length > 0 && (
            <p className="mt-2 text-xs text-[#8a5a00]">
              {short.length} item{short.length === 1 ? '' : 's'} asked for in a larger quantity than all branches hold together. Agree the quantities with the customer.
            </p>
          )}
        </Card>
      </div>

      {done && r.invoice ? (
        <Alert tone="green">
          Invoiced as <Link to={`/invoices/${r.invoice.id}`} className="font-semibold underline">{r.invoice.number}</Link> ({r.invoice.status.toLowerCase()}).
          Issue it, then confirm delivery when the goods go out.
        </Alert>
      ) : (
        can('invoice.create') && r.status !== 'CANCELLED' && (
          <Card className="p-4 space-y-3">
            <SectionTitle>Make the invoice</SectionTitle>
            <p className="text-sm text-muted-foreground">
              Creates a draft invoice with these items at the chosen price tier. Check it, then issue it and print the delivery
              note for transport. Items with no selling price yet come in at 0 and must be priced before the invoice can be issued.
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <FormField label="Customer">
                <Select2
                  value={customerId}
                  onChange={setCustomerId}
                  searchable
                  placeholder="Choose a customer…"
                  options={(customers ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
                />
              </FormField>
              {isAdmin && (
                <FormField label="Branch supplying it">
                  <BranchSelect value={branchId} onChange={setBranchId} />
                </FormField>
              )}
              <FormField label="Price tier">
                <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="SCHOOL">School</option>
                  <option value="WHOLESALE">Wholesale</option>
                  <option value="RETAIL">Retail</option>
                </Select>
              </FormField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => makeInvoice(false)} loading={busy} disabled={!customerId || (isAdmin && !branchId)}>
                <FileText className="h-4 w-4" /> Make invoice for this customer
              </Button>
              {can('customer.manage') && (
                <Button variant="outline" onClick={() => makeInvoice(true)} loading={busy} disabled={isAdmin && !branchId}>
                  New customer “{r.organisation || r.name}” and invoice
                </Button>
              )}
            </div>
          </Card>
        )
      )}
    </div>
  );
}
