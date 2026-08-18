#!/usr/bin/env bash
# Deploy the login-screen carousel: new table, new API route, rebuilt frontend.
set -euo pipefail
cd /var/www/booklab

echo "=== backend ==="
cd backend
npx prisma migrate deploy
npx prisma generate
npm run build
systemctl restart booklab-api

echo "=== frontend ==="
cd ../frontend
npm run build
chown -R www-data:www-data dist

echo "=== health ==="
sleep 3
systemctl is-active booklab-api
curl -s -o /dev/null -w 'GET /api/promo -> %{http_code}\n' http://127.0.0.1:4100/api/promo
curl -s http://127.0.0.1:4100/api/promo; echo
curl -s -o /dev/null -w 'GET /api/promo/manage (no auth) -> %{http_code} (expect 401)\n' http://127.0.0.1:4100/api/promo/manage
