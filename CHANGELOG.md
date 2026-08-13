# Changelog

All notable changes to Booklab Bookshop. Dates are release dates to production
(`https://booklab.localinvestors.co.ke`).

## 2026-08-13

Groundwork for branches trading through an internet outage.

### Offline sync

The engine had been written but never actually run — production held no outbox
or sync-state rows at all — and it predated price tiers, VAT, units and
discounts. Exercised end to end against production and repaired:

- **A fresh branch showed nothing in stock.** On-hand was never sent, and a new
  branch database has no movement history to derive it from. A branch now
  receives a snapshot of its own shelves, and only its own.
- Books reached a branch without their **unit, VAT rate or wholesale/school
  prices**, so a branch would have priced goods differently from the shop.
- Sale **discounts and price tier** were dropped in transit.
- **Stock takes, adjustments, transfers, and the stock movements behind posting a
  goods receipt or delivering an invoice** all wrote a movement without queueing
  it, so those corrections never left the branch.
- The runner now **pushes before it pulls** and only accepts the cloud's stock
  once its own queue has drained — otherwise reconnecting would quietly reverse
  sales made during the outage.

### Trading documents can now sync

- Invoices, delivery notes, goods received and both customer and supplier
  payments carry a `uuid`, so they have an identity that survives the trip
  between a branch and the cloud. Customers and suppliers are sent down to the
  branch so documents can be raised against them offline.
- Unlike a sale, a document is edited before it is final, so the same one
  arrives repeatedly. Documents are **upserted** and their lines replaced, with
  the branch that raised them treated as the authority. A push reports `applied`
  for a new document and `updated` for one that was overwritten.
- Ingesting a document deliberately leaves stock alone; the movements travel as
  their own events, so goods are never counted twice.

### Documents are numbered per branch

Numbers came from the cloud's autoincrement, so **two branches working offline
would both have issued `INV-0007`**. Each branch now has a short code and its own
sequence — `INV-KAP-0007`, `DN-KAP-0007`, `GRN-KAP-0007` — read back from the
numbers that branch has already issued. Documents raised centrally use `HQ`.

Existing branches were given codes automatically (Luanda `LUA`, Kapsabet `KAP`,
Mumias `MUM`) and the code is editable when adding or editing a branch. Numbers
already issued are left untouched.

### Database migrations

| Migration | Purpose |
|---|---|
| `20260813090000_document_sync_identity` | `Branch.code`; `uuid` on Invoice, InvoiceItem, GoodsReceipt, GoodsReceiptItem, CustomerPayment and SupplierPayment; `updatedAt` on both payment tables |

### Still needs a connection

Payroll, the audit trail and M-Pesa do not sync. Payroll is head-office work and
M-Pesa needs Safaricom, but it does mean **actions taken offline are not yet
attributable in the audit log**. `node backend/scripts/sync-readiness.mjs` reports
the current state.

## 2026-08-12

Discounts at the till, a catalogue that puts the fast movers first, and branded
print documents.

### Point of sale

- **Discounts** — a cash amount can be taken off the basket at the till, with an
  optional reason. The sale stores the `subtotal` (what the lines came to), the
  `discount` and the reason alongside the `total`, so a giveaway is recorded
  rather than hidden inside edited line prices.
  - Revenue, gross profit and the P&L are all **net of the discount**, so takings
    are never overstated.
  - The server caps the discount at the basket total and rejects anything larger
    or negative — the till cannot be talked past it.
  - The audit entry for the sale carries the subtotal, discount and reason.
  - The till shows *Subtotal / Discount / Total*, the receipt prints the same
    three lines, and the discount clears with the cart so it can never carry over
    to the next customer.
  - The daily Z-report reports **discounts given** for the day.

  This complements the price floor added on 2026-08-11: prices still cannot be
  quietly dropped below the admin's price, but staff can give an explicit,
  recorded discount.

- **Best sellers first** — the catalogue is ordered by units sold at that branch
  over the last 60 days, so the products the shop actually moves are on screen
  without scrolling. Voided sales do not count towards popularity, products that
  have never sold fall back to alphabetical order, and the leading few are
  flagged *Top seller*.

### Printing and documents

- **The shop logo now appears on receipts** and on the invoice, delivery note,
  customer statement and supplier statement PDFs.
  - The source artwork sits on a black field, which would print as a solid black
    block on white paper and waste a thermal roll. A print-safe copy
    (`frontend/public/logo-print.png`) with the background knocked out to white
    is used for all printing instead; `docs/logo.jpeg` remains the original.
  - The receipt waits for the logo to decode before opening the print dialog, and
    prints without it if it cannot be fetched, so printing never blocks on the
    image.
- **Invoice and statement totals no longer sprawl.** Subtotal, VAT and total are
  now a compact footer on the items table rather than separate full-height rows,
  which also stops narrow columns wrapping headings like `SUBTO TAL`.

### Interface

- The **shop logo replaces the generic book icon** at the top of the staff
  sidebar, on both the desktop rail and the mobile drawer.
- The **primary add action now sits beside the search box**, directly above the
  table it acts on, instead of at the top of the page: search across nine
  columns, the action across three, stacking to full width on a phone. Applies to
  products, stock, sales, branches, users, expenses, customers, invoices,
  employees, payroll, suppliers and goods received. Secondary actions (exports,
  archive toggles, filters and cross-links) stay in the page header.

### Database migrations

| Migration | Purpose |
|---|---|
| `20260811120000_sale_discount` | `Sale.subtotal`, `Sale.discount` and `Sale.discountReason`; backfills `subtotal` from `total` for existing sales |

### API

- `POST /api/sales` accepts optional `discount` (a non-negative amount, capped at
  the basket total) and `discountReason`, and returns `subtotal` and `discount`
  on the sale.
- `GET /api/stock/branch/:branchId` returns `sold` per product — units moved at
  that branch in the ranking window.
- `GET /api/reports/zreport` returns `summary.discounts`.

## 2026-08-11

Trading on credit: invoicing schools, receiving goods from suppliers, and
statements in both directions.

### Selling to schools and institutions

- **Customers** — schools, institutions, businesses and individuals, each with a
  contact, KRA PIN, payment terms and an opening balance for debt carried over
  from before the system. Archive and restore like products.
- **Invoices** — fully editable while in draft, with lines taken from the
  catalogue or typed free-hand. Workflow is *draft → issued → delivered → paid*;
  a delivered or paid invoice locks and can no longer be edited.
- **Confirming delivery books the goods out as a real sale**, so stock, cost of
  goods and profit all update through the normal reporting rather than sitting
  outside it.
- **Invoice and delivery note PDFs** matching the shop's existing templates —
  the delivery note deliberately carries no prices, and both end with the
  *Received by / school stamp / ID no / designation* block.
- **Customer statements** with a brought-forward balance, every invoice and
  receipt as a running balance, and ageing across current / 1–30 / 31–60 /
  61–90 / over 90 days. Printable, exportable, and payments can be recorded
  against a specific invoice or on account.

### Buying from suppliers

- **Suppliers** with payment terms and an opening balance.
- **Goods received** — key in the supplier's delivery note as a draft, then post
  it. Posting adds the quantities to branch stock as attributable intake
  movements and updates product cost prices so margins stay accurate. A posted
  receipt cannot be edited or deleted.
- **Supplier statements** — the mirror image of the customer statement, so the
  statement a supplier sends can be reconciled against ours line by line, with
  the same ageing buckets. Payments out are recorded against a receipt or on
  account.

### VAT

- VAT is **configurable rather than assumed**, because some customers are
  charged and others are not:
  - each **customer** has a charge-VAT switch and an inclusive/exclusive default
  - each **invoice** inherits that and can override it
  - each **product** carries its own rate, and each **invoice line** can be
    edited, so zero-rated printed books sit happily on the same invoice as
    standard-rated stationery
- Both inclusive and exclusive pricing are supported; the invoice PDF shows a
  VAT column with subtotal, VAT and total, or states that VAT does not apply.

### Stock

- **Units of measure** on every product — pieces, dozens, reams, quires,
  cartons, boxes, packets, bundles, rolls, sets, pairs, metres, litres and
  kilograms — carried through to invoices and delivery notes.
- **Stock take** — download a count sheet for a branch listing every product and
  the quantity the system holds, fill in the counted column, and upload it back.
  Differences are previewed before they are applied and each one becomes an
  attributable adjustment in the stock history. Unrecognised SKUs are reported
  and skipped.

### Point of sale

- **Prices can no longer be dropped below the price set by the admin.** The till
  may charge more, never less, and this is enforced on the server as well as in
  the till so it cannot be bypassed. Changing a price at the till affects only
  that sale — it never alters the catalogue or branch price.
- The retail / wholesale / school selector is now a **tab strip** rather than a
  dropdown, so switching customer type is a single tap.

### Database migrations

| Migration | Purpose |
|---|---|
| `20260811000000_invoicing_and_units` | customers, invoices, invoice items, customer payments, suppliers, goods receipts, supplier payments, product units and VAT rates |

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
