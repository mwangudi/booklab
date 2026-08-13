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
| Stock on-hand | cloud → branch (snapshot) | full snapshot of **that branch only**; see below |

### Why stock is a snapshot, not a cursor
`Stock` is a derived table with no `uuid` or `updatedAt`, so it cannot be pulled
incrementally. The cloud sends the branch its complete on-hand list every pull.

The runner **pushes before it pulls**, and only writes cloud quantities down when
the outbox has fully drained. Until the cloud has seen the sales a branch made
offline, its numbers are stale, and applying them would silently undo those
sales. Rows the branch has never seen are always created, so a fresh install
seeds correctly.

## What is verified
Exercised end to end against production on 2026-08-13:

- minting a branch token, and `pull` returning branches, books (including `unit`,
  `vatRate` and the wholesale/school tier prices), users and that branch's stock
- offline login against the pulled bcrypt hash
- a sale **and** a stock intake recorded offline, then pushed on reconnect, with
  the discount, price tier, cost snapshot and timestamps intact
- pushing the same batch twice — the second is reported `duplicate` and creates
  nothing
- stock arithmetic across the boundary: 142 on hand − 3 sold + 5 received = 144
  on both sides
- a branch token cannot read or write another branch's data, and an ordinary
  staff token cannot reach the sync endpoints at all (403 / 401)

Two helper scripts keep this honest:
`node scripts/branch-query-test.mjs` checks every query shape the routes rely on
against SQLite, and `CLOUD_URL=… node scripts/branch-cycle-test.mjs <token>`
replays the whole offline→online cycle. The cycle test writes a real sale to the
cloud you point it at and prints the uuids to remove afterwards.

## Not yet syncing
`node scripts/sync-readiness.mjs` lists which models carry the sync columns.
These have **no `uuid`**, so they cannot travel between branch and cloud yet:

> Stock*, AuditLog, MpesaPayment, PayrollRun, Payslip, PayrollSetting,
> CustomerPayment, **Invoice**, **InvoiceItem**, SupplierPayment,
> **GoodsReceipt**, GoodsReceiptItem

\* Stock is deliberate — it is derived, and is snapshotted instead.

Invoices, delivery notes and goods received therefore still need a connection.
Giving them offline support means adding `uuid` (plus `updatedAt`) to those
models and extending `push`/`pull`. Document numbering also needs attention:
`INV-0007` is derived from the cloud autoincrement, so two offline branches would
mint the same number — branches need their own prefix or range.

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
