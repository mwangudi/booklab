import type { PrismaClient } from '@prisma/client';

/** Branch-side sync runner: drains the Outbox to the cloud (push) and applies cloud
 *  master-data changes locally (pull). Both take a branch PrismaClient + cloud URL + token. */

type Json = Record<string, any>;

export async function pushOutbox(branch: PrismaClient, cloudBase: string, token: string, batchSize = 200) {
  let pushed = 0, applied = 0, updated = 0, duplicates = 0, errors = 0;
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
      if (r && (r.status === 'applied' || r.status === 'updated' || r.status === 'duplicate')) {
        await branch.outbox.update({ where: { id: o.id }, data: { syncedAt: now } });
        progressed += 1;
        if (r.status === 'applied') applied += 1;
        else if (r.status === 'updated') updated += 1;
        else duplicates += 1;
      } else {
        errors += 1;
        await branch.outbox.update({ where: { id: o.id }, data: { attempts: { increment: 1 }, lastError: r?.error ?? 'unknown error' } });
      }
    }
    pushed += pending.length;
    if (progressed === 0 || pending.length < batchSize) break;
  }
  return { pushed, applied, updated, duplicates, errors };
}

const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);

/**
 * `applyStock` writes the cloud's on-hand figures down onto the branch. Only safe
 * once the outbox has drained — until the cloud has seen this branch's sales, its
 * numbers are stale and would silently undo them.
 */
export async function pullMaster(branch: PrismaClient, cloudBase: string, token: string, applyStock = false) {
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
      create: { uuid: b.uuid, name: b.name, code: b.code, location: b.location, createdAt: toDate(b.createdAt)!, updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt) },
      update: { name: b.name, code: b.code, location: b.location, updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt) },
    });
  }
  counts.branch = (data.entities.branch ?? []).length;

  for (const b of data.entities.book ?? []) {
    const fields = {
      title: b.title, author: b.author, isbn: b.isbn, sku: b.sku, category: b.category,
      unit: b.unit ?? 'Piece', vatRate: b.vatRate ?? 16,
      unitPrice: b.unitPrice, priceWholesale: b.priceWholesale ?? null, priceSchool: b.priceSchool ?? null,
      costPrice: b.costPrice,
      updatedAt: toDate(b.updatedAt)!, deletedAt: toDate(b.deletedAt),
    };
    await branch.book.upsert({
      where: { uuid: b.uuid },
      create: { uuid: b.uuid, createdAt: toDate(b.createdAt)!, ...fields },
      update: fields,
    });
  }
  counts.book = (data.entities.book ?? []).length;

  for (const u of data.entities.user ?? []) {
    const branchId = u.branchUuid ? (await branch.branch.findUnique({ where: { uuid: u.branchUuid }, select: { id: true } }))?.id ?? null : null;
    await branch.user.upsert({
      where: { uuid: u.uuid },
      create: { uuid: u.uuid, email: u.email, username: u.username ?? null, name: u.name, role: u.role, active: u.active, passwordHash: u.passwordHash, branchId, createdAt: toDate(u.createdAt)!, updatedAt: toDate(u.updatedAt)!, deletedAt: toDate(u.deletedAt) },
      update: { email: u.email, username: u.username ?? null, name: u.name, role: u.role, active: u.active, passwordHash: u.passwordHash, branchId, updatedAt: toDate(u.updatedAt)!, deletedAt: toDate(u.deletedAt) },
    });
  }
  counts.user = (data.entities.user ?? []).length;

  for (const c of data.entities.customer ?? []) {
    const fields = {
      name: c.name, type: c.type, contactPerson: c.contactPerson, phone: c.phone, email: c.email,
      address: c.address, kraPin: c.kraPin, paymentTermsDays: c.paymentTermsDays, openingBalance: c.openingBalance,
      chargeVat: c.chargeVat, vatMode: c.vatMode,
      updatedAt: toDate(c.updatedAt)!, deletedAt: toDate(c.deletedAt),
    };
    await branch.customer.upsert({
      where: { uuid: c.uuid },
      create: { uuid: c.uuid, createdAt: toDate(c.createdAt)!, ...fields },
      update: fields,
    });
  }
  counts.customer = (data.entities.customer ?? []).length;

  for (const s of data.entities.supplier ?? []) {
    const fields = {
      name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email,
      address: s.address, kraPin: s.kraPin, paymentTermsDays: s.paymentTermsDays, openingBalance: s.openingBalance,
      updatedAt: toDate(s.updatedAt)!, deletedAt: toDate(s.deletedAt),
    };
    await branch.supplier.upsert({
      where: { uuid: s.uuid },
      create: { uuid: s.uuid, createdAt: toDate(s.createdAt)!, ...fields },
      update: fields,
    });
  }
  counts.supplier = (data.entities.supplier ?? []).length;

  counts.stock = 0;
  for (const s of data.entities.stock ?? []) {
    const [b, bk] = await Promise.all([
      branch.branch.findUnique({ where: { uuid: s.branchUuid }, select: { id: true } }),
      branch.book.findUnique({ where: { uuid: s.bookUuid }, select: { id: true } }),
    ]);
    if (!b || !bk) continue;
    const existing = await branch.stock.findUnique({ where: { branchId_bookId: { branchId: b.id, bookId: bk.id } }, select: { id: true } });
    if (!existing) {
      await branch.stock.create({ data: { branchId: b.id, bookId: bk.id, quantity: s.quantity, price: s.price ?? null } });
      counts.stock += 1;
    } else if (applyStock) {
      await branch.stock.update({ where: { id: existing.id }, data: { quantity: s.quantity, price: s.price ?? null } });
      counts.stock += 1;
    }
  }

  await branch.syncState.upsert({
    where: { entity: 'master' },
    create: { entity: 'master', lastPulledAt: new Date(data.serverTime) },
    update: { lastPulledAt: new Date(data.serverTime) },
  });
  return { counts, serverTime: data.serverTime };
}
