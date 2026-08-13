import { useState } from 'react';
import { Laptop, Plus, ShieldOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Branch } from '../types';
import {
  Alert, Button, Card, FormField, Input, Loading, Modal, PageHeader, Pill, RowAction, RowActions,
} from '../components/ui';
import { Select2 } from '../components/Select2';
import { DataTable, type Column } from '../components/DataTable';
import { dateTime } from '../lib/format';

interface SyncToken {
  id: number;
  branchId: number;
  label: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  branch: { name: string; code: string };
}

export default function SyncTokensPage() {
  const { data: tokens, loading, refresh } = useApi<SyncToken[]>('/api/sync/tokens');
  const { data: branches } = useApi<Branch[]>('/api/branches');

  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [label, setLabel] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ token: string; branchName: string } | null>(null);
  const [revoking, setRevoking] = useState<SyncToken | null>(null);

  const issue = async () => {
    setError(null);
    if (!branchId) return setError('Choose the branch this laptop belongs to.');
    setIssuing(true);
    try {
      const r = await api.post<{ token: string; branchName: string }>('/api/sync/token', {
        branchId: Number(branchId),
        label: label.trim() || 'Branch laptop',
      });
      setIssued({ token: r.token, branchName: r.branchName });
      setOpen(false);
      setBranchId('');
      setLabel('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not issue the token.');
    } finally {
      setIssuing(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    try {
      await api.post(`/api/sync/tokens/${revoking.id}/revoke`);
      refresh();
    } finally {
      setRevoking(null);
    }
  };

  const columns: Column<SyncToken>[] = [
    {
      key: 'branch', header: 'Branch', sortable: true, accessor: (t) => t.branch.name,
      render: (t) => (
        <div>
          <div className="font-medium text-foreground">{t.branch.name}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{t.branch.code}</div>
        </div>
      ),
    },
    { key: 'label', header: 'Machine', sortable: true, accessor: (t) => t.label },
    {
      key: 'status', header: 'Status', sortable: true, accessor: (t) => (t.active ? 'Active' : 'Revoked'),
      render: (t) => (t.active ? <Pill tone="green">Active</Pill> : <Pill tone="red">Revoked</Pill>),
    },
    {
      key: 'lastUsedAt', header: 'Last synced', sortable: true, accessor: (t) => t.lastUsedAt ?? '',
      render: (t) => (t.lastUsedAt ? dateTime(t.lastUsedAt) : <span className="text-muted-foreground">never</span>),
    },
    { key: 'createdAt', header: 'Issued', sortable: true, accessor: (t) => t.createdAt, render: (t) => dateTime(t.createdAt) },
    {
      key: 'actions', header: '', align: 'right',
      render: (t) =>
        t.active ? (
          <RowActions>
            <RowAction label="Revoke" tone="danger" onClick={() => setRevoking(t)} icon={<ShieldOff className="h-4 w-4" />} />
          </RowActions>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Branch sync"
        subtitle="Credentials that let a branch laptop trade offline and reconcile with the shop."
      />

      <Alert tone="amber">
        A token is shown once, when it is issued. If a laptop is lost or replaced, revoke its token here — it stops
        syncing immediately, and no one else is signed out.
      </Alert>

      {issued && (
        <Card className="p-4 border-[#1a7a4a]/30 bg-[#e8f5ee]">
          <h3 className="text-sm font-semibold text-[#1a7a4a] mb-1">Token for {issued.branchName}</h3>
          <p className="text-xs text-[#1a7a4a] mb-2">
            Copy this into <span className="font-mono">backend/.env</span> on that laptop as{' '}
            <span className="font-mono">SYNC_TOKEN</span>. It will not be shown again.
          </p>
          <textarea
            readOnly
            value={issued.token}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full h-24 rounded-lg border border-[#1a7a4a]/30 bg-background p-2 text-[11px] font-mono"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setIssued(null)}>
              I have copied it
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={tokens ?? []}
            columns={columns}
            searchable={(t) => `${t.branch.name} ${t.branch.code} ${t.label}`}
            searchPlaceholder="Search branch or machine…"
            emptyText="No branch has been set up for offline trading yet."
            rowKey={(t) => t.id}
            actionSlot={
              <Button onClick={() => { setOpen(true); setError(null); }}>
                <Plus className="h-4 w-4" /> Issue token
              </Button>
            }
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Issue a sync token"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={issue} loading={issuing}>
              <Laptop className="h-4 w-4" /> Issue
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <FormField label="Branch *">
            <Select2
              value={branchId}
              onChange={setBranchId}
              options={(branches ?? []).map((b) => ({ value: String(b.id), label: `${b.name} (${b.code})` }))}
              placeholder="Choose a branch…"
            />
          </FormField>
          <FormField label="Machine" hint="Which laptop this is for, so you know which one to revoke later.">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Front till laptop" maxLength={80} />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke this token?"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" onClick={revoke}>
              <ShieldOff className="h-4 w-4" /> Revoke
            </Button>
          </>
        }
      >
        {revoking && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">{revoking.branch.name}</div>
              <div className="text-[11px] text-muted-foreground">{revoking.label}</div>
            </div>
            <Alert tone="amber">
              That laptop stops syncing at once. Anything it has not yet sent stays on it until you issue a new token and
              put that in place.
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}
