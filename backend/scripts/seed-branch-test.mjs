// Minimal seed so branch-query-test.mjs has a branch, a book and a user to work with.
import { PrismaClient } from '../generated/prisma-sqlite/index.js';

const db = new PrismaClient({ datasources: { db: { url: process.env.BRANCH_DATABASE_URL } } });

const branch = await db.branch.upsert({
  where: { code: 'TST' },
  update: {},
  create: { name: 'Node24 Test Branch', code: 'TST', location: 'local' },
});
const book = await db.book.upsert({
  where: { sku: 'NODE24-TEST' },
  update: {},
  create: { title: 'Node 24 test pen', sku: 'NODE24-TEST', unitPrice: 100, costPrice: 60 },
});
const user = await db.user.upsert({
  where: { email: 'node24@test.local' },
  update: {},
  create: { email: 'node24@test.local', passwordHash: 'x', name: 'Node 24 Test', role: 'ADMIN', branchId: branch.id },
});
console.log('seeded branch=%d book=%d user=%d', branch.id, book.id, user.id);
await db.$disconnect();
