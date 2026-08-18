# Roadmap / status

Where the system actually stands. Everything below was checked against the live
server and the code, not from memory.

For what has to happen before the shop trades on this for real, see
[GO-LIVE.md](GO-LIVE.md). For what shipped when, see [../CHANGELOG.md](../CHANGELOG.md).

## Built and running in production

**Selling** — POS with price tiers, cash discounts recorded against the sale,
M-Pesa STK push, EPOS receipts on 58/80mm thermal printers, reprints stamped as
duplicates, and voids that return the stock and take the sale out of revenue. The
till catalogue is ordered by what that branch actually sells.

**Stock** — per-branch quantities, intake, inter-branch transfers, bulk stock
take from a count sheet, and a full movement history behind every change. Prices
cannot be sold below the shop's price, and cashiers are held to three quantity
corrections per product per day.

**Credit trading** — customers, invoices, delivery notes, statements with ageing;
suppliers, goods received notes that post stock and update cost, and supplier
statements that reconcile against theirs. VAT is configurable per customer, per
invoice and per line.

**Money and people** — expenses, payroll with PAYE/NSSF/SHIF/Housing Levy on
editable rates, P&L, sales, stock valuation, daily Z-report and a re-order
report, all exportable to CSV and PDF.

**Control** — role and branch scoping enforced server-side, and an audit trail
covering sign-ins, voids, reprints, price changes, stock corrections and payroll,
with an admin viewer.

**Offline** — a branch laptop runs the whole system against a local SQLite
database and reconciles with the cloud when it can. Phones install the app and
keep selling for up to two hours without a connection. See
[OFFLINE-SYNC.md](OFFLINE-SYNC.md).

## Not built

- **Refunds.** A sale can be voided in full; there is no partial refund or
  return-to-stock for one line of a sale. Nobody has asked for it yet.
- **Purchase orders.** Goods received records what arrived; there is no ordering
  step before it.
- **Customer-facing anything** — no online ordering, no customer login.
- **Email.** The system sends none, so there is no password reset by mail; an
  admin resets passwords.

## Known gaps

- **Branch laptops have never been deployed.** The runtime is built and proven
  end to end against production, but `branch/install-services.ps1` has not been
  run on real hardware.
- **A phone must be online once** before it can sell offline, because the
  catalogue is cached on first load.
- **Payroll, M-Pesa and stock-on-hand do not sync** to a branch. Payroll is
  head-office work, M-Pesa needs a connection anyway, and stock is deliberately
  snapshotted rather than synced. `node backend/scripts/sync-readiness.mjs`
  reports the current state.
- **The droplet is shared** with several unrelated applications, so anyone with
  root there can read this database.

## Infrastructure still to do

These are in [GO-LIVE.md](GO-LIVE.md) with the detail, but in short:

| | |
|---|---|
| **Nightly database backup** | **not configured — blocking** |
| Security headers in nginx | missing |
| Services bound to `0.0.0.0` | mitigated by `ufw`, worth tightening |
| Domain | not registered |
| M-Pesa | still `MPESA_ENV=mock` |
| Demo data | still live |
