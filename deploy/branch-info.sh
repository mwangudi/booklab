#!/usr/bin/env bash
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
echo "=== branches (you need the id for the sync token) ==="
mysql -u booklab -p"$PW" booklab --batch -e "SELECT id, code, name, location FROM Branch ORDER BY id;" 2>/dev/null
echo
echo "=== existing sync tokens ==="
mysql -u booklab -p"$PW" booklab --batch -e "SELECT id, branchId, label, active, lastUsedAt FROM SyncToken ORDER BY id;" 2>/dev/null
echo
echo "=== node version on the server (match it on the laptop) ==="
node -v
