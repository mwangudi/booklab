#!/usr/bin/env bash
# Deploy the username change and give the four accounts short sign-in names.
set -euo pipefail
cd /var/www/booklab

echo "=== backup before a schema change ==="
cd backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
mkdir -p /root/backups
F=/root/backups/booklab-preusername-$(date +%Y%m%d-%H%M%S).sql.gz
mysqldump -u booklab -p"$PW" --single-transaction --routines --triggers booklab 2>/dev/null | gzip -9 > "$F"
gunzip -t "$F" && echo "   $F OK"

echo
echo "=== migrate + build + restart ==="
npx prisma migrate deploy
npx prisma generate >/dev/null
npm run build
systemctl restart booklab-api

cd ../frontend
npm run build 2>&1 | tail -3
chown -R www-data:www-data dist

sleep 4
echo "  booklab-api: $(systemctl is-active booklab-api)"

echo
echo "=== assign usernames ==="
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }
q "
UPDATE User SET username='admin'            WHERE email='admin@booklabbookshop.co.ke';
UPDATE User SET username='luanda.cashier'   WHERE email='manager@booklabbookshop.co.ke';
UPDATE User SET username='kapsabet.cashier' WHERE email='cashier@booklabbookshop.co.ke';
UPDATE User SET username='mumias.cashier'   WHERE email='mumias.cashier@booklabbookshop.co.ke';
"
q "SELECT id, username, email, name, role, (SELECT name FROM Branch b WHERE b.id=u.branchId) branch FROM User u ORDER BY id;"
