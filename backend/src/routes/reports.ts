import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole, branchScope } from '../middleware/authGuard.js';

/**
 * Reporting endpoints — server-side aggregates that respect branch scoping.
 *   GET /pnl?from=&to=&branchId=    profit & loss (revenue, COGS, gross, expenses, net)
 *   GET /sales?from=&to=&branchId=  sales summary + consolidated by branch + detail rows
 *   GET /stock?branchId=            current stock valuation snapshot
 */
export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);

  app.get('/pnl', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { from, to, branchId } = req.query as { from?: string; to?: string; branchId?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    const dateFilter = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };

    const sales = await app.prisma.sale.findMany({
      where: { branchId: scoped, createdAt: dateFilter, voidedAt: null },
      include: { items: true, branch: { select: { id: true, name: true } } },
      take: 20000,
    });
    const expenses = await app.prisma.expense.findMany({
      where: { branchId: scoped, incurredAt: dateFilter },
      include: { branch: { select: { id: true, name: true } } },
      take: 20000,
    });

    type Agg = { branchId: number | null; name: string; revenue: number; cogs: number; expenses: number };
    const byBranch = new Map<number | null, Agg>();
    const ensure = (id: number | null, name: string) => {
      let a = byBranch.get(id);
      if (!a) { a = { branchId: id, name, revenue: 0, cogs: 0, expenses: 0 }; byBranch.set(id, a); }
      return a;
    };

    let revenue = 0, cogs = 0, expenseTotal = 0;
    for (const s of sales) {
      const rev = Number(s.total);
      const cost = s.items.reduce((a, i) => a + i.quantity * Number(i.costPrice), 0);
      revenue += rev; cogs += cost;
      const a = ensure(s.branch.id, s.branch.name);
      a.revenue += rev; a.cogs += cost;
    }
    for (const e of expenses) {
      const amt = Number(e.amount);
      expenseTotal += amt;
      const a = ensure(e.branch?.id ?? null, e.branch?.name ?? 'HQ / unassigned');
      a.expenses += amt;
    }

    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenseTotal;

    return {
      summary: {
        revenue,
        cogs,
        grossProfit,
        grossMargin: revenue ? grossProfit / revenue : 0,
        expenses: expenseTotal,
        netProfit,
        netMargin: revenue ? netProfit / revenue : 0,
      },
      byBranch: [...byBranch.values()].map((a) => ({ ...a, grossProfit: a.revenue - a.cogs, netProfit: a.revenue - a.cogs - a.expenses })).sort((x, y) => y.netProfit - x.netProfit),
      byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    };
  });

  app.get('/sales', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { from, to, branchId } = req.query as { from?: string; to?: string; branchId?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    const sales = await app.prisma.sale.findMany({
      where: { branchId: scoped, createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined }, voidedAt: null },
      include: { items: { include: { book: { select: { title: true, sku: true } } } }, branch: { select: { id: true, name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    let revenue = 0, itemsSold = 0;
    const byBranch = new Map<number, { branchId: number; name: string; txns: number; revenue: number }>();
    const rows = sales.slice(0, 1000).map((s) => {
      const rev = Number(s.total);
      revenue += rev;
      const bb = byBranch.get(s.branch.id) ?? { branchId: s.branch.id, name: s.branch.name, txns: 0, revenue: 0 };
      bb.txns += 1; bb.revenue += rev; byBranch.set(s.branch.id, bb);
      const items = s.items.reduce((a, i) => a + i.quantity, 0);
      itemsSold += items;
      return { id: s.id, date: s.createdAt, branch: s.branch.name, cashier: s.user?.name ?? '—', payment: s.paymentMethod, items, total: rev };
    });
    return {
      summary: { revenue, txns: sales.length, itemsSold, avgBasket: sales.length ? revenue / sales.length : 0 },
      byBranch: [...byBranch.values()].sort((a, b) => b.revenue - a.revenue),
      rows,
    };
  });

  app.get('/stock', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { branchId } = req.query as { branchId?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    const branchWhere = scoped == null ? {} : { id: scoped };
    const branches = await app.prisma.branch.findMany({ where: branchWhere, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    const stock = await app.prisma.stock.findMany({
      where: { branchId: { in: branches.map((b) => b.id) }, book: { deletedAt: null } },
      include: { book: { select: { title: true, sku: true, unitPrice: true, costPrice: true } }, branch: { select: { name: true } } },
      orderBy: [{ branch: { name: 'asc' } }, { book: { title: 'asc' } }],
    });
    const LOW = 5;
    let retailValue = 0, costValue = 0, units = 0;
    const rows = stock.map((r) => {
      const unitPrice = Number(r.price ?? r.book.unitPrice);
      const value = r.quantity * unitPrice;
      retailValue += value; costValue += r.quantity * Number(r.book.costPrice); units += r.quantity;
      return { branch: r.branch.name, title: r.book.title, sku: r.book.sku, quantity: r.quantity, unitPrice, value, status: r.quantity <= 0 ? 'Out of stock' : r.quantity < LOW ? 'Low stock' : 'OK' };
    });
    return { summary: { skuCount: stock.length, units, retailValue, costValue }, rows: rows.slice(0, 5000) };
  });

  // Daily cash-up (Z-report): what each payment method and cashier took at a branch on one day.
  app.get('/zreport', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { date, branchId } = req.query as { date?: string; branchId?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    const day = date ? new Date(`${date}T00:00:00`) : new Date();
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);

    const [sales, voided, expenses] = await Promise.all([
      app.prisma.sale.findMany({
        where: { branchId: scoped, createdAt: { gte: start, lte: end }, voidedAt: null },
        include: { items: true, user: { select: { id: true, name: true } }, branch: { select: { name: true } } },
      }),
      app.prisma.sale.findMany({
        where: { branchId: scoped, createdAt: { gte: start, lte: end }, NOT: { voidedAt: null } },
        include: { voidedBy: { select: { name: true } } },
      }),
      app.prisma.expense.findMany({ where: { branchId: scoped, incurredAt: { gte: start, lte: end } } }),
    ]);

    const byMethod = new Map<string, { method: string; txns: number; amount: number }>();
    const byCashier = new Map<number, { name: string; txns: number; amount: number }>();
    let revenue = 0, cogs = 0, itemsSold = 0, discounts = 0;

    for (const s of sales) {
      const amt = Number(s.total);
      revenue += amt;
      discounts += Number(s.discount ?? 0);
      cogs += s.items.reduce((a, i) => a + i.quantity * Number(i.costPrice), 0);
      itemsSold += s.items.reduce((a, i) => a + i.quantity, 0);
      const m = byMethod.get(s.paymentMethod) ?? { method: s.paymentMethod, txns: 0, amount: 0 };
      m.txns += 1; m.amount += amt; byMethod.set(s.paymentMethod, m);
      const c = byCashier.get(s.userId) ?? { name: s.user?.name ?? `User #${s.userId}`, txns: 0, amount: 0 };
      c.txns += 1; c.amount += amt; byCashier.set(s.userId, c);
    }

    const cashTaken = byMethod.get('CASH')?.amount ?? 0;
    const cashExpenses = expenses.reduce((a, e) => a + Number(e.amount), 0);

    return {
      date: start.toISOString().slice(0, 10),
      branch: sales[0]?.branch?.name ?? null,
      summary: {
        revenue,
        cogs,
        grossProfit: revenue - cogs,
        txns: sales.length,
        itemsSold,
        avgBasket: sales.length ? revenue / sales.length : 0,
        discounts,
        voidedCount: voided.length,
        voidedAmount: voided.reduce((a, s) => a + Number(s.total), 0),
        expenses: cashExpenses,
        expectedCash: cashTaken - cashExpenses,
      },
      byMethod: [...byMethod.values()].sort((a, b) => b.amount - a.amount),
      byCashier: [...byCashier.values()].sort((a, b) => b.amount - a.amount),
      voids: voided.map((s) => ({ id: s.id, total: Number(s.total), reason: s.voidReason, by: s.voidedBy?.name ?? '—', at: s.voidedAt })),
    };
  });

  // Re-order list: everything at or below the low-stock threshold.
  app.get('/low-stock', { preHandler: requireRole('ADMIN', 'MANAGER') }, async (req, reply) => {
    const { branchId, threshold } = req.query as { branchId?: string; threshold?: string };
    const scoped = branchScope(req, reply, branchId ? Number(branchId) : undefined);
    const limit = Math.max(0, Number(threshold ?? 5) || 5);
    const rows = await app.prisma.stock.findMany({
      where: { branchId: scoped, quantity: { lte: limit }, book: { deletedAt: null } },
      include: {
        book: { select: { title: true, sku: true, category: true, unitPrice: true, costPrice: true } },
        branch: { select: { name: true } },
      },
      orderBy: [{ quantity: 'asc' }],
      // One row per product per branch, so this has to clear catalogue x branches.
      take: 20000,
    });
    const mapped = rows.map((r) => ({
      branch: r.branch.name,
      title: r.book.title,
      sku: r.book.sku,
      category: r.book.category ?? '—',
      quantity: r.quantity,
      unitPrice: Number(r.price ?? r.book.unitPrice),
      costPrice: Number(r.book.costPrice),
      suggestedOrder: Math.max(limit * 2 - r.quantity, 0),
      status: r.quantity <= 0 ? 'Out of stock' : 'Low stock',
    }));
    return {
      threshold: limit,
      summary: {
        skuCount: mapped.length,
        outCount: mapped.filter((r) => r.quantity <= 0).length,
        lowCount: mapped.filter((r) => r.quantity > 0).length,
        reorderCost: mapped.reduce((a, r) => a + r.suggestedOrder * r.costPrice, 0),
      },
      rows: mapped,
    };
  });
}
