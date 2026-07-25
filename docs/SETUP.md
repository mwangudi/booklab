# Local setup

## Prerequisites
- Node 20+ (works on 24), MySQL 8 running locally.

## Backend
```bash
cd backend
cp .env.example .env
# Edit .env:
#   DATABASE_URL="mysql://<user>:<pass>@localhost:3306/bookshop"
#   JWT_SECRET="<any strong string>"
npm install
npx prisma migrate dev --name init   # creates the DB schema + migration
npm run seed                          # branches, admin/cashier, sample books + stock + expenses
npm run dev                           # API on http://localhost:4000
```
Health check: `curl http://localhost:4000/health` → `{"ok":true,...}`.
Seeded logins: `admin@bookshop.co.ke / admin123`, `cashier@bookshop.co.ke / cashier123`.

## Verifying the API
```bash
# login
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@bookshop.co.ke","password":"admin123"}'
# use the returned token:
curl -s http://localhost:4000/api/reports/pnl -H "authorization: Bearer <token>"
```

## Frontend
The frontend mirrors the PharmaCare SPA (React + Vite + Tailwind). See
[ROADMAP.md](ROADMAP.md) for its build status and the fastest way to stand it up
(copy the PharmaCare `frontend/` shell and repoint the API types to books/expenses/PnL).

## Key API endpoints
All routes require `Authorization: Bearer <token>` unless noted. Non-admins are
transparently scoped to their own branch; requesting another branch returns 403.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | login → `{ token, user }` |
| GET  | `/api/auth/users` · POST · PATCH `/:id` | user administration (admin) |
| GET  | `/api/books` | catalogue (`?q=` search, `?archived=only\|all`) |
| POST | `/api/books` · PATCH `/:id` | create / update a product (manager) |
| DELETE | `/api/books/:id` · POST `/:id/restore` | archive / restore a product (soft delete) |
| POST | `/api/books/import` | bulk CSV catalogue import (manager) |
| GET  | `/api/stock/branch/:branchId` | full catalogue with this branch's stock |
| GET  | `/api/stock/valuation` | per-branch stock valuation |
| PUT  | `/api/stock` · `/api/stock/price` | stock take / per-branch price override |
| POST | `/api/stock/intake` | receive stock (movement event) |
| POST | `/api/stock/transfer` | move stock between branches |
| GET  | `/api/stock/movements` | stock movement history (manager) |
| POST | `/api/sales` | record a sale (POS) |
| POST | `/api/sales/:id/void` | reverse a sale, restoring stock (manager) |
| POST | `/api/sales/:id/reprint` | reprint a receipt as a duplicate (audited) |
| GET  | `/api/expenses` (manager) / POST | list / add expenses |
| GET  | `/api/reports/pnl` | profit & loss |
| GET  | `/api/reports/sales` · `/stock` | sales / stock reports |
| GET  | `/api/reports/zreport` | daily cash-up (Z-report) |
| GET  | `/api/reports/low-stock` | re-order report |
| GET  | `/api/audit` · `/api/audit/facets` | system audit trail (admin) |
| GET  | `/api/payroll/employees` · POST · PATCH · DELETE · POST `/:id/restore` | employees (admin) |
| GET  | `/api/payroll/runs` · `/runs/:id` · POST `/runs` | payroll runs (admin) |
| POST | `/api/payroll/runs/:id/recalculate` · `/close` | recompute / close and post to P&L (admin) |
| GET  | `/api/payroll/settings` · PUT | statutory rates (admin) |
| POST | `/api/mpesa/stk` · GET `/status` | M-Pesa STK push and polling |
| POST | `/api/mpesa/callback` | Daraja result callback (public; success is re-verified) |
| POST | `/api/sync/token` | mint a branch sync token (admin) |
| POST | `/api/sync/push` · GET `/api/sync/pull` | branch sync |
