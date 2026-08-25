# Booklab: changes worth carrying over from PharmaCare

**Written** 2026-08-25 · **For** a fresh context window working in `c:\Users\v-mwangudi\source\repos\bookshop`
**Deployed as** `booklab` — `/var/www/booklab`, service `booklab-api`, database `booklab`,
nginx `booklab.localinvestors.co.ke.conf`, same droplet as pharma (`root@46.101.6.131`).

Between 21–25 August a set of fixes went into PharmaCare. This document records which of them
apply to Booklab, which do **not**, and why — based on reading the deployed code and querying the
live `booklab` database, not on assumption.

Booklab is live and material: **2,776 sales, KES 6,189,030 recorded revenue, 5,695 sale lines.**
Treat it as production.

---

## Summary

| # | Change | Applies? | Priority |
|---|---|---|---|
| 1 | Money rounded to whole shillings | **Yes — 3 formatters + 11 CSV exports** | **done 25 Aug** |
| 2 | gzip missing on nginx | Already fixed (shared config) | done |
| 3 | Selling at a price of zero | Guard added to `POST /sales` | **done 25 Aug** |
| 4 | PWA "Update available" friction | Same behaviour | note only |
| 5 | Local-date handling | **Already correct in Booklab** | none |
| 6 | Branch fixed for non-admins | Already handled | optional polish |
| 7 | React #185 render loop | Not present | none |
| 8 | Per-branch price overriding a master price | Present but a different design | review only |
| 9 | Cashier correction limit | Present, better design than pharma | none |

---

## 1. Money is rounded to whole shillings — P1

The exact bug fixed in pharma on 24–25 August. Booklab has **three** independent money
formatters and **all three round**:

| File | Line | Code |
|---|---|---|
| `frontend/src/lib/format.ts` | 10, 13 | `fmt = Math.round(num(v)).toLocaleString('en-KE')` → `money = KES ${fmt(v)}` |
| `frontend/src/lib/printReceipt.ts` | 45 | `const money = (n) => 'KES ' + Math.round(n).toLocaleString('en-KE')` |
| `frontend/src/lib/documents.ts` | 16 | `const money = (n) => Math.round(num(n)).toLocaleString('en-KE')` |

### Why it matters here specifically

Book prices are all whole shillings today (verified: `0` of 35 books have cents), so shelf prices
look fine. The damage is in **derived** amounts:

- **Invoices — 5 of 12 have cents.** `documents.ts` renders the invoice PDF sent to customers
  (schools). Subtotal, **VAT** and TOTAL are all rounded. VAT at 16% on whole amounts almost
  always produces cents, so the tax line on a customer document is wrong.
- **Customer statements and ageing** use the same helper — `openingBalance`, `closingBalance`,
  `amountDue`, and all five ageing buckets.
- **Payroll — 3 expense rows carry cents**: `150,571.25`, `99,437.50`, `74,121.25`. PAYE/SHA/NSSF
  deductions inherently produce cents.
- **Cash and change on the till receipt.** `printReceipt.ts` rounds `cashGiven` and `change`.
  Rounding the change handed to a customer is a straight cash-handling error.

### The fix is small — Booklab is better structured than pharma was

Pharma needed 181 call sites reviewed because one helper served both money and counts. Booklab
already separates them, so the split is clean:

- **265** total call sites
- **195** already go through `money()` → fixed by changing **one line**
- **~67** `fmt()` calls are genuinely counts (units, transactions, SKUs, payslips) → **leave alone**

> **Correction, 2026-08-25 — applied.** An earlier draft of this document named three `fmt()`
> call sites as money and told you to switch them to `money()`. All three are **counts**, and
> changing them would have rendered "KES 3.00" where the screen means "3 customers" — precisely
> the trap this section warns about. Checked against the backend before editing:
>
> | Site | What it actually is | Evidence |
> |---|---|---|
> | `CustomersPage.tsx:65` `fmt(…invoices)` | count of invoices | `invoices: c.invoices.length` — `invoices.ts:677` |
> | `CustomersPage.tsx:129` `fmt(owing)` | count of customers in debt | `balances.filter(b => b.balance > 0).length` |
> | `SuppliersPage.tsx:135` `fmt(…receipts)` | count of goods receipts | `receipts: s.receipts.length` — `goodsReceipts.ts:504` |
>
> Note `invoices` vs `invoiced` and `receipts` vs `billed` — the money fields sit next to the
> counts and are named almost identically. **Left unchanged.**
>
> **What the draft missed:** money is also rounded in **eleven CSV exports**, via `Math.round()`
> rather than the formatters — customer and supplier statements, P&L, sales, stock, Z-report,
> re-order, payroll and both balance exports. A statement CSV that drops cents will not
> reconcile against the customer's own ledger. All eleven now emit the raw two-decimal value;
> genuine integers (quantities, page counts, pixels) were left alone.

### Change plan

```ts
// frontend/src/lib/format.ts
/** Rounded integer with thousands separators — for COUNTS, not money. */
export const fmt = (v: unknown): string => Math.round(num(v)).toLocaleString('en-KE');

/** Money. Always two decimals: a receipt must agree with the cash drawer. */
export const money = (v: unknown): string =>
  `KES ${num(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

Then the same two-decimal treatment in `printReceipt.ts:45` and `documents.ts:16` (both are
local helpers; note `documents.ts` omits the `KES` prefix — keep that difference).

**Do not** blanket-replace `fmt` → `money`. In pharma the counts were the trap: it is what turns
"4,822 products" into "4,822.00". Confirm what a field *is* on the backend before moving it —
see the correction above, where three such fields were misread from their labels alone.

### How to verify

```sql
-- invoices that must now show cents on the PDF
SELECT id, invoiceNo, total FROM Invoice WHERE total <> ROUND(total);   -- expect 5 rows
SELECT id, amount, description FROM Expense WHERE amount <> ROUND(amount);  -- expect 3 payroll rows
```

Then in the UI: open one of those invoices, download the PDF, and confirm subtotal/VAT/total carry
cents and **add up**. Ring a till sale with cash tendered above the total and check the change line.

---

## 2. gzip — already done, no action

nginx had `gzip on` but `gzip_types`/`gzip_proxied` commented out, so only HTML was compressed.
Fixed on 24 August via `/etc/nginx/conf.d/gzip.conf`, which sits in the **http block** and therefore
already covers Booklab. Confirmed live:

```
curl -I -H "Accept-Encoding: gzip" https://booklab.localinvestors.co.ke/
→ Content-Encoding: gzip
```

Booklab got this benefit for free. The file is version-controlled in the pharma repo at
`deploy/nginx/gzip.conf`; worth copying into the bookshop repo's `deploy/` so it is not lost if the
droplet is rebuilt.

---

## 3. A sale can still be priced at zero — P3

Booklab is **already ahead of pharma** here: `backend/src/routes/sales.ts:70-90` enforces a price
floor and refuses lines below it —
*"These items are priced below the set price: …"*. Pharma had nothing equivalent until 23 August.

The gap: the floor is derived from the book price, and the schema allows `unitPrice` of `0`
(`z.number().nonnegative()`), so if a book were ever saved at 0 the floor becomes 0 and the line
would sell for nothing without complaint. In pharma this was not theoretical — 66 in-stock items at
Mbita had a price of 0 and were ringing up **free**.

Current Booklab exposure is **nil**:

```
books priced zero: 0      in stock with zero price: 0      sale lines at zero: 0
```

So this is a guard against future data, not a live problem. Suggested: reject a line whose computed
floor is `0` with a clear message ("No price set for X — set a price before selling"), the same rule
pharma now enforces in `POST /sales`.

---

## 4. PWA update friction — note, not a change

`frontend/vite.config.ts` uses `registerType: 'prompt'`, same as pharma. Staff keep the old build
until they tap **Update available**. This is deliberate — auto-updating could swap the app mid-sale —
but it caused repeated "I still see the old screen" confusion at the pharmacy branches.

No code change recommended. Just be aware when verifying a deploy: **clear the service worker or tap
Update**, or you will test the previous build and believe your change did not land. This wasted time
twice during the pharma work.

---

## 5–9. Already correct in Booklab — no action

- **Local dates.** `format.ts:isoDate()` builds `yyyy-mm-dd` from local parts and even carries the
  comment explaining that `toISOString()` shifts a day east of Greenwich. Pharma stored a 28 August
  expiry as *27 August 21:00* because of exactly this. Booklab got it right first.
  *(Note: pharma's `StockIntakeNewPage` still has the bug — unrelated to Booklab.)*
- **Branch fixed for non-admins.** `components/BranchSelect.tsx` disables the control when a
  non-admin has one branch, and the backend only returns their own branch. Pharma exposed all 9
  branches to cashiers in a dropdown that was then ignored. Optional polish: render plain text
  rather than a disabled dropdown — a disabled control still invites a tap and looks broken.
- **React #185 (infinite render).** Caused in pharma by `q.data ?? []` used directly as a
  `useEffect` dependency. Booklab uses `?? []` only inside `useMemo`/render and passes the raw
  query result as the dependency. Searched — no instance found.
- **Per-branch price.** `Stock.price` overrides `Book.unitPrice` when set. This *looks* like the
  master-price fallback removed from pharma, but the situations differ: in pharma the master field
  was being overwritten by branch imports, so a branch could sell at a price nobody there had chosen.
  A bookshop has a genuine catalogue/RRP, so the fallback is defensible. **Review, don't copy.** If
  branch imports ever start writing to `Book.unitPrice`, revisit.
- **Cashier correction limit.** `backend/src/routes/stock.ts:33` `CASHIER_ADJUST_LIMIT = 3`, counted
  **per day and per cashier** (`adjustmentsToday`). This is a better design than pharma's all-time
  count, which is why pharma's had to be raised to 5 mid-stock-take. Leave as is unless staff hit it;
  if they do, raise the constant rather than changing the shape.

---

## Suggested order of work

1. **The three money formatters** (P1). One line each, plus 3 call sites. Highest value, lowest risk.
2. Verify against the 5 invoices and 3 payroll expenses listed above, and a live till sale with change.
3. Copy `deploy/nginx/gzip.conf` into the bookshop repo for durability.
4. Add the zero-price guard to `POST /sales` (P3).

## Before deploying

Booklab holds real money. Take a backup first — the pattern used for pharma:

```bash
ssh root@46.101.6.131 'mkdir -p /root/backups; \
  mysqldump --single-transaction --routines --triggers booklab \
  | gzip -9 > /root/backups/booklab-$(date +%Y%m%d-%H%M%S).sql.gz'
```

Deploy is frontend-only for the P1 fix:

```bash
cd /var/www/booklab/frontend && npm run build && chown -R www-data:www-data dist
```

No migration, no API restart, no data change — so rollback is simply rebuilding the previous commit.

## Evidence behind this document

All figures were read from the live system on 2026-08-25, not inferred:
deployed source under `/var/www/booklab`, the `booklab` MySQL database, and a live HTTP response
header check for gzip. The local repo at `c:\Users\v-mwangudi\source\repos\bookshop` (branch
`develop`, HEAD `b6a8f4c`) was confirmed to match the deployed code for every file named here.
