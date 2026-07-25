#!/usr/bin/env bash
# Booklab Bookshop — redeploy after code changes. Run as root.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/booklab}"

cd "$APP_DIR/backend"
export DATABASE_URL="$(sed -n 's#^DATABASE_URL="\(.*\)"#\1#p' .env)"
npm install --include=dev --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run build

cd "$APP_DIR/frontend"
npm install --include=dev --no-audit --no-fund
npm run build

chown -R www-data:www-data "$APP_DIR"
systemctl restart booklab-api
systemctl reload nginx
echo "Redeployed → https://booklab.localinvestors.co.ke"
