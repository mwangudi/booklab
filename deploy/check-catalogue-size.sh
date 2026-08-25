#!/usr/bin/env bash
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }
echo "=== true catalogue size ==="
q "SELECT COUNT(*) total, SUM(deletedAt IS NULL) active,
          SUM(costPrice=0) no_cost, SUM(unitPrice=0) no_price FROM Book;"
echo
echo "=== by source ==="
q "SELECT CASE WHEN sku LIKE 'PL-%' THEN 'price list (new)'
               WHEN sku REGEXP '^ST[0-9]+$' THEN 'hand-entered ST'
               ELSE 'other' END src, COUNT(*) n, SUM(costPrice=0) no_cost
   FROM Book GROUP BY src;"
echo
echo "=== what the API returns (take limit bites here) ==="
echo -n "  GET /api/books rows: "
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin","password":"admin123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:4100/api/books" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))"
echo -n "  GET /api/stock/branch/1 rows: "
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:4100/api/stock/branch/1" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))"
