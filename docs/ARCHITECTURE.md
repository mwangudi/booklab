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
- **Sale** / **SaleItem** — a checkout; each item snapshots `unitPrice` **and** `costPrice` so P&L COGS is historically accurate.
- **Expense** — rent/salary/utilities/etc. per branch.
- **StockMovement** — event-sourced stock change (INTAKE/ADJUST) with a `delta`; how branch stock changes reach the cloud.
- **Outbox** / **SyncState** — offline sync plumbing (branch side).

Every syncable model carries `uuid` (global identity), `updatedAt`, `deletedAt`, and event tables also carry `originBranchId`.

## P&L computation
`GET /api/reports/pnl?from=&to=&branchId=`:
- **Revenue** = Σ sale totals.
- **COGS** = Σ (saleItem.quantity × saleItem.costPrice) — from the sale-time cost snapshot.
- **Gross profit** = revenue − COGS.
- **Expenses** = Σ expense amounts in range.
- **Net profit** = gross profit − expenses.
Returned as an overall summary, a per-branch breakdown (consolidated), and an expense-by-category split.

## Why cost is snapshotted on the sale item
Book cost prices change over time. Storing `costPrice` on each `SaleItem` at checkout means a P&L for last month uses last month's costs, not today's — the correct accounting behaviour.

See [OFFLINE-SYNC.md](OFFLINE-SYNC.md) for the offline/sync design.
