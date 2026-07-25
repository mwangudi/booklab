# Changelog

All notable changes to Booklab Bookshop. Dates are release dates to production
(`https://booklab.localinvestors.co.ke`).

## 2026-07-25

A large release covering a full system audit, financial controls, payroll,
navigation and EPOS receipt printing.

### Security

- **Fixed: secrets were world-readable in production.** `backend/.env` was mode
  `644` on a shared server, exposing the database password, JWT secret and
  M-Pesa credentials to any other local account. Now `600`.
- **Fixed: forged M-Pesa callbacks could mark a sale as paid.**
  `POST /api/mpesa/callback` is public (Safaricom posts to it) and previously
  trusted `ResultCode: 0` outright. A claimed success is now independently
  re-confirmed with Daraja's STK query API before the payment is marked paid;
  unverifiable callbacks stay `PENDING` and are retried by polling. Verified: a
  forged callback creates **zero** paid records.
- **Fixed: only login was rate limited.** A global limit now applies to every
  route (default 300/min, `RATE_LIMIT_MAX`), on top of the stricter per-route
  limits for login (10/min), M-Pesa STK (20/min) and the callback (60/min).
- **Fixed: cashiers could read expenses**, including salary amounts.
  `GET /api/expenses` is now restricted to admins and managers.
- **Fixed: real client IPs were not recorded.** Fastify now runs with
  `trustProxy`, so audit entries and rate-limit buckets use the true client
  address instead of `127.0.0.1`.
- **Fixed: invalid input returned HTTP 500.** A central error handler maps
  validation failures to `400` with a readable message and never leaks
  internals on unexpected errors.
- **Added: last-administrator guard.** Demoting or deactivating the only
  remaining active admin is rejected instead of locking everyone out.

### Financial controls

- **Sale void / reversal.** Managers and admins can void a sale with a required
  reason. Stock is returned, the sale stays on record marked as voided, and it
  is excluded from all revenue reporting. Voiding twice is rejected; cashiers
  cannot void.
- **Stock audit trail.** Every quantity change now writes an attributable
  movement — stock takes, sales, voids, intake and transfers — each recording
  the user and a note. Previously only intake was tracked, so shrinkage had no
  accountability.
- **Inter-branch stock transfers.** Move stock between branches as a paired
  out/in movement. Managers may only send stock out of their own branch;
  over-transfers and same-branch transfers are rejected.
- **System-wide audit log.** Logins (including failed and blocked attempts),
  user and branch administration, catalogue changes, sales, voids, reprints,
  stock takes, price overrides, transfers and payroll actions are all recorded
  with the user, IP address and field-level before/after values. Credentials are
  stripped before anything is written.

### Reporting

- **Daily Z-report** (`/reports/zreport`) — end-of-day cash-up by payment method
  and by cashier, voided sales with reasons, and expected cash in the drawer
  (cash sales less expenses paid from the till).
- **Re-order report** (`/reports/low-stock`) — items at or below an adjustable
  threshold, with suggested order quantities and the estimated restock cost.
- **Stock history** (`/stock/movements`) — every movement, filterable by branch
  and date, with CSV export.
- **Admin audit log viewer** (`/settings/audit`) — filter by area, action and
  date; shows failed sign-ins; CSV export.
- Sales list gained **CSV and PDF export**; voided sales are excluded from the
  revenue totals.

### Catalogue

- **Archive (soft delete) for products.** Archived products disappear from the
  till, stock lists and reports but are never deleted, so historical sales keep
  their detail. They can be restored at any time, and re-importing a product via
  CSV un-archives it.

### Payroll

- **Employees** are a separate record from login accounts, so staff who never
  sign in can still be paid. An optional link connects an employee to their
  login. Employees support archive and restore.
- **Monthly payroll runs** — draft, review, then close. Closing locks the
  figures permanently and posts **one SALARY expense per branch**, dated the last
  day of the period and linked back to the run, so the cost flows into the P&L.
  Drafts can be discarded; closed runs cannot be deleted.
- **Kenyan statutory deductions**, calculated in the correct legal order — NSSF,
  SHIF and the Housing Levy are deducted before PAYE is applied:
  - PAYE bands 10 / 25 / 30 / 32.5 / 35% with personal relief
  - NSSF Tier I and Tier II, employee contribution matched by the employer
  - SHIF as a percentage of gross, subject to a monthly minimum
  - Housing Levy on gross, matched by the employer
- **All rates are editable** in *Payroll settings*, with a live preview, so
  statutory changes never require a code release. Closed payslips are snapshots
  and are never altered by a later rate change.
- Payroll is **admin only**. Every action is audited.

### Point of sale & receipts

- **EPOS paper width** is selectable per till — 80mm (standard desktop) or 58mm
  (compact/mobile) — with the layout and font scaled to suit. Settings are
  stored per terminal because each till has its own printer.
- **Receipt & printer page** (`/settings/receipt`) with a test print, an optional
  extra footer line, an auto-print toggle, driver setup guidance and live
  previews of both an original and a duplicate.
- **Receipt reprinting** from the sales list, the sale detail and the POS
  confirmation. Reprints are **never** identical copies: they carry a
  `*** DUPLICATE ***` banner with the copy number and who reprinted it, so a copy
  cannot be passed off as an original. Voided sales print
  `*** VOIDED — NOT A VALID SALE ***`. Every reprint increments a counter and is
  written to the audit log, and cashiers may only reprint their own branch's
  sales.

### Navigation & layout

- Everyday actions (Dashboard, Point of Sale, Sales) are pinned at the top of
  the sidebar; everything else is organised into **collapsible groups** — Till,
  Catalogue & Stock, Reports, People & Payroll, Administration.
- The active page is highlighted, the group containing it opens automatically,
  and a collapsed group that holds the active page is marked with a dot. Open
  and closed sections are remembered between visits.
- **Small screens**: a bottom tab bar for the three everyday actions plus a full
  menu, a sliding drawer that closes on Escape or navigation, a compact header,
  larger touch targets and safe-area padding.
- **Forms now use the full page width** with multi-column layouts, instead of
  being confined to a narrow column.

### Database migrations

| Migration | Purpose |
|---|---|
| `20260725000000_void_and_audit` | sale void fields, stock movement actor and wider movement types, `AuditLog` |
| `20260725120000_audit_ip_and_archive` | audit IP address, audit and soft-delete indexes |
| `20260725140000_payroll` | `Employee`, `PayrollRun`, `Payslip`, `PayrollSetting`, expense to payroll-run link |
| `20260725160000_receipt_reprint` | receipt reprint counter |

## Earlier

- **2026-07-14** — CSV catalogue import; price tiers (retail / wholesale /
  school); per-branch price overrides; searchable dropdowns throughout.
- **2026-07-13** — Per-branch stock pricing.
- **2026-07-10** — Production deployment, TLS, M-Pesa STK push against Daraja,
  branch scoping verified end to end.
- **2026-07-04** — Initial release: catalogue, stock, POS, expenses, P&L / sales
  / stock reports, branches, users and the offline sync engine.
