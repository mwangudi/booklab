import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { dateTime, fmt } from '../../lib/format';
import { Card, KpiCard, Loading, PageHeader, Pill, Select, Table, Td, Th } from '../../components/ui';

export interface CustomerRequestRow {
  id: number;
  number: string;
  name: string;
  phone: string;
  email: string | null;
  organisation: string | null;
  location: string;
  note: string | null;
  status: 'NEW' | 'CONTACTED' | 'INVOICED' | 'CLOSED' | 'CANCELLED';
  invoiceId: number | null;
  createdAt: string;
  _count?: { items: number };
}

export const REQUEST_TONE: Record<CustomerRequestRow['status'], 'amber' | 'blue' | 'green' | 'gray' | 'red'> = {
  NEW: 'amber',
  CONTACTED: 'blue',
  INVOICED: 'green',
  CLOSED: 'gray',
  CANCELLED: 'red',
};

/** Requests sent from the website catalogue, newest first. */
export default function CustomerRequestsPage() {
  const [status, setStatus] = useState('');
  const { data, loading } = useApi<CustomerRequestRow[]>(`/api/requests${status ? `?status=${status}` : ''}`, [status]);
  const rows = data ?? [];
  const fresh = rows.filter((r) => r.status === 'NEW').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Website requests"
        subtitle="What customers asked for from the online catalogue. Open one to call them back and make the invoice."
        right={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="">All</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="INVOICED">Invoiced</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Shown" value={fmt(rows.length)} tone="blue" icon={<Inbox className="h-4 w-4" />} />
        <KpiCard label="Waiting (new)" value={fmt(fresh)} tone={fresh > 0 ? 'amber' : 'green'} />
      </div>
      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No requests yet. They appear here when customers send one from the website.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Received</Th>
                  <Th>From</Th>
                  <Th>Deliver to</Th>
                  <Th num>Items</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link to={`/requests/${r.id}`} className="font-mono font-medium text-primary hover:underline">{r.number}</Link>
                    </Td>
                    <Td>{dateTime(r.createdAt)}</Td>
                    <Td>
                      <div className="font-medium">{r.organisation || r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.organisation ? `${r.name} · ` : ''}{r.phone}</div>
                    </Td>
                    <Td>{r.location}</Td>
                    <Td num>{fmt(r._count?.items ?? 0)}</Td>
                    <Td><Pill tone={REQUEST_TONE[r.status]}>{r.status.toLowerCase()}</Pill></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
