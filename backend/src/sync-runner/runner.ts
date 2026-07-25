import type { PrismaClient } from '@prisma/client';

/** Branch-side sync runner: drains the Outbox to the cloud (push) and applies cloud
 *  master-data changes locally (pull). Both take a branch PrismaClient + cloud URL + token. */

type Json = Record<string, any>;

export async function pushOutbox(branch: PrismaClient, cloudBase: string, token: string, batchSize = 200) {
  let pushed = 0, applied = 0, duplicates = 0, errors = 0;
  for (;;) {
    const pending = await branch.outbox.findMany({ where: { syncedAt: null }, orderBy: { id: 'asc' }, take: batchSize });
    if (pending.length === 0) break;
    const events = pending.map((o) => ({ entity: o.entity, uuid: o.entityUuid, op: o.op, data: JSON.parse(o.payload) as Json }));
    const res = await fetch(`${cloudBase}/api/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new Error(`push failed: ${res.status} ${await res.text()}`);
    const out = (await res.json()) as { results: Array<{ uuid: string; status: string; error?: string }> };
    const byUuid = new Map(out.results.map((r) => [r.uuid, r]));
    const now = new Date();
    let progressed = 0;
    for (const o of pending) {
      const r = byUuid.get(o.entityUuid);
      if (r && (r.status === 'applied' || r.status === 'duplicate')) {
        await branch.outbox.update({ where: { id: o.id }, data: { syncedAt: now } });
        progressed += 1;
        if (r.status === 'applied') applied += 1; else duplicates += 1;
      } else {
        errors += 1;
        await branch.outbox.update({ where: { id: o.id }, data: { attempts: { increment: 1 }, lastError: r?.error ?? 'unknown error' } });
      }
    }
    pushed += pending.length;
    if (progressed === 0 || pending.length < batchSize) break;
  }
  return { pushed, applied, duplicates, errors };
}

const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);

export async function pullMaster(branch: PrismaClient, cloudBase: string, token: string) {
  const state = await branch.syncState.findUnique({ where: { entity: 'master' } });
  const since = state?.lastPulledAt?.toISOString();
  const url = new URL(`${cloudBase}/api/sync/pull`);
  if (since) url.searchParams.set('since', since);
  const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`pull failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { serverTime: string; entities: Record<string, Json[]> };
  const counts: Record<string, number> = {};

  for (const b of data.entities.branch ?? []) {
    await branch.branch.upsert({
      where: { uuid: b.uuid },
      create: { uuid: b.uuid, name: b.name, location: b.location, createdAt: toDate(b.createdAt)!, updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt) },
      update: { name: b.name, location: b.location, updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt) },
    });
  }
  counts.branch = (data.entities.branch ?? []).length;

  for (const b of data.entities.book ?? []) {
    await branch.book.upsert({
      where: { uuid: b.uuid },
      create: { uuid: b.uuid, title: b.title, author: b.author, isbn: b.isbn, sku: b.sku, category: b.category, unitPrice: b.unitPrice, costPrice: b.costPrice, createdAt: toDate(b.createdAt)!, updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt) },
      update: { title: b.title, author: b.author, isbn: b.isbn, sku: b.sku, category: b.category, unitPrice: b.unitPrice, costPrice: b.costPrice, updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt) },
    });
  }
  counts.book = (data.entities.book ?? []).length;

  for (const u of data.entities.user ?? []) {
    const branchId = u.branchUuid ? (await branch.branch.findUnique({ where: { uuid: u.branchUuid }, select: { id: true } }))?.id ?? null : null;
    await branch.user.upsert({
      where: { uuid: u.uuid },
      create: { uuid: u.uuid, email: u.email, name: u.name, role: u.role, active: u.active, passwordHash: u.passwordHash, branchId, createdAt: toDate(u.createdAt)!, updatedAt: toDate(u.updatedAt)!, deletedAt: toDate(u.deletedAt) },
      update: { email: u.email, name: u.name, role: u.role, active: u.active, passwordHash: u.passwordHash, branchId, updatedAt: toDate(u.updatedAt)!, deletedAt: toDate(u.deletedAt) },
    });
  }
  counts.user = (data.entities.user ?? []).length;

  await branch.syncState.upsert({
    where: { entity: 'master' },
    create: { entity: 'master', lastPulledAt: new Date(data.serverTime) },
    update: { lastPulledAt: new Date(data.serverTime) },
  });
  return { counts, serverTime: data.serverTime };
}
