# Offline-first sales & sync

Branch desktops run the **same app** against a **local SQLite database**, so cashiers keep
selling and receiving stock with no internet. A background daemon reconciles with the cloud
whenever a connection is available (store-and-forward).

```
Branch desktop (offline)                     Cloud (master)
┌───────────────────────────┐                ┌──────────────────────┐
│ SPA → local Fastify API    │                │ Fastify API + MySQL  │
│         │                  │                │   /api/sync/push     │
│         ▼                  │  push (events) │   /api/sync/pull     │
│   SQLite DB  ──► Outbox ───┼───────────────►│  ingest idempotently │
│         ▲          ▲       │  pull (master) │  return master data  │
│         └── sync runner ◄──┼────────────────┤                      │
└───────────────────────────┘                └──────────────────────┘
```

## Core rules
1. **Foreign keys travel as `uuid`.** Cloud and branch keep independent autoincrement ids;
   the receiver resolves each `uuid` to its local id on ingest.
2. **Idempotent by `uuid`.** Re-sending an event is safe — if a row with that `uuid` already
   exists, it's a no-op (`duplicate`), so stock effects apply exactly once.
3. **Stock syncs as movements, not counts.** Sales carry decrement events; intake/adjustments
   are `StockMovement` events with a `delta`. Each side re-applies deltas, so two branches can
   never overwrite each other's stock.
4. **Master data flows cloud → branch.** Books, branches and users (incl. `passwordHash` for
   offline login) are pulled down; they're never edited on the branch.

## Direction by entity
| Entity | Direction | How |
|--------|-----------|-----|
| Sale, StockMovement, Expense | branch → cloud | outbox → `POST /api/sync/push`, idempotent by uuid |
| Book, Branch, User | cloud → branch | `GET /api/sync/pull?since=`, upsert by uuid |
| Stock on-hand | derived both sides | recomputed from movement/sale events |

## Branch runtime
1. `SYNC_ROLE=branch` makes every write also append a portable event to the **Outbox**.
2. The **sync runner** (`npm run sync`, or the `PharmaBranch*`-style services) loops:
   `pullMaster()` then `pushOutbox()`.
3. **Offline auth**: pulled users include their bcrypt `passwordHash`, so the existing
   login flow authenticates locally with no internet.

## Building a branch
See [../branch/](../branch/):
- `.env.branch.example` — `BRANCH_DATABASE_URL=file:./branch.db`, `SYNC_ROLE=branch`,
  `CLOUD_URL`, `SYNC_TOKEN` (mint via `POST /api/sync/token`), `SYNC_LOOP=1`.
- `setup-branch.ps1` — generates the SQLite Prisma client to the **default** `@prisma/client`
  (`BRANCH_BUILD=1 node scripts/gen-sqlite-schema.mjs` + `prisma generate/db push`), builds.
- `run-branch.ps1` — foreground API + sync runner.
- `install-services.ps1` — NSSM Windows services (API + sync loop).

The SQLite schema is derived from `schema.prisma` automatically (enums → String, `@db.*`
stripped); Decimal is supported on SQLite.
