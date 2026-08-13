# Booklab Bookshop

Multi-branch retail platform for **Booklab Bookshop** — “For Quality, For You”. It pairs a public marketing **website** with an **offline-first POS & management portal** and **periodic cloud sync**. Branches: **Luanda, Kapsabet and Mumias**.

## What it does
1. **Catalogue & stock across branches** — sell books, textbooks, exercise books, story books, **stationery**, **lab equipment** and computer supplies; the catalogue category doubles as the product type, with per-branch on-hand quantities and stock intake recorded as sync-safe movement events. Products can be **archived** (soft delete) without losing sales history, and loaded in bulk from a **CSV import**.
2. **Point of sale** — fast POS with **M-Pesa STK push** (Safaricom Daraja; Paybill or Till, configurable), **price tiers** (retail / wholesale / school), **discounts** taken as an amount off the basket, and **EPOS receipt printing** on 58mm or 80mm thermal printers. The catalogue puts each branch's **best sellers first**. Receipts can be **reprinted**, always stamped as duplicates.
3. **Financial controls** — **void/reverse a sale** (stock is returned and revenue excluded), **inter-branch stock transfers**, and a full **stock movement history** showing who changed what. Prices cannot be dropped below the admin's price; discounts are recorded on the sale with a reason so revenue stays net of them.
4. **Expenditure** — record rent, salary, utilities, supplies, marketing and misc expenses per branch.
5. **Payroll** — employees (with or without a system login), monthly payroll runs and Kenyan statutory deductions (PAYE, NSSF, SHIF, Housing Levy) with **editable rates**. Closing a run posts the cost straight into the P&L.
6. **Reports** — P&L, sales, stock valuation, **daily Z-report** (cash-up) and a **re-order report**, each per branch and exportable to **CSV and PDF**.
7. **Audit trail** — every sensitive action (sign-ins, price changes, stock takes, voids, reprints, payroll) recorded with the user, IP and before/after values, with an admin viewer.
8. **Public website** — a marketing site at `/` (offerings, branches, contact) with the staff portal at `/login`.

Plus the shared infrastructure: JWT auth with role + branch scoping and a store-and-forward sync engine so branch desktops keep working without internet and reconcile with the cloud when connected.

See [CHANGELOG.md](CHANGELOG.md) for the release history.

## Repository layout
```
bookshop/
├─ backend/            Fastify + Prisma + MySQL API + offline sync engine
│  ├─ prisma/          schema.prisma (MySQL) + seed; SQLite variant is generated
│  ├─ scripts/         gen-sqlite-schema.mjs (derives the SQLite branch schema)
│  └─ src/
│     ├─ middleware/   authGuard (JWT + branch scoping)
│     ├─ lib/          outbox, audit trail, payroll calculation, M-Pesa client
│     ├─ routes/       auth, branches, books, stock, sales, expenses, reports, audit, payroll, sync, mpesa
│     └─ sync-runner/  branch daemon that pushes the outbox + pulls master data
├─ frontend/           React + Vite + TS SPA (see docs/ROADMAP.md for status)
├─ branch/             Windows branch-runtime config + service scripts
└─ docs/               ARCHITECTURE, SETUP, DEPLOY, GO-LIVE, OFFLINE-SYNC, ROADMAP
```

## Quickstart (local)
See [docs/SETUP.md](docs/SETUP.md). In short:
```bash
# 1) API + database
cd backend
cp .env.example .env         # set DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate dev       # applies prisma/migrations/20260704000000_init
npm run seed
npm run dev                  # API on http://localhost:4000

# 2) Web app (in a second terminal)
cd frontend
npm install
npm run dev                  # SPA on http://localhost:5173 (proxies /api to :4000)
```
Seeded admin: `admin@booklabbookshop.co.ke` / `admin123` · cashier: `cashier@booklabbookshop.co.ke` / `cashier123`.
The web app serves the **public site** at `/` and the **staff portal** at `/login`.

**M-Pesa:** configure `MPESA_*` in `backend/.env` (Daraja consumer key/secret, shortcode, passkey, `MPESA_TX_TYPE` = Paybill/Till, and a public `MPESA_CALLBACK_URL`). Leave `MPESA_ENV=mock` to simulate payments end-to-end without credentials.

**Receipt printing:** works with any **58mm or 80mm** thermal printer that has an OS driver (USB, Bluetooth or network). Set the paper width per till under **Till → Receipt & printer**, then use *Test print*. In the browser's print dialog set margins to *None* and turn off headers & footers.

**Branding on printed documents:** receipts and the invoice, delivery note and statement PDFs carry the shop logo. Printing uses `frontend/public/logo-print.png` — the logo with its black background knocked out to white, since the original would print as a solid black block on paper. `frontend/public/logo.jpeg` remains the on-screen version.

## Status
In production at `https://booklab.localinvestors.co.ke`, **running on demonstration data**. Before the shop trades on it for real, work through [docs/GO-LIVE.md](docs/GO-LIVE.md) — domain, printers, opening stock, the 166 real schools in [docs/booklab-clients.csv](docs/booklab-clients.csv), and a database backup, which is not yet scheduled.

Backend (Fastify + Prisma + MySQL) and frontend (React + Vite + TypeScript) both typecheck and build cleanly. Covers catalogue, stock, POS, sales with void/reprint/discounts, expenses, credit trading (customers, invoices, suppliers, goods received), payroll, reporting, auditing and the offline branch runtime. See [CHANGELOG.md](CHANGELOG.md) for what shipped when and [docs/ROADMAP.md](docs/ROADMAP.md) for what remains.
