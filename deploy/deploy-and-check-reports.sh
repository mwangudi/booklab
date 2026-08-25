#!/usr/bin/env bash
set -uo pipefail
cd /var/www/booklab
tar -xzf /tmp/b10.tgz
cd frontend && npm run build 2>&1 | tail -2
chown -R www-data:www-data dist
echo "deployed"

echo
echo "=== are the reports actually branch-filtered? ==="
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin","password":"admin123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

count() { python3 -c 'import sys,json;d=json.load(sys.stdin);print(len(d["rows"]) if isinstance(d,dict) and "rows" in d else (len(d) if isinstance(d,list) else d))'; }

for b in 1 2 3; do
  printf '  stock report branch %s -> ' "$b"
  curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:4100/api/reports/stock?branchId=$b" | count
done
printf '  stock report all         -> '
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:4100/api/reports/stock" | count

echo
echo "  a cashier is confined to their own branch:"
CT=$(curl -s -X POST http://127.0.0.1:4100/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"kapsabet.cashier","password":"cashier123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
printf '    cashier asks for Luanda (branch 1) -> '
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CT" \
  "http://127.0.0.1:4100/api/reports/stock?branchId=1"
