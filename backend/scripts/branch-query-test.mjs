// Exercises the query shapes the routes rely on against the SQLite branch client,
// to catch anything MySQL supports but SQLite does not.
// Run from backend/:  node scripts/branch-query-test.mjs

import { PrismaClient } from '../generated/prisma-sqlite/index.js';
import { randomUUID } from 'node:crypto';

const db = new PrismaClient({ datasources: { db: { url: process.env.BRANCH_DATABASE_URL ?? 'file:./branch-test.db' } } });
const results = [];
const check = async (name, fn) => {
  try {
    const out = await fn();
    results.push(['ok', name, out]);
  } catch (e) {
    const msg = String(e.message).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4).join(' | ');
    results.push(['FAIL', name, msg]);
  }
};

try {
  const book = await db.book.findFirst();
  const branch = await db.branch.findFirst();
  const user = await db.user.findFirst();

  await check('book search (contains, OR)', async () =>
    (await db.book.findMany({
      where: { deletedAt: null, OR: [{ title: { contains: 'pen' } }, { sku: { contains: 'BK' } }] },
      take: 5,
    })).length + ' rows');

  await check('best sellers: saleItem.groupBy + _sum + relation filter', async () =>
    JSON.stringify(await db.saleItem.groupBy({
      by: ['bookId'],
      where: { sale: { branchId: branch.id, voidedAt: null, createdAt: { gte: new Date('2000-01-01') } } },
      _sum: { quantity: true },
    })));

  await check('sale aggregate (_sum/_count) for reports', async () =>
    JSON.stringify(await db.sale.aggregate({ _sum: { total: true, discount: true }, _count: true })));

  await check('expense groupBy category', async () =>
    JSON.stringify(await db.expense.groupBy({ by: ['category'], _sum: { amount: true } })));

  await check('stock.upsert on compound unique', async () => {
    const s = await db.stock.upsert({
      where: { branchId_bookId: { branchId: branch.id, bookId: book.id } },
      create: { branchId: branch.id, bookId: book.id, quantity: 0 },
      update: {},
    });
    return 'qty ' + s.quantity;
  });

  await check('Decimal arithmetic round-trips', async () => {
    const b = await db.book.findUnique({ where: { id: book.id } });
    return `${b.unitPrice} * 3 = ${Number(b.unitPrice) * 3} (vat ${b.vatRate})`;
  });

  await check('createMany (invoice/GRN/payroll use it)', async () => {
    const c = await db.customer.create({
      data: { uuid: randomUUID(), name: 'SQLite probe', type: 'SCHOOL', chargeVat: false, vatMode: 'EXCLUSIVE', openingBalance: 0 },
    });
    const inv = await db.invoice.create({
      data: {
        number: 'TEST-' + Date.now(), customerId: c.id, branchId: branch.id,
        createdById: user.id, status: 'DRAFT', subtotal: 0, vatTotal: 0, total: 0, chargeVat: false, vatMode: 'EXCLUSIVE',
      },
    });
    await db.invoiceItem.createMany({
      data: [
        { invoiceId: inv.id, bookId: book.id, description: 'a', unit: 'Piece', quantity: 1, unitPrice: 10, vatRate: 0, netAmount: 10, vatAmount: 0, total: 10, sortOrder: 0 },
        { invoiceId: inv.id, bookId: book.id, description: 'b', unit: 'Piece', quantity: 2, unitPrice: 10, vatRate: 0, netAmount: 20, vatAmount: 0, total: 20, sortOrder: 1 },
      ],
    });
    const n = await db.invoiceItem.count({ where: { invoiceId: inv.id } });
    await db.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
    await db.invoice.delete({ where: { id: inv.id } });
    await db.customer.delete({ where: { id: c.id } });
    return n + ' rows created';
  });

  await check('nested include used by the POS/stock screens', async () =>
    (await db.stock.findMany({ where: { branchId: branch.id }, include: { book: true }, take: 3 })).length + ' rows');

  await check('date range filter used by reports', async () =>
    (await db.sale.findMany({ where: { createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') } }, take: 5 })).length + ' rows');
} finally {
  await db.$disconnect();
}

let bad = 0;
for (const [status, name, detail] of results) {
  if (status === 'FAIL') bad += 1;
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name}\n        ${detail}`);
}
console.log(`\n${results.length - bad}/${results.length} query shapes work on SQLite`);
process.exit(bad ? 1 : 0);
