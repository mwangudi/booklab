#!/usr/bin/env bash
set -euo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
mkdir -p /root/backups
F=/root/backups/booklab-pretierprices-$(date +%Y%m%d-%H%M%S).sql.gz
mysqldump -u booklab -p"$PW" --single-transaction --routines --triggers booklab 2>/dev/null | gzip -9 > "$F"
gunzip -t "$F" && echo "backup OK: $F"

npx prisma migrate deploy
npx prisma generate >/dev/null
npm run build
systemctl restart booklab-api

cd ../frontend
npm run build 2>&1 | tail -2
chown -R www-data:www-data dist
sleep 4
echo "booklab-api: $(systemctl is-active booklab-api)"
