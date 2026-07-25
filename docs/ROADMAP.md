# Roadmap / status

## Done — backend (schema-validated)
- Prisma schema: User, Branch, Book, Stock, Sale, SaleItem, Expense, StockMovement,
  Outbox, SyncState — with sync columns (`uuid`, `updatedAt`, `deletedAt`, `originBranchId`).
- Auth (login/me/users) with role + branch scoping.
- Branches, Books (catalogue), Stock (branch view, valuation, set, intake-as-movement).
- Sales/POS (`POST /api/sales`) with stock decrement + cost snapshot + outbox on branch.
- Expenses (list/add) with outbox on branch.
- Reports: **P&L** (revenue/COGS/gross/expenses/net, consolidated + per-branch + by-category),
  Sales, Stock.
- Sync engine: `POST /api/sync/token`, `POST /api/sync/push` (idempotent ingest of sale /
  stockMovement / expense), `GET /api/sync/pull` (book/branch/user master data).
- Branch runtime: `scripts/gen-sqlite-schema.mjs`, `src/sync-runner/`, `branch/` scripts.

## To do — backend (nice-to-have)
- Stock adjustment endpoint (movement `type=ADJUST`) + CSV import of books/stock.
- Refunds, if needed.
- A P&L CSV/PDF export endpoint parity with PharmaCare's report exports.

## Done — migration
- Initial Prisma migration generated at `backend/prisma/migrations/20260704000000_init`
  (via `prisma migrate diff`, offline). Apply with `npx prisma migrate dev` (or `deploy`).

## Done — frontend
Built as a self-contained **React + Vite + TypeScript + Tailwind** SPA in `frontend/`, reusing the
PharmaCare patterns (`api.ts`/`auth.ts`/`useApi.ts`/`reportExport.ts`, a `DataTable`, KPI/UI kit).
`npm run build` (tsc + vite) passes.
- Catalogue is **product-type aware**: `category` covers Textbook / Exercise Book / Story Book /
  Novel / Reference / Children / Stationery / Art & Craft / Office Supplies / Magazine; `author`/`isbn`
  are optional (books only).
- Pages: Login, Dashboard, **POS** (`/pos`), Sales (+receipt modal), **Products** (+ create/edit),
  **Stock** (+ stock-take + intake), **Expenses** (+ record), **Reports** (P&L / Sales / Stock with
  CSV + jsPDF export), **Branches** (+ upsert), **Users** (+ upsert).
- JWT auth, role/branch scoping, `RequireAuth` + `AdminOnly`/`ManagerOnly` gates, Vite proxy `/api`→`:4000`.

## To do — frontend (polish)
- Optional: code-split the jsPDF report export to trim the initial bundle.
- Optional: offline PWA shell + service worker for the branch desktop build.
- Optional: thermal receipt printing from the POS.

## To do — infra
- systemd unit + Nginx vhost for the cloud (see DEPLOY.md).
- Thermal receipt printing on the branch (optional; ESC/POS agent like PharmaCare's plan).

## Verified
- `schema.prisma` passes `prisma validate`.
- Backend code mirrors the PharmaCare patterns that build + run cleanly; after `npm install`
  + `prisma generate`, `npm run build` should pass. (Deps aren't installed in this scaffold.)
