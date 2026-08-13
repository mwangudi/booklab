import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { pushOutbox, pullMaster } from './runner.js';

/** Branch sync daemon. Env: CLOUD_URL, SYNC_TOKEN, BRANCH_DATABASE_URL, SYNC_LOOP=1, SYNC_INTERVAL_MS. */
const CLOUD = process.env.CLOUD_URL ?? 'http://127.0.0.1:4000';
const TOKEN = process.env.SYNC_TOKEN ?? '';
const BRANCH_URL = process.env.BRANCH_DATABASE_URL ?? process.env.DATABASE_URL;
const LOOP = process.env.SYNC_LOOP === '1';
const INTERVAL = Number(process.env.SYNC_INTERVAL_MS ?? 60000);

async function cycle(branch: PrismaClient) {
  // Push first: the cloud's stock figures are only trustworthy once it has seen
  // everything this branch sold offline.
  const push = await pushOutbox(branch, CLOUD, TOKEN);
  const pending = await branch.outbox.count({ where: { syncedAt: null } });
  const pull = await pullMaster(branch, CLOUD, TOKEN, pending === 0);
  return { push, pull, pending };
}

async function main() {
  if (!TOKEN) throw new Error('SYNC_TOKEN is required');
  const branch = new PrismaClient(BRANCH_URL ? { datasources: { db: { url: BRANCH_URL } } } : undefined);
  try {
    do {
      try {
        console.log(new Date().toISOString(), JSON.stringify(await cycle(branch)));
      } catch (e) {
        console.error(new Date().toISOString(), 'sync error:', (e as Error).message);
      }
      if (LOOP) await new Promise((r) => setTimeout(r, INTERVAL));
    } while (LOOP);
  } finally {
    await branch.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
