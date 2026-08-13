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

The system runs on **demonstration data**. Everything that has to be in place
before the shop trades on it for real — domain and DNS, M-Pesa production
credentials, thermal printers, opening stock, the client list, and the database
backup that is **not yet scheduled** — is in [GO-LIVE.md](GO-LIVE.md).
