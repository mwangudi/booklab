# Changelog

All notable changes to Booklab Bookshop. Dates are release dates to production
(`https://booklab.localinvestors.co.ke`).

## 2026-10-27 — Website: wider layout, pinned header, hero carousel
- Public pages use up to 1,720 px of width (was 1,280) with wider side margins; the hero
  splits 50/50 on wide screens and the catalogue shows 4 cards per row.
- The header and category row stay pinned while scrolling; the navy top bar scrolls away.
  Jump links (`#quote`, `#branches`) land below the pinned header.
- The hero picture is a carousel of the brochure photos (stationery, lab equipment,
  computers, furniture): every 5 s, arrows and dots, each caption opens that category;
  paused on hover or focus and for reduced motion.

## 2026-10-27 — Website redesign and quotation form

### Website: new design
- Public pages (`/`, `/catalogue`, `/catalogue/request`) follow the Stitch design in
  `docs/DESIGN-website.md` (mockup `docs/design-website-mockup.png`): navy top bar with
  the phone numbers, sticky header with search and the request basket, a category row,
  Plus Jakarta Sans and Space Grotesk, ochre and navy tokens (`colors.site` in Tailwind).
- Home page: hero, fact tiles (3 branches, 11 supply areas, logo exercise books,
  delivery), six supply-division cards linking to the filtered catalogue, a "Prices on
  request" band, branches with landmarks, and a shared footer. Only confirmed facts are
  shown; no prices anywhere; "KRA tax compliant" without the PIN.
- **Download 2026 price list** serves `/site/booklab-price-catalogue-2026.pdf`: brochure
  pages 2–4 only (the page with the tax certificate is left out).
- Catalogue reads `?q=` and `?category=`; the category row highlights the one shown, and
  an empty category says nothing in it is in stock and points to the quotation form.

### Quotation form (typed list)
- The home page form takes a school's list as typed text plus a preferred branch
  (Luanda, Kapsabet, Mumias), with no catalogue items needed. Requests need items or a
  list of at least 3 characters (list up to 5,000).
- Staff see the typed list and preferred branch on the request (list shows "typed list").
  **Make invoice** on such a request creates an empty draft whose notes carry the branch
  and the list; staff add the lines. An empty invoice still cannot be issued.
- Migration `20261027220000_request_typed_list`: `CustomerRequest.listText`,
  `CustomerRequest.preferredBranch` (both nullable).

## 2026-10-27 — Online catalogue and customer requests; tidy sidebar

### Website: catalogue and order requests
- **Catalogue** at `/catalogue` (linked from the home page): the products the shop holds
  in stock — total across all branches above zero — with search and a category filter.
  No prices, quantities or branches are shown.
- Visitors add items and quantities to **a request** and send it with their name, phone,
  school/organisation, delivery location and a note; no account is needed. They get a
  reference (`REQ-0001`, …). Public endpoints `GET /api/public/catalogue` and
  `POST /api/public/requests` expose names, codes, categories and units only.
- Abuse guards: a hidden bot trap, 5 requests per address per 10 minutes, item and
  quantity caps, and only in-stock products accepted. Each request is audited with the
  sender's address.
- Home page footer shows the shop's numbers (0728 492 372 · 0737 452 210).

### Staff: Website requests
- **Customers & Invoicing → Website requests**: list and detail (contact, delivery
  location, items against stock held), mark contacted, cancel or reopen; the dashboard
  shows how many new ones are waiting. Visible with *See customers* or *Create invoices*.
- **Make invoice** turns a request into a draft invoice — for an existing customer, or a
  new one built from the request (needs *Add or edit customers*) — at the school,
  wholesale or retail price for the branch (`POST /api/invoices/from-request/:id`). A
  request can be invoiced once. Then the usual flow: issue, delivery note, deliver.
- **An invoice cannot be issued while a catalogue line is priced 0** (any invoice). Items
  without a selling price come into a request's invoice at 0 and are flagged.
- New tables `CustomerRequest`, `CustomerRequestItem` (migration
  `20261027200000_customer_requests`).

### Sidebar
- The menu is an accordion: only the section holding the current page is open, opening
  another closes it, and nothing is remembered between visits. It used to keep every
  section ever opened, so over time all of them stood open.

### Deployed
- `778bd52` deployed 2026-10-27 20:36 EAT with migration `20261027200000_customer_requests`.
  Tested first on a copy of the live data: API 26/26, headless-Chrome journey 15/15.
  **Rollback point:** `/root/deploy-bak-20261027-203636` (database dump, backend, frontend
  source and dist); previous build at `frontend/dist-old-20261027-203636`.
- The website shows only products in stock. At deploy time only one was (Kapsabet, 284 ×
  EX BK A4 120 PGS SQ), so the catalogue fills as opening stock is entered.

### Data changes on production (2026-10-27, owner request)
- **1 October test sales cleared**: sales #1–#4 (KES 6,040; #1 already voided "TEST") and
  their lines, test invoices INV-LUA-0001 and INV-LUA-0002 and their lines, and the 12
  stock-history entries that existed only because of them — the sale and void entries, the
  19 Oct PL-0123 transfer correction and the 5 Oct Luanda stock takes that set PL-0021,
  PL-0085 and PL-0090 back to 0. Three Kapsabet reset entries (PL-0089, PL-0123, PL-0369)
  now read "10 -> 0". Stock remains 0 and equal to its history; the customer and the audit
  log are kept, with a `CLEAR_TEST_DATA` entry. Backup
  `/root/pre-clear-oct1-sales-20261027-204457.sql.gz`.
- **Known timestamp offset, left as recorded.** Rows written by direct database operations
  on 2026-10-19 and 2026-10-27 (the PL-0123 correction, the stock reset, the catalogue
  import, the duplicate merges, the Retail-column costs, the price clear and restore) were
  stamped with Nairobi time where the app stores UTC, so they display **3 hours later**
  than they happened. Audit entries are not rewritten; a `system` / `NOTE` audit entry
  records the offset. Later database operations use UTC.

## 2026-10-27 — Edit prices and stock in a grid; catalogue import; stock reset

### Products grid
- **Edit in grid** on the Products page: spreadsheet-style editing of retail,
  wholesale and school prices, and — with a branch chosen — that branch's own prices
  and quantities. Arrow keys / Enter move, Esc undoes a cell, a block pasted from
  Excel fills down and across; changed cells are highlighted, invalid ones block
  Save. One Save sends everything, all or nothing (`POST /api/stock/grid`): prices
  are audited, quantities are recorded as stock-history adjustments.
- Pages of 100 rows with edits kept across pages, and a **No price yet** filter.
- New permission **Edit prices & stock in a grid** (`product.gridEdit`): admins only by
  default — managers do not get it either — and grantable to anyone under
  Administration → Permissions. A granted cashier edits only their own branch; catalogue prices stay
  admin-only.
- Deployed `d3dba19` 2026-10-27 18:06 EAT. Tested first on a copy of the live data:
  grid endpoint 23/23, headless-Chrome grid 23/23, permissions 36/36. **Rollback
  point:** `/root/deploy-bak-20261027-180631`; previous build at
  `frontend/dist-old-20261027-180631`.

### Data changes on production (2026-10-27, owner request)
- **Stock zeroed at every branch**: Kapsabet's 671 products / 6,708 units (Luanda and
  Mumias were already 0), each with a stock-history adjustment and an audit entry.
  Backup `/root/pre-zero-stock-20261027-162628.sql.gz`.
- **Catalogue 671 → 1,899 products** from `Booklab Catalogue 2026.pdf` and Bhavinn
  Stationers' `Stationery List.xls`, with no duplicate names: 225 brochure products
  renamed to their full names ("LARGE" → "FLAG LARGE"), 87 recategorised, 55 brochure
  items the first load had lost created at brochure prices, and 1,173 stationery items
  added (BS-0001…) with no selling price yet. See [docs/CATALOGUE.md](docs/CATALOGUE.md).
  Record: [docs/catalogue-import-2026-10-27.csv](docs/catalogue-import-2026-10-27.csv).
  Backup `/root/pre-catalogue-import-20261027-172802.sql.gz`.
- **13 same-product pairs merged** across the two files (e.g. the brochure's "STAPLER HD
  23S24 (GIANT)" and the sheet's "KANGARO STAPLER HD 23 S 24"): the brochure product
  keeps its selling price and takes the sheet's buying price as cost; the copy, which
  had no sales or stock, is archived. The two Kangaro quotation products (DP 700 punch,
  HD 45S stapler) kept their own costs. Backup `/root/pre-duplicate-merge-20261027-175317.sql.gz`.
- **Buying price = the sheet's Retail column.** The import first took the W/Sale column
  as cost; the owner confirmed the Retail column is Booklab's buying price, so 801
  costs were changed to it (e.g. Acrylic Paint 100ml 150 → 170; the HD 23S24 stapler
  3,495 → 3,540). Only costs still as imported were touched. Backup
  `/root/pre-cost-retail-20261027-180522.sql.gz`.
- **Retail and school prices were cleared on every product and then restored.** A
  request to remove them was withdrawn minutes later ("from the Bhavinn sheet only pick
  cost, the rest remain"), so all 726 retail prices and 12 school prices went back to
  their previous values. Net effect: none. Both steps are in the audit log
  (`CLEAR_PRICES`, `RESTORE_PRICES`); the old prices are also in
  `/root/prices-before-clear-20261027-180943.tsv`.

## 2026-10-19 — Audit log shows nested details instead of "[object Object]"

- Entries holding a before/after record — permission changes, branch price changes,
  stock take schedules — printed `[object Object]` on the audit log page and in its
  CSV export. Nested values are now spelled out, booleans read yes/no, dates are
  formatted, and a before/after pair reads as one arrow, e.g. `role default →
  allowed until 20 Oct 2026, 23:59`. The stored records were always complete; only
  the display was wrong, so existing entries read correctly too.
- Deployed `cbde105` 2026-10-19 17:53 EAT (frontend only). **Rollback point:**
  `/root/deploy-bak-20261019-175318`; previous build at `frontend/dist-old-20261019-175318`.

## 2026-10-19 — Cashiers see customers and raise invoices; per-person permissions

### Cashiers and invoicing
- **Cashiers can see customers** — list, balances, statements and their branch's
  invoices — and **create, edit and issue invoices** for their own branch, and
  throw away their own drafts.
- A cashier's catalogue lines cannot go below the price for the invoice's tier: the
  lower of the branch's and the catalogue's, so the price the editor suggests is
  always accepted. Lines with no catalogue product are not checked.
- Delivering an invoice (it books the stock out), recording payments, adding or
  editing customers and cancelling an issued invoice stay with managers by default.

### Permissions, ported from PharmaCare
- **Administration → Permissions**: a searchable, paged grid of people against 13
  switches — see customers, create invoices, add/edit customers, deliver invoices,
  record payments, wholesale & school prices, discount past the cap, change branch
  prices, change stock counts, record stock intake, receive supplier deliveries,
  add/edit products, manage expenses.
- Each role has a default (cashiers: the two invoicing rights plus what they could
  already do; managers: everything). Tick to grant one person a switch, untick to
  refuse it, for the rest of today, 1/3/7/30 days, a typed number of days, or until
  turned off. An expired exception lapses on its own. Admins always have everything.
- Enforced on the server; every change is audited. The till's tiers and discount cap
  now follow the person's switches, and the app refreshes them when opened online.
- New table `UserPermission` (migration `20261019140000_user_permissions`).
  Exceptions sync down to branch laptops on their next pull.
- Deployed `31fa692` 2026-10-19 17:45 EAT. Tested first on a throwaway copy of the
  live database: earlier security suite 43/43, permissions 36/36. **Rollback point:**
  `/root/deploy-bak-20261019-174536` (database dump, backend, frontend source and dist).

## 2026-10-19 — Install the app on a phone, as in PharmaCare

- **Install the app** page (Administration → Install the app, every role): a
  one-tap **Install now** where Chrome allows it, step-by-step instructions for the
  browser the phone is using, and an explanation when a link was opened inside
  WhatsApp or Facebook, whose built-in browser can never install apps.
- The browser's install offer is caught at startup. Chrome fires it once, often on
  the sign-in page, and the app used to listen only after sign-in, so it was missed.
- **The installed app opens where you work:** admins and managers on the
  dashboard, cashiers on the till (start URL `/app`). Long-press the icon for
  Dashboard, Sell and Stock shortcuts. Signing in now returns you to the page you
  were heading for.
- Phones that already installed it keep the old start screen until Android
  refreshes the app's settings; reinstalling applies it at once.
- Deployed `276ca42` 2026-10-19 13:24 EAT (frontend only). **Rollback point:**
  `/root/deploy-bak-20261019-132400`; previous build at `frontend/dist-old-20261019-132400`.

## 2026-10-19 — Scheduled stock takes

- **Each branch can have a stock take schedule** — weekly, monthly or quarterly,
  from a chosen date — set by an admin on Stock → Stock take. Changes are audited.
- From a week before the date the dashboard shows **Stock take due**, and
  **overdue** once it has passed. Cashiers see their own branch; admins see all.
- Uploading a count completes it when it is within that week and covers at least
  90% of the products the branch holds — a one-line correction does not. It
  records who counted and when, and moves the date on by whole periods so it
  stays on the same day of the cycle.
- New table `StockTakeSchedule` (migration `20261019120000_stock_take_schedule`).
  Branch laptops pick it up on their next update.
- Deployed `fdcec71` 2026-10-19 13:17 EAT. Tested first on a throwaway copy of the
  live database (15/15). **Rollback point:** `/root/deploy-bak-20261019-131715`
  (database dump, backend without `node_modules`, frontend source and dist).

### Data correction
- PL-0123 (4Q) stood at −1 at Luanda: invoice INV-LUA-0001 (1 Oct) was delivered
  from Luanda, which had none, before delivery checked stock. The goods came from
  Kapsabet, so a transfer of 1 Kapsabet → Luanda was recorded (Kapsabet 10 → 9,
  Luanda −1 → 0), with paired movements and an audit entry. Backup taken first:
  `/root/pre-pl0123-fix-20261019-130744.sql.gz`.

## 2026-10-19 — Security, stock and P&L audit

Brought into line with the PharmaCare October audit, plus fixes found in Booklab's
own stock and reporting.

### Sign-in and accounts
- **Sales responses no longer carry password hashes.** Every sale included the
  cashier's full account record, hash and all, for anyone signed in to read.
- Deactivating, archiving, demoting or moving a user takes effect on their next
  request, not when their 12-hour token runs out.
- The login rate limit can no longer be dodged by rotating `X-Forwarded-For`: only
  nginx on 127.0.0.1 is trusted. Audit IPs are now the real client.
- A wrong password is always a flat 401. Account state is checked only after the
  password, so sign-in no longer reveals which accounts exist.
- The API refuses to start without a real `JWT_SECRET` (32+ characters), and
  listens on 127.0.0.1 unless `HOST` says otherwise. New passwords need 8 characters.
- Fastify 5 and current plugins: clears the critical `fast-jwt` advisory and the
  high ones in `@fastify/static` and `fast-uri`. `npm audit` is clean.

### Selling
- **No selling what the branch does not have.** An online sale or invoice delivery
  larger than the shelf is refused, and stock is taken off atomically so two tills
  cannot both sell the last copy. A sale the till recorded **offline** is still
  accepted — the goods have gone — and the shortfall shows as negative stock and is
  audited (`OVERSOLD_OFFLINE`).
- **Cashiers discount at most 10%** of the basket (`CASHIER_MAX_DISCOUNT_PCT`), and
  sell at retail only; wholesale and school prices need a manager or admin. Refused
  attempts are audited. The till applies the same rules, offline too.
- The till offers the branch's own wholesale and school prices, as the server checks.
- A double click can no longer void a sale twice, post a goods receipt twice or
  deliver an invoice twice.

### Profit & loss and stock
- **The sales report under-counted revenue** past the first 1,000 sales in a range.
- **The Z-report counted delivered invoices as cash in the drawer**, and took the
  month's payroll off expected cash on its last day. Invoices now show on their own
  `INVOICE` line; payroll is excluded.
- A delivered invoice books revenue **net of VAT**, includes non-catalogue lines,
  and is costed at the branch's own cost.
- Posting a goods receipt sets the receiving branch's cost; only an admin's receipt
  also changes the catalogue cost. Valuation and re-order cost use the branch cost.

### Who can see and change what
- Invoices, customers, suppliers and goods receipts are manager/admin on the API, as
  they already were on screen. Managers act only on their own branch's documents.
- Catalogue prices and costs, CSV import and archiving are admin-only. Managers set
  their own branch's prices on the stock page.

### Branch laptops
- A void made on a laptop now reaches the cloud.
- A delivery made on a laptop no longer comes off the cloud's stock twice.
- Synced movements are no longer floored at zero, so cloud stock equals its history.
- A laptop's token can only change its own branch's invoices and goods receipts, and
  its payments must match that branch's documents.

### Deployed
- `2b0c9b8` deployed 2026-10-19 12:18 EAT by file upload (prod is not a git checkout).
  Before it, prod's source matched `806ec93` except a server-regenerated
  `package-lock.json`, which this release replaces. Production's `JWT_SECRET` was
  checked first (64 characters), so nobody was signed out.
- Tested beforehand against a throwaway copy of the live database: 44/44 checks.
- **Rollback point:** `/root/deploy-bak-20261019-121805` (backend with
  `node_modules`, frontend source and dist); the previous build is also at
  `frontend/dist-old-20261019-121805`.
- Still to do: tills must accept the "Update available" prompt (an old build's
  offline sale that oversold would be refused and dropped), and the branch laptop
  needs this backend before its voids reach the cloud.

## 2026-08-14

### The app installs on a phone and keeps selling offline

Booklab is now a progressive web app. On a phone it can be installed to the home
screen and opened like any other app — full screen, its own icon, no browser bar.

- **The app shell is cached**, so it opens without a connection instead of
  showing a browser error. The catalogue, stock and branch list a till last saw
  are kept too, so there is something to sell from.
- **Sales made offline are held on the device** and sent when the connection
  returns. Each one carries the id it will be created with, so a sale that is
  retried on a flaky line is only ever rung up once — the server returns the
  existing sale rather than charging the customer again.
- **Two hours of trading, then it must reconnect.** The longer a till runs blind
  the further its stock drifts from the shop's and the more unsent money sits on
  one phone, so past the budget selling is paused until the device has
  reconciled. The countdown is on screen, and the clock runs from the last
  successful contact rather than from when the signal dropped.
- The strip at the top of every page shows what is unsent and offers to send it,
  and **M-Pesa is refused offline** rather than failing at the customer — it
  needs Safaricom, so an outage means cash.
- **Updates are offered, not forced.** A till must not reload itself mid-sale, so
  a new version raises a prompt and the user chooses when to take it. The app
  checks hourly, which matters for a device left open all day.
- Phone polish: safe-area padding so it paints correctly under a notch, no
  rubber-band scrolling, no accidental double-tap zoom, and 16px inputs so iOS
  does not zoom the page when a field takes focus.

A receipt printed offline keeps its logo: the receipt renders in an iframe the
service worker does not control, so the image is embedded rather than fetched.
A sale still queued shows an `OFFLINE-` reference and cannot be reprinted as a
duplicate, because the shop has not issued it a number yet.

### Receipts match the letterhead

The receipt header now mirrors the invoice: the logo sits to the left with the
shop name centred beside it, followed by the phone number and the branch.

Thermal printers cannot render colour, so receipts use a hard black-and-white
copy of the logo rather than the colour one, which dithered into grey. Both
print variants are derived from the source artwork by
`frontend/scripts/make-print-logos.ps1`, so they can be regenerated if the
branding ever changes.

### Cashiers can correct stock and prices, within limits

Waiting for a manager to fix an obvious miscount slows the shop down, so
cashiers can now do it themselves — with the controls that makes necessary.

- A cashier can **set a quantity**, **run a stock take** and **receive stock in
  bulk**, all recorded against their name in the stock history exactly as a
  manager's changes are.
- **Three corrections per product per day.** Repeatedly adjusting the same line
  is how stock loss gets papered over, so the fourth is refused and the attempt
  is written to the audit trail for a manager to see. A stock take counts
  towards the same limit and reports which lines it had to skip, so it cannot be
  used to go around it. Managers and admins are not limited.
- The stock screen shows a cashier how many corrections they have left on each
  product, so a refusal never comes as a surprise mid-count.
- A cashier can **raise** a branch price but **not drop it below the catalogue
  price**, and cannot clear one. The branch price is what the till's floor is
  measured against, so a cashier who could lower it could also sell below the
  price the shop set — which would have undone the price floor added on
  2026-08-11. Blocked attempts are audited.

## 2026-08-13

A branch can now trade through an internet outage. Two rounds of work: making the
sync engine actually function, then closing the two gaps that would have made
handing out laptops unwise.

### A branch laptop can be cut off

A branch token lasts ten years, and each laptop holds one. Losing a laptop
previously meant rotating the server secret and signing **everyone** out.

- Each token is now backed by a record, and every sync request checks it is still
  active. Revoking one from **Administration → Branch sync** stops that machine
  at its next request and leaves every other branch working.
- The screen shows which machine a token was issued for and when it last synced,
  so a branch that has quietly stopped reconciling is visible.
- A token is shown once, when issued. Issuing and revoking are both audited.

### Actions taken offline reach the audit trail

`AuditLog` had no global identity, so a void, price change or stock take made
during an outage stayed on the laptop. Entries now carry a `uuid` and travel with
everything else, keeping the original timestamp, user and IP. For a system where
the audit trail is a control, that gap mattered.

### The offline engine actually works now

It had been written but never run — production held no outbox or sync-state rows
at all — and it predated price tiers, VAT, units and discounts. Built a complete
branch install against production and repaired what it turned up:

- **A fresh branch showed nothing in stock.** On-hand was never sent, and a new
  branch database has no movement history to derive it from.
- Books arrived without their **unit, VAT rate or tier prices**, so a branch
  would have priced goods differently from the shop.
- Sale **discounts and price tier** were dropped in transit.
- **Stock takes, adjustments, transfers and the movements behind posting a goods
  receipt or delivering an invoice** were written without being queued, so those
  corrections never left the branch.
- The runner now **pushes before it pulls**, and only accepts the cloud's stock
  once its own queue has drained — otherwise reconnecting would quietly reverse
  sales made during the outage.
- **Trading documents could not sync at all.** Invoices, delivery notes, goods
  received and both payment tables had no `uuid`. They now do, and are upserted
  rather than appended, because a document is edited as a draft, issued, then
  delivered — the same one legitimately arrives more than once.
- **The branch had nothing to open.** A shop laptop has no nginx, so the API now
  serves the web app itself.
- **The branch build did not compile.** SQLite has no enums, so the branch client
  exports none. The domain enums moved to plain unions that work either side.

### Documents are numbered per branch

Numbers came from the cloud's autoincrement, so **two branches working offline
would both have issued `INV-0007`**. Each branch now has a code and its own
sequence — `INV-KAP-0007` — read back from what that branch has already issued.

### Database migrations

| Migration | Purpose |
|---|---|
| `20260813090000_document_sync_identity` | `Branch.code`; `uuid` on the invoice, goods receipt and payment tables |
| `20260813140000_audit_sync_and_revocable_tokens` | `AuditLog.uuid`; the `SyncToken` table |

### Verified

A real branch install — SQLite, the real API, the real web app, the sync runner —
run against production. 22 checks across the till, back office and reports pass,
including offline login and a cashier still being refused the P&L. A day's
trading pushed on reconnect as 8 events with no errors, and re-pushing sent
nothing. Stock agreed exactly: 283 on the branch, less 2 sold, plus 7 received,
plus 5 posted, landing at 293 in the cloud. A revoked token is refused on both
push and pull while a replacement for the same branch keeps working.

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
