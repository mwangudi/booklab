import { Link } from 'react-router-dom';
import { Boxes, PackagePlus, Plus, ReceiptText, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { fmt, money, startOfMonth, today } from '../lib/format';
import type { PnlReport, StockValuation, TodayByBranch } from '../types';
import { Button, Card, KpiCard, Loading, PageHeader, Pill, SectionTitle, Table, Td, Th } from '../components/ui';

export default function DashboardPage() {
  const { user, canManage } = useAuth();
  const { data: todayRows, loading: l1 } = useApi<TodayByBranch[]>('/api/sales/today-by-branch');
  const { data: valuation, loading: l2 } = useApi<StockValuation>('/api/stock/valuation');
  const pnlPath = canManage ? `/api/reports/pnl?from=${startOfMonth()}&to=${today()}T23:59:59` : null;
  const { data: pnl } = useApi<PnlReport>(pnlPath);

  const todaysRevenue = (todayRows ?? []).reduce((s, r) => s + r.net, 0);
  const todaysTxns = (todayRows ?? []).reduce((s, r) => s + r.txn, 0);
  const totals = valuation?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle="Here’s how the shop is doing today."
        right={
          <>
            <Link to="/pos">
              <Button>
                <ShoppingCart className="h-4 w-4" /> New sale
              </Button>
            </Link>
            <Link to="/stock/intake">
              <Button variant="outline">
                <PackagePlus className="h-4 w-4" /> Add stock
              </Button>
            </Link>
          </>
        }
      />

      {l1 || l2 ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Today’s sales"
              value={money(todaysRevenue)}
              sub={`${todaysTxns} transaction${todaysTxns === 1 ? '' : 's'}`}
              tone="green"
              icon={<ReceiptText className="h-4 w-4" />}
              filled
            />
            <KpiCard
              label="Stock value (retail)"
              value={money(totals?.retailValue ?? 0)}
              sub={`${fmt(totals?.units ?? 0)} units · ${fmt(totals?.skuCount ?? 0)} SKUs`}
              tone="blue"
              icon={<Boxes className="h-4 w-4" />}
            />
            <KpiCard
              label="Stock at cost"
              value={money(totals?.costValue ?? 0)}
              sub="Inventory cost value"
              tone="purple"
              icon={<Wallet className="h-4 w-4" />}
            />
            <KpiCard
              label="Low / out of stock"
              value={`${fmt(totals?.lowCount ?? 0)} / ${fmt(totals?.outCount ?? 0)}`}
              sub="Items needing a reorder"
              tone={(totals?.outCount ?? 0) > 0 ? 'red' : 'amber'}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          {canManage && pnl && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Revenue (MTD)" value={money(pnl.summary.revenue)} tone="blue" />
              <KpiCard label="Gross profit (MTD)" value={money(pnl.summary.grossProfit)} tone="green" />
              <KpiCard label="Expenses (MTD)" value={money(pnl.summary.expenses)} tone="amber" />
              <KpiCard
                label="Net profit (MTD)"
                value={money(pnl.summary.netProfit)}
                tone={pnl.summary.netProfit >= 0 ? 'green' : 'red'}
              />
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <SectionTitle right={<Link to="/sales" className="text-xs text-primary hover:underline">View all</Link>}>
                Today’s sales by branch
              </SectionTitle>
              {(todayRows?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No sales recorded yet today.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Branch</Th>
                      <Th num>Txns</Th>
                      <Th num>Net sales</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayRows!.map((r) => (
                      <tr key={r.branchId}>
                        <Td>{r.name}</Td>
                        <Td num>{fmt(r.txn)}</Td>
                        <Td num>{money(r.net)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card className="p-5">
              <SectionTitle right={<Link to="/stock" className="text-xs text-primary hover:underline">Manage stock</Link>}>
                Stock valuation by branch
              </SectionTitle>
              {(valuation?.branches?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No stock recorded yet.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Branch</Th>
                      <Th num>SKUs</Th>
                      <Th num>Retail value</Th>
                      <Th>Alerts</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuation!.branches.map((b) => (
                      <tr key={b.branchId}>
                        <Td>{b.name}</Td>
                        <Td num>{fmt(b.skuCount)}</Td>
                        <Td num>{money(b.retailValue)}</Td>
                        <Td>
                          <div className="flex gap-1">
                            {b.lowCount > 0 && <Pill tone="amber">{b.lowCount} low</Pill>}
                            {b.outCount > 0 && <Pill tone="red">{b.outCount} out</Pill>}
                            {b.lowCount === 0 && b.outCount === 0 && <Pill tone="green">OK</Pill>}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle>Quick actions</SectionTitle>
            <div className="flex flex-wrap gap-3">
              <Link to="/pos"><Button variant="outline"><ShoppingCart className="h-4 w-4" /> Sell items</Button></Link>
              <Link to="/products/new"><Button variant="outline"><Plus className="h-4 w-4" /> New product</Button></Link>
              <Link to="/stock/intake"><Button variant="outline"><PackagePlus className="h-4 w-4" /> Receive stock</Button></Link>
              {canManage && <Link to="/expenses/new"><Button variant="outline"><Wallet className="h-4 w-4" /> Record expense</Button></Link>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
