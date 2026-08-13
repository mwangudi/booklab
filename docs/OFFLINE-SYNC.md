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
| Invoice (+ items), GoodsReceipt (+ items) | branch → cloud | upserted by uuid; lines replaced wholesale |
| CustomerPayment, SupplierPayment | branch → cloud | idempotent by uuid |
| Book, Branch, User, Customer, Supplier | cloud → branch | `GET /api/sync/pull?since=`, upsert by uuid |
| Stock on-hand | cloud → branch (snapshot) | full snapshot of **that branch only**; see below |

### Why documents are upserted, not append-only
A sale is final the moment it is rung up, so it is written once and any repeat is
a duplicate. An invoice is not: it is edited as a draft, then issued, then
delivered. The same uuid therefore arrives repeatedly and the branch that raised
it is the authority, so documents are upserted and their lines replaced. Push
reports `applied` for a new document and `updated` for one that was overwritten,
so a branch log distinguishes the two.

Ingesting a document deliberately **does not touch stock**. Posting a receipt or
delivering an invoice writes its own `StockMovement` and `Sale` events, which
travel separately — applying stock here as well would count the goods twice.

### Document numbering
Documents are numbered per branch — `INV-KAP-0007`, `DN-KAP-0007`, `GRN-KAP-0007`
— using `Branch.code`. The old scheme derived the number from the cloud
autoincrement, so two branches working offline would both have minted `INV-0007`.
The sequence is read back from the numbers already issued for that branch, which
is exactly what a branch database holds. Documents raised centrally, with no
branch, use the `HQ` code.

### Why stock is a snapshot, not a cursor
`Stock` is a derived table with no `uuid` or `updatedAt`, so it cannot be pulled
incrementally. The cloud sends the branch its complete on-hand list every pull.

The runner **pushes before it pulls**, and only writes cloud quantities down when
the outbox has fully drained. Until the cloud has seen the sales a branch made
offline, its numbers are stale, and applying them would silently undo those
sales. Rows the branch has never seen are always created, so a fresh install
seeds correctly.

## What is verified
A complete branch install was built and run against production on 2026-08-13:
SQLite database, the real Fastify API, the real web app, and the sync runner.

- **The app runs on SQLite.** 22 checks covering the till, back office and
  reports all pass: offline login against the pulled bcrypt hash, a wrong
  password still refused, the POS catalogue, a sale with a discount, stock
  intake and history, an invoice raised and issued, a goods receipt raised and
  posted, the Z-report, P&L, re-order report, audit log, an expense and a
  customer statement.
- **Roles still hold offline** — a cashier is refused the P&L with a 403.
- **A day's trading pushed cleanly on reconnect**: 8 events, 4 new and 4
  updates, no errors, and the outbox drained to nothing. Pushing again sent
  nothing.
- **Stock agreed exactly.** The branch started at 283, sold 2, received 7 and
  posted a receipt for 5; the cloud landed on 293. Nothing was double-counted,
  because a sale's own movement is deliberately not queued — the cloud's sale
  ingest already decrements — while a receipt's movement is.
- Documents arrived intact: `INV-KAP-0001` with its delivery note `DN-KAP-0001`
  and its line, and `GRN-KAP-0001` posted, neither duplicated.
- Earlier probes confirmed a branch token cannot read or write another branch's
  data, and an ordinary staff token cannot reach the sync endpoints at all.

Three scripts keep this testable:

| Script | What it does |
|---|---|
| `node scripts/sync-readiness.mjs` | which models carry the sync columns |
| `node scripts/branch-query-test.mjs` | every query shape the routes use, against SQLite |
| `node scripts/branch-outbox.mjs` | what a branch is holding for the cloud |

`CLOUD_URL=… node scripts/branch-cycle-test.mjs <token>` replays the whole
offline→online cycle. It writes a real sale to whichever cloud you point it at
and prints the uuids to remove afterwards.

## Not yet syncing
`node scripts/sync-readiness.mjs` lists which models carry the sync columns.
These have **no `uuid`**, so they cannot travel between branch and cloud:

> Stock*, AuditLog, MpesaPayment, PayrollRun, Payslip, PayrollSetting

\* Stock is deliberate — it is derived, and is snapshotted instead.

Payroll is head-office work and does not need to run at a branch. The gaps that
still matter are **AuditLog**, so actions taken offline are not yet attributable
centrally, and **MpesaPayment**, which cannot work offline anyway because it
needs Safaricom.

## Branch runtime
1. `SYNC_ROLE=branch` makes every write also append a portable event to the **Outbox**.
2. The **sync runner** (`npm run sync`, or the `PharmaBranch*`-style services) loops:
   `pushOutbox()` then `pullMaster()`.
3. **Offline auth**: pulled users include their bcrypt `passwordHash`, so the existing
   login flow authenticates locally with no internet.
4. **The branch serves the web app itself.** There is no nginx on a branch laptop,
   so set `SERVE_WEB` to the built frontend and the API serves it, falling back to
   `index.html` for client-side routes. In the cloud, nginx does this instead and
   `SERVE_WEB` is left unset.

### Enums and the branch build
SQLite has no enums, so the generated branch client exports none. Anything that
imported an enum type from `@prisma/client` compiled in the cloud but broke the
branch build. The domain enums live in `src/lib/enums.ts` as plain unions and
work against either client — import them from there, never from Prisma.

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
