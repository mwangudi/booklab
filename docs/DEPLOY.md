# Deploying the cloud (master)

Mirrors the PharmaCare deploy. The cloud runs with `SYNC_ROLE=cloud` (default), so the
outbox stays empty there and it simply serves the API + accepts branch sync.

## 1. Server prerequisites
Node 20 LTS, Nginx, MySQL 8, Certbot.

## 2. Database
```sql
CREATE DATABASE bookshop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bookshop'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON bookshop.* TO 'bookshop'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Backend
```bash
cd /var/www/bookshop/backend
cp .env.production.example .env      # set DATABASE_URL + JWT_SECRET
npm ci
npx prisma migrate deploy
npm run seed
npm run build
# run as a service (systemd), e.g. bookshop-api on port 4000 (localhost only)
```

## 4. Frontend
```bash
cd /var/www/bookshop/frontend
npm ci
npm run build                        # static dist/ served by Nginx
```

## 5. Nginx + HTTPS
Serve the SPA and proxy `/api` to `127.0.0.1:4000`; then `certbot --nginx -d bookshop.example.co.ke`.

## 6. Redeploys
```bash
cd /var/www/bookshop/backend  && git pull && npm ci && npx prisma migrate deploy && npm run build && systemctl restart bookshop-api
cd /var/www/bookshop/frontend && npm ci && npm run build && systemctl reload nginx
```

> Migration safety: `prisma migrate deploy` applies committed migrations only. Back up the DB
> (`mysqldump --no-tablespaces bookshop > backup.sql`) before applying new migrations in production.

## 7. Going live

The system currently runs on **demonstration data**. Before the shop trades on it
for real, in this order:

1. **Back up first.** `mysqldump --single-transaction booklab | gzip > pre-golive.sql.gz`
2. **Clear the demo data.** `cd backend && npm run seed:demo -- --clear` removes the
   invented sales, invoices, receipts, payroll and customers. The catalogue,
   branches and users are left alone.
3. **Import the real client list.** `docs/booklab-clients.csv` holds the **166
   schools** the shop supplies, built from the two spreadsheets in `docs/` by
   `node backend/scripts/build-client-list.mjs`. Re-run that if either
   spreadsheet changes.
   - Only the **names** are known. Contact, phone, address and KRA PIN are blank
     and need filling in as the shop trades — they print on invoices and
     statements, so an invoice raised before then has a bare header.
   - `chargeVat` and `vatMode` are deliberately left blank: printed books are
     zero-rated and stationery is not, so the default per school is a decision
     for the shop, not something to guess here.
   - Eight entries came through as shorthand (`Shitsitswi`, `Ekambara`,
     `Sitabicha`, `Matumbai blm`, `ST. Peter boys`, `Mumias Complex`,
     `Bulanda RC`, `Ebukhokoro junior school`) and need their full names before
     they appear on a document.
   - Six names were confirmed by the PM against the source rows, which had the
     wrong level on most of them: Mushinaka Junior, Musinaaka Junior, Esiandumba
     Junior, Emmaloba Junior, Emmatsi Junior and Muchula Junior. Mushinaka and
     Musinaaka look alike but are two different schools.
   - Names sharing a stem but at a different level — `ABUCHE JUNIOR` and
     `ABUCHE PRIMARY`, `WANDECHE JUNIOR` and `WANDECHE PRIMARY`, and similar —
     are kept as separate schools. Confirm that is right.
4. **Turn off M-Pesa test mode.** `MPESA_ENV=mock` simulates payments. Restore the
   live Daraja credentials before taking real money.
5. **Remove the demo credentials from the login page** if they are still shown.
6. **Set each branch's code** (`Administration → Branches`). Codes prefix every
   invoice and delivery note — `INV-KAP-0007` — and must not be changed once
   documents have been issued.
