# Architecture

## Stack
- **Backend:** Fastify + Prisma ORM + MySQL 8, JWT auth (`@fastify/jwt`), bcryptjs, Zod validation.
- **Frontend:** React + Vite + TypeScript + Tailwind (same component patterns as PharmaCare).
- **Branch runtime:** the same backend + SPA running against a local **SQLite** database, plus a sync daemon.

## Roles & branch scoping
Users have a role (`ADMIN`, `MANAGER`, `CASHIER`) and an optional `branchId`.
`src/middleware/authGuard.ts` provides:
- `authGuard` — verifies the JWT.
- `requireRole(...)` — role gate.
- `branchScope(req, reply, requested)` — admins see all branches (or a chosen one); non-admins are pinned to their own branch.
- `enforceWriteBranch(...)` — writes are forced to the caller's branch (admins must pass one).

## Data model (Prisma)
- **User** — login, role, branch.
- **Branch** — a shop location.
- **Book** — the sellable product (`sku` unique, optional `isbn`, `unitPrice`, `costPrice`).
- **Stock** — on-hand quantity per `(branch, book)`.
- **Sale** / **SaleItem** — a checkout; each item snapshots `unitPrice` **and** `costPrice` so P&L COGS is historically accurate. The sale holds `subtotal` (the lines before any discount), `discount`, `discountReason` and `total`.
- **Expense** — rent/salary/utilities/etc. per branch.
- **StockMovement** — event-sourced stock change (INTAKE/ADJUST) with a `delta`; how branch stock changes reach the cloud.
- **Outbox** / **SyncState** — offline sync plumbing (branch side).

Every syncable model carries `uuid` (global identity), `updatedAt`, `deletedAt`, and event tables also carry `originBranchId`.

## P&L computation
`GET /api/reports/pnl?from=&to=&branchId=`:
- **Revenue** = Σ sale totals — already net of any discount given at the till.
- **COGS** = Σ (saleItem.quantity × saleItem.costPrice) — from the sale-time cost snapshot.
- **Gross profit** = revenue − COGS.
- **Expenses** = Σ expense amounts in range.
- **Net profit** = gross profit − expenses.
Returned as an overall summary, a per-branch breakdown (consolidated), and an expense-by-category split.

## Why cost is snapshotted on the sale item
Book cost prices change over time. Storing `costPrice` on each `SaleItem` at checkout means a P&L for last month uses last month's costs, not today's — the correct accounting behaviour.

## Why a discount is recorded on the sale
A discount could be applied by simply typing a lower price on each line, but then
nothing distinguishes a deliberate giveaway from a mis-keyed price, and there is
nothing to report on. Holding `subtotal`, `discount` and `discountReason` on the
sale keeps the lines at their real prices, keeps revenue net of the reduction,
and makes every discount attributable in the audit trail and countable on the
Z-report. The server caps it at the basket total so a sale can never go negative.

See [OFFLINE-SYNC.md](OFFLINE-SYNC.md) for the offline/sync design.
