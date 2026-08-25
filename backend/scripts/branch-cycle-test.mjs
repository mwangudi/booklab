// Offline branch simulation: pull master data from the cloud into a local SQLite
// database, record a sale while "offline", then reconnect and push it up.
//
// This WRITES a real sale and stock movement to whichever cloud you point it at,
// so it prints the uuids to delete afterwards.
//   CLOUD_URL=https://... node scripts/branch-cycle-test.mjs <syncToken>

import { PrismaClient } from '../generated/prisma-sqlite/index.js';
import { pullMaster, pushOutbox } from '../dist/sync-runner/runner.js';
import { randomUUID } from 'node:crypto';

const CLOUD = process.env.CLOUD_URL;
const TOKEN = process.argv[2];
if (!CLOUD) throw new Error('CLOUD_URL is required');
if (!TOKEN) throw new Error('usage: CLOUD_URL=... node scripts/branch-cycle-test.mjs <syncToken>');
const BRANCH_DB = process.env.BRANCH_DATABASE_URL ?? 'file:./branch-test.db';

const db = new PrismaClient({ datasources: { db: { url: BRANCH_DB } } });
const line = (s) => console.log(`\n=== ${s} ===`);

try {
  line('1. first pull — seed an empty branch database');
  console.log(' ', JSON.stringify(await pullMaster(db, CLOUD, TOKEN, true)));
  const [books, users, branches, stockRows] = await Promise.all([
    db.book.count(), db.user.count(), db.branch.count(), db.stock.count(),
  ]);
  console.log(`  local: ${branches} branches, ${books} books, ${users} users, ${stockRows} stock rows`);

  const book = await db.book.findFirst({ orderBy: { id: 'asc' } });
  console.log('  book carries the new fields:', {
    sku: book.sku, unit: book.unit, vatRate: String(book.vatRate),
    unitPrice: String(book.unitPrice), costPrice: String(book.costPrice),
  });

  line('2. offline login works against the pulled password hash');
  const bcrypt = (await import('bcryptjs')).default;
  const cashier = await db.user.findFirst({ where: { email: 'cashier@booklabbookshop.co.ke' } });
  console.log('  cashier found:', !!cashier, '| password verifies offline:',
    await bcrypt.compare(process.env.BOOKLAB_CASHIER_PASSWORD ?? '', cashier.passwordHash));

  const branch = await db.branch.findFirst({ where: { id: cashier.branchId } });
  const stock = await db.stock.findFirst({ where: { branchId: branch.id, bookId: book.id } });
  console.log(`  ${branch.name}: ${book.sku} on hand = ${stock.quantity}`);

  line('3. sell 3 units OFFLINE (cloud never touched)');
  const saleUuid = randomUUID();
  const itemUuid = randomUUID();
  const qty = 3, unitPrice = Number(book.unitPrice), discount = 100;
  const subtotal = qty * unitPrice;
  await db.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        uuid: saleUuid, branchId: branch.id, userId: cashier.id, originBranchId: branch.id,
        subtotal, discount, discountReason: 'Offline regular customer', total: subtotal - discount,
        paymentMethod: 'CASH', priceTier: 'RETAIL',
        items: { create: [{ uuid: itemUuid, bookId: book.id, quantity: qty, unitPrice, costPrice: Number(book.costPrice) }] },
      },
    });
    await tx.stock.update({ where: { id: stock.id }, data: { quantity: { decrement: qty } } });
    await tx.outbox.create({
      data: {
        entity: 'sale', entityUuid: saleUuid, op: 'upsert',
        payload: JSON.stringify({
          branchUuid: branch.uuid, userUuid: cashier.uuid,
          subtotal, discount, discountReason: 'Offline regular customer', total: subtotal - discount,
          paymentMethod: 'CASH', priceTier: 'RETAIL', createdAt: new Date().toISOString(),
          items: [{ uuid: itemUuid, bookUuid: book.uuid, quantity: qty, unitPrice, costPrice: Number(book.costPrice) }],
        }),
      },
    });
  });
  const afterLocal = await db.stock.findUnique({ where: { id: stock.id } });
  console.log(`  local stock ${stock.quantity} -> ${afterLocal.quantity}`);
  console.log('  outbox pending:', await db.outbox.count({ where: { syncedAt: null } }));

  line('4. still offline: a stock intake of 5');
  const mvUuid = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: { uuid: mvUuid, branchId: branch.id, bookId: book.id, delta: 5, type: 'INTAKE', originBranchId: branch.id, userId: cashier.id, note: 'Offline intake' },
    });
    await tx.stock.update({ where: { id: stock.id }, data: { quantity: { increment: 5 } } });
    await tx.outbox.create({
      data: {
        entity: 'stockMovement', entityUuid: mvUuid, op: 'upsert',
        payload: JSON.stringify({ branchUuid: branch.uuid, bookUuid: book.uuid, delta: 5, type: 'INTAKE', note: 'Offline intake', createdAt: new Date().toISOString() }),
      },
    });
  });
  console.log('  local stock now:', (await db.stock.findUnique({ where: { id: stock.id } })).quantity);
  console.log('  outbox pending:', await db.outbox.count({ where: { syncedAt: null } }));

  line('5. back online — push');
  console.log(' ', JSON.stringify(await pushOutbox(db, CLOUD, TOKEN)));
  console.log('  outbox pending after push:', await db.outbox.count({ where: { syncedAt: null } }));

  line('6. push again — nothing should be re-sent');
  console.log(' ', JSON.stringify(await pushOutbox(db, CLOUD, TOKEN)));

  line('7. pull again, now that the outbox has drained');
  const pending = await db.outbox.count({ where: { syncedAt: null } });
  console.log(' ', JSON.stringify(await pullMaster(db, CLOUD, TOKEN, pending === 0)));
  console.log('  local stock after reconciling with cloud:', (await db.stock.findUnique({ where: { id: stock.id } })).quantity);

  console.log('\nSALE_UUID=' + saleUuid);
  console.log('MOVE_UUID=' + mvUuid);
  console.log('BOOK_UUID=' + book.uuid);
  console.log('BRANCH_ID=' + branch.id);
  console.log('EXPECTED_NET=' + (-qty + 5));
} finally {
  await db.$disconnect();
}
