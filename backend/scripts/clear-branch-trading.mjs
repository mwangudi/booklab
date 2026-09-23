// Remove a till's trading data, keeping the catalogue, users and branches.
//
// For a laptop that has been used for testing: deletes sales, stock movements,
// documents, expenses and the audit trail, and empties the outbox so none of it
// ever reaches the cloud. Master data is left alone, so there is no waiting on a
// fresh pull afterwards.
//
//   node scripts/clear-branch-trading.mjs      report only, change nothing
//   node scripts/clear-branch-trading.mjs GO   delete
//
// It goes through Prisma rather than moving files about, so it always acts on
// the database the app itself opens - a file-level wipe can miss it when the
// configured path and the assumed path disagree.

import { PrismaClient } from '@prisma/client';

const GO = process.argv[2] === 'GO';
const db = new PrismaClient();

// Children before parents, or the foreign keys reject the delete.
const TABLES = [
  'saleItem',
  'mpesaPayment',
  'sale',
  'stockMovement',
  'invoiceItem',
  'customerPayment',
  'invoice',
  'goodsReceiptItem',
  'supplierPayment',
  'goodsReceipt',
  'payslip',
  'payrollRun',
  'expense',
  'auditLog',
  'outbox',
  // Dropping the cursor makes the next pull a full one, which restores stock.
  'syncState',
];

const pad = (s) => String(s).padEnd(18);

const list = await db.$queryRawUnsafe('PRAGMA database_list');
console.log(`database: ${list.map((r) => r.file).join(', ')}\n`);

console.log('will be cleared:');
let total = 0;
for (const t of TABLES) {
  const n = await db[t].count();
  total += n;
  console.log(`  ${pad(t)} ${n}`);
}

console.log('\nwill be kept:');
for (const [label, n] of [
  ['products', await db.book.count()],
  ['users', await db.user.count()],
  ['branches', await db.branch.count()],
  ['customers', await db.customer.count()],
  ['suppliers', await db.supplier.count()],
  ['stock rows', await db.stock.count()],
]) console.log(`  ${pad(label)} ${n}`);

if (!GO) {
  console.log(`\nDRY RUN - ${total} row(s) would go. Nothing deleted.`);
  console.log('Re-run with:  node scripts/clear-branch-trading.mjs GO');
  await db.$disconnect();
  process.exit(0);
}

console.log('\ndeleting:');
for (const t of TABLES) {
  const { count } = await db[t].deleteMany({});
  console.log(`  ${pad(t)} -${count}`);
}

console.log('\nafter:');
for (const t of TABLES) console.log(`  ${pad(t)} ${await db[t].count()}`);

console.log('\nDone. Stock still shows the test figures until the next successful');
console.log('pull, which overwrites it with the cloud\'s numbers. Restart the');
console.log('services and confirm stock looks right before trading.');
await db.$disconnect();
