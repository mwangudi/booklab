// What is waiting to go to the cloud, and what the branch holds locally.
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.outbox.groupBy({ by: ['entity', 'syncedAt'], _count: true });
const pending = rows.filter((r) => r.syncedAt === null);
const sent = rows.filter((r) => r.syncedAt !== null);
console.log('QUEUED (not yet sent):');
if (pending.length === 0) console.log('  nothing');
for (const r of pending) console.log(`  ${r.entity}: ${r._count}`);
if (sent.length) {
  console.log('ALREADY SENT:');
  for (const r of sent) console.log(`  ${r.entity}: ${r._count}`);
}
console.log('\nLOCAL COUNTS:');
for (const [name, n] of [
  ['sales', await p.sale.count()],
  ['sale items', await p.saleItem.count()],
  ['movements', await p.stockMovement.count()],
  ['invoices', await p.invoice.count()],
  ['goods receipts', await p.goodsReceipt.count()],
  ['expenses', await p.expense.count()],
]) console.log(`  ${name}: ${n}`);
await p.$disconnect();
