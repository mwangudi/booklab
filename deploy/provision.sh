#!/usr/bin/env bash
# Booklab Bookshop — one-shot provisioning on the cloud droplet. Run as root.
# Idempotent: safe to re-run (keeps existing .env; seed uses upserts).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/booklab}"
DOMAIN="${DOMAIN:-www.booklabbookshop.co.ke}"
PORT="${PORT:-4100}"
DB_NAME="${DB_NAME:-booklab}"
DB_USER="${DB_USER:-booklab}"
LE_EMAIL="${LE_EMAIL:?set LE_EMAIL to the address for certificate renewal notices}"

echo "==> Booklab provisioning ($DOMAIN, port $PORT)"
cd "$APP_DIR/backend"

# --- backend/.env (generate once; preserve secrets on re-run) ---
if [ ! -f .env ]; then
  echo "==> Generating backend/.env"
  DB_PASS="$(openssl rand -hex 16)"
  JWT="$(openssl rand -hex 32)"
  cat > .env <<EOF
DATABASE_URL="mysql://${DB_USER}:${DB_PASS}@localhost:3306/${DB_NAME}"
JWT_SECRET="${JWT}"
PORT=${PORT}
NODE_ENV=production
CORS_ORIGIN="https://${DOMAIN}"
SYNC_ROLE=cloud

# M-Pesa (Daraja). Empty consumer key/secret => mock mode until real creds are set.
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=""
MPESA_CONSUMER_SECRET=""
MPESA_SHORTCODE="174379"
MPESA_PASSKEY="bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
MPESA_TX_TYPE=CustomerPayBillOnline
MPESA_PARTYB=""
MPESA_CALLBACK_URL="https://${DOMAIN}/api/mpesa/callback"
MPESA_ACCOUNT_REF="Booklab"
EOF
else
  echo "==> Keeping existing backend/.env"
fi

export DATABASE_URL="$(sed -n 's#^DATABASE_URL="\(.*\)"#\1#p' .env)"
DB_PASS="$(printf '%s' "$DATABASE_URL" | sed -n 's#mysql://[^:]*:\([^@]*\)@.*#\1#p')"

# --- MySQL database + user (idempotent; root uses socket auth) ---
echo "==> Ensuring MySQL database & user"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# --- Backend: install, migrate, seed, build ---
echo "==> Backend install & build"
npm install --include=dev --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run seed || echo "   (seed skipped/failed — continuing)"
npm run build

# --- Frontend: install & build ---
echo "==> Frontend install & build"
cd "$APP_DIR/frontend"
npm install --include=dev --no-audit --no-fund
npm run build

# --- Ownership ---
chown -R www-data:www-data "$APP_DIR"

# --- systemd service ---
echo "==> systemd service"
cp "$APP_DIR/deploy/systemd/booklab-api.service" /etc/systemd/system/booklab-api.service
systemctl daemon-reload
systemctl enable booklab-api
systemctl restart booklab-api

# --- HTTPS certificate first (the vhost references it), via a temporary HTTP-only vhost ---
APEX="${DOMAIN#www.}"
VHOST="${APEX}.conf"
echo "==> TLS certificate for ${DOMAIN} and ${APEX}"
mkdir -p /var/www/letsencrypt
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cat > "/etc/nginx/sites-available/${VHOST}" <<NGX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${APEX};
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 404; }
}
NGX
  ln -sf "/etc/nginx/sites-available/${VHOST}" "/etc/nginx/sites-enabled/${VHOST}"
  nginx -t && systemctl reload nginx && sleep 2
  certbot certonly --webroot -w /var/www/letsencrypt -d "${DOMAIN}" -d "${APEX}"     --non-interactive --agree-tos -m "${LE_EMAIL}" --keep-until-expiring
fi

# --- Nginx vhost: HTTPS on www, apex and HTTP redirect to it ---
echo "==> Nginx vhost"
cp "$APP_DIR/deploy/nginx/${VHOST}" "/etc/nginx/sites-available/${VHOST}"
ln -sf "/etc/nginx/sites-available/${VHOST}" "/etc/nginx/sites-enabled/${VHOST}"
cp "$APP_DIR/deploy/nginx/booklab-security.conf" /etc/nginx/snippets/booklab-security.conf
nginx -t
systemctl reload nginx

echo "==> Done → https://${DOMAIN}"
sleep 1
systemctl --no-pager status booklab-api | head -n 8 || true
