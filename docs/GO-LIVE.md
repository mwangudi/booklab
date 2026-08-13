# Go-live requirements

What has to be in place before Booklab Bookshop stops being a demonstration and
starts running the shop. Audited against the live server on 2026-08-13.

The system itself is built and working. Almost everything below is procurement,
data preparation and one real infrastructure gap — **there is no scheduled
database backup**, which has to be fixed before a single real sale is recorded.

---

## 1. Shopping list

| Item | Quantity | Notes |
|---|---|---|
| Domain name | 1 | `.co.ke` from a Kenyan registrar (KENIC accredited), or `.com` |
| Email hosting | 1 | cPanel bundle **or** Google Workspace / Zoho — see §2 |
| Thermal receipt printer | 1 per till | 80mm recommended, must have a Windows driver — see §5 |
| Thermal paper rolls | ongoing | 80mm × 80mm diameter |
| Branch laptops | already owned | Windows, for the offline branch runtime |
| UPS or power bank | 1 per branch | see §5 |
| Safaricom Daraja production account | 1 | Paybill or Till — see §4 |

---

## 2. Domain and DNS

The domain has not been registered yet. The app currently answers on
`booklab.localinvestors.co.ke`, which is a temporary address.

### About cPanel

**You probably do not need cPanel to run this system, and buying it will not
host the app.** cPanel comes bundled with shared web hosting. If DNS points at
the droplet — which is the plan — then the shared hosting serves nothing and the
money is only buying you email and a control panel.

The one thing it is genuinely useful for is **business email**
(`info@booklabbookshop.co.ke`). Two options:

| Option | Cost | Notes |
|---|---|---|
| cPanel shared hosting | low | Email plus a panel you already know. The web space sits idle. |
| Google Workspace / Zoho Mail | low–free tier | Email only, better spam handling, no idle hosting |

Either works. **This application sends no email at all** — there is no SMTP
anywhere in the codebase — so email is a business need, not a system dependency.
Note the consequence: **there is no "forgot password" email.** An admin resets
passwords from *Administration → Users*.

### DNS records

Once registered, whichever host you buy from:

| Record | Name | Value | Purpose |
|---|---|---|---|
| `A` | `@` or `app` | `46.101.6.131` | Points the app at the droplet |
| `A` | `www` | `46.101.6.131` | Optional |
| `MX` | `@` | your mail host | Only if you take email |
| `TXT` | `@` | SPF from your mail host | Stops your invoices being marked spam |

Delete any parking or "coming soon" `A` record the registrar adds by default —
that is the usual reason a new domain shows the wrong page.

### Cutover to the new domain

Changing domain is not just DNS. All of these have to move together:

1. `A` record → `46.101.6.131`, and wait for propagation (up to 24h, usually minutes)
2. nginx `server_name` updated and a new certificate issued: `certbot --nginx -d <domain>`
3. `CORS_ORIGIN` in `backend/.env` updated to the new address
4. `MPESA_CALLBACK_URL` updated **and re-registered with Safaricom** — payments
   fail silently if the callback still points at the old host
5. `CLOUD_URL` updated in `backend/.env` on every branch laptop
6. Keep the old address working until every branch is confirmed moved

---

## 3. Server and infrastructure

The droplet is `ubuntu-s-2vcpu-4gb-lon1`, 2 cores, 3.8 GB RAM, 77 GB disk
(37 GB free). The Booklab database is only 7 MB, so capacity is not a concern.

### It is a shared machine

The droplet also runs **PharmaCare, four BrokerKnow services, SQL Server and
MailHog**. That is not automatically wrong, but it means:

- RAM is the constraint, not disk — 1.6 GB was free at audit. SQL Server is the
  heavy tenant.
- A problem in another application can take Booklab down with it.
- Anyone with root on that box can read the Booklab database.

If the shop grows, or if you want the shop's data isolated from other clients'
systems, Booklab should get its own droplet. It is not urgent, but it is a
decision to make deliberately rather than by accident.

### Blocking issue — no database backup

**This must be fixed before go-live.** The only scheduled backup on the machine
belongs to BrokerKnow. Booklab has none. The backups sitting in `/root/backups`
are ones taken by hand before migrations.

Required:

- a nightly `mysqldump` of `booklab`, compressed, kept for at least 30 days
- copied **off the droplet** — a backup that only exists on the machine that
  fails is not a backup. DigitalOcean Spaces, Google Drive or a company laptop.
- **a restore tested at least once.** An untested backup is a guess.
- DigitalOcean droplet snapshots enabled as a second line (console setting, paid)

At 7 MB compressed this costs almost nothing and takes minutes to set up.

### Security hardening

Currently in place: `ufw` is active and allows only SSH and nginx; TLS is valid
and renews automatically via certbot; passwords are bcrypt hashed; every
sensitive action is audited.

Worth doing before real trading:

| Gap | Why it matters |
|---|---|
| No security headers | No HSTS, `X-Content-Type-Options`, `X-Frame-Options` or `Referrer-Policy`. Cheap to add in nginx, and expected of a system handling money. |
| Services bind to `0.0.0.0` | Ports 4000, 4100 and 1433 listen on all interfaces. `ufw` blocks them today, so this is defence-in-depth, not an open door — but if the firewall is ever flushed they are exposed. Bind to `127.0.0.1`. |
| SSH password login | Confirm it is key-only. |
| `JWT_SECRET` | Must be a long random value, and different from any branch laptop's. |

---

## 4. M-Pesa

Currently `MPESA_ENV=mock` — payments are simulated end to end and **no real
money moves**. That is correct for demonstration and must be changed for trading.

Needed from Safaricom (Daraja portal):

- production Consumer Key and Consumer Secret
- the Paybill or Till number, and its Passkey
- `MPESA_TX_TYPE` set to match (Paybill vs Till — getting this wrong rejects every payment)
- `MPESA_CALLBACK_URL` on the new domain, publicly reachable over HTTPS, and
  registered with Safaricom

Go-live on Daraja takes a few days and requires the business's KRA PIN and
certificate of registration, so start it early.

**Until this is done the till is cash only.** M-Pesa also cannot work during an
internet outage, so branches need a cash procedure regardless.

---

## 5. Hardware per branch

### Thermal printer

Receipts print through the browser's print dialog, not by raw ESC/POS, so the
printer needs **a Windows driver** — USB, Bluetooth or network all work.

- **80mm is recommended.** The layout is tuned to 72mm of printable width and
  has more room for product names. 58mm is supported and selectable per till.
- Any generic ESC/POS printer with a Windows driver will do — Epson TM-T20III,
  Xprinter XP-80C and similar are common in Nairobi.
- One per till, not per branch, if a branch runs two tills.

Set up under **Till → Receipt & printer**: choose the paper width, add the
footer note, then use *Test print*. In the browser print dialog set margins to
**None** and turn headers and footers off.

> Test one printer before buying three. The receipt layout leaves a margin the
> driver should not clip, but drivers vary and some add their own on top.

### Other

- **Power.** A UPS or inverter at each branch. The branch runtime keeps working
  without internet, but not without electricity.
- **Internet.** Not required minute to minute — that is the point of the branch
  runtime — but each branch needs a connection at least daily so the day's
  trading reconciles.
- A **barcode scanner** is optional. Products are found by typing; a scanner
  configured as a keyboard would work with the search box but nothing depends
  on it.

---

## 6. Data to prepare

This is the part that takes real effort, and the part that decides whether the
figures can be trusted. Everything currently in the system is invented.

### What is in there now

| | Now | Status |
|---|---|---|
| Products | 35 | demo catalogue |
| Branches | 3 | **real** — Luanda `LUA`, Kapsabet `KAP`, Mumias `MUM` |
| Users | 4 | demo accounts |
| Customers | 5 | demo — 166 real ones prepared, not imported |
| Suppliers | 4 | demo |
| Employees | 6 | demo |
| Sales / invoices / receipts / payroll | 2,776 / 12 / 10 / 2 | demo, to be cleared |

### Catalogue

- **Real cost and selling prices for every product.** Cost price drives every
  profit figure in the system — a wrong cost makes the P&L confidently wrong.
- **Tier prices.** 22 of the 35 current products have no wholesale or school
  price. Where those are blank the retail price is charged, so schools would be
  billed retail. Decide a wholesale and school price for anything sold on those
  terms.
- `docs/booklab-pricelist.csv` holds the shop's price list and can be imported
  from *Products → Import CSV*.
- Set the **unit** (piece, dozen, ream, carton…) and **VAT rate** per product.
  Printed books are zero-rated; stationery is not.

### Opening stock — the big one

On cutover day you need a **physical count of every product at every branch**.
Enter it through *Stock take*, which takes a count sheet and records each
difference against the person who counted.

Nothing downstream is trustworthy until this is right: stock valuation, the
re-order report, and gross profit all descend from it. Plan for it to take a
day, and count when the shop is closed.

### Customers

- 166 schools are prepared in `docs/booklab-clients.csv`, ready to import.
- They are **names only.** Contact person, phone, address and KRA PIN are blank
  and print on invoices and statements — fill them in as you trade.
- Eight arrived as shorthand and need full names before they appear on a
  document: `Shitsitswi`, `Ekambara`, `Sitabicha`, `Matumbai blm`,
  `ST. Peter boys`, `Mumias Complex`, `Bulanda RC`, `Ebukhokoro junior school`.
- **Decide the VAT default per school** — whether they are charged VAT, and
  whether prices are inclusive or exclusive.
- **Opening balances.** Any school that already owes money needs that debt
  entered as an opening balance, or the statements will understate what is due.

### Suppliers

Real suppliers, payment terms, and **opening balances for anything already
owed** — otherwise the supplier statements will not reconcile against theirs.

### Payroll

Employees, salaries, KRA PIN, NSSF and SHIF numbers. Check the statutory rates
under *Payroll settings* against the current year's rates before the first run.

---

## 7. Accounts and access

- Create **real user accounts** for each member of staff, with their own
  password. Shared logins destroy the audit trail — it can only tell you a
  login did something, not who was holding it.
- Assign each cashier to their branch. Branch scoping is enforced on the server.
- **Delete the four demo accounts**, or at minimum change every password.
- Remove the demo credentials shown on the login page.
- Decide who is Admin. Admin can see every branch, change prices without limit
  and revoke branch access — it should be one or two people.

Roles as built:

| Role | Can |
|---|---|
| Cashier | Sell, discount, receive stock, count stock, correct a quantity 3× per product per day, raise a branch price (never below catalogue) |
| Manager | Everything above without limits, plus voids, transfers, reports, invoicing, purchasing |
| Admin | Everything, plus users, branches, payroll and branch sync tokens |

---

## 8. Cutover

In order, on a day the shop is closed:

1. Back up the database and keep the file somewhere safe.
2. `cd backend && npm run seed:demo -- --clear` — removes the demo sales,
   invoices, receipts, payroll and customers. The catalogue, branches and users
   are left alone.
3. Import the real catalogue and check prices.
4. Import `docs/booklab-clients.csv`, then suppliers.
5. Enter opening balances for customers and suppliers.
6. Count and enter opening stock at every branch.
7. Create real users, delete the demo ones.
8. Switch M-Pesa to production and put a real payment through, then refund it.
9. Test print a receipt on each till.
10. Confirm the nightly backup ran, and **restore it somewhere to prove it works**.

Then trade for a week on one branch before moving the others.

---

## 9. After go-live

- Check the **audit log** weekly at first — particularly voids, price changes
  and blocked stock corrections.
- Watch the **Z-report** each evening against the cash counted in the drawer.
- If branches are running offline, check *Administration → Branch sync* for a
  branch that has stopped reconciling.
- Renew nothing manually: TLS renews via `certbot.timer`. The Booklab
  certificate currently expires **2026-10-08**.
- Keep `docs/booklab-clients.csv` and the spreadsheets in step — re-run
  `node backend/scripts/build-client-list.mjs` if either changes.

---

## Still outstanding in the system

Honest list of what is not finished:

- **Mobile PWA** — requested, not started. Phones cannot install the app or work
  offline yet.
- **Branch laptops have never been deployed.** The runtime is built and proven
  against production, but `install-services.ps1` has not been run on real
  hardware.
- **Payroll and M-Pesa do not sync** to a branch. Payroll is head-office work and
  M-Pesa needs a connection anyway, so neither blocks trading.
