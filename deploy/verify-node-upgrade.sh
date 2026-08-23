#!/usr/bin/env bash
# Verify the Node 24 upgrade: every site, and real database work through Prisma.
set -uo pipefail
echo "node: $(node -v)   npm: $(npm -v)"

echo
echo "=== services ==="
for s in booklab-api pharmacare-api nginx mysql; do
  printf '  %-16s %s\n' "$s" "$(systemctl is-active $s 2>/dev/null)"
done

echo
echo "=== Prisma actually querying MySQL on Node 24 (booklab) ==="
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@booklabbookshop.co.ke","password":"admin123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 40 ]; then
  echo "  login (bcrypt + Prisma user lookup)  -> OK"
else
  echo "  login -> FAILED"
fi
for ep in /api/books /api/branches /api/promo "/api/reports/pnl?from=2026-08-01&to=2026-08-23"; do
  code=$(curl -s -o /tmp/r.json -w '%{http_code}' --max-time 15 \
         -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:4100$ep")
  printf '  %-46s -> %s  (%s bytes)\n' "$ep" "$code" "$(wc -c </tmp/r.json)"
done

echo
echo "=== pharmacare: recent log lines (looking for crashes) ==="
journalctl -u pharmacare-api -n 12 --no-pager --since '5 minutes ago' | sed 's/^/  /'

echo
echo "=== booklab: recent log lines ==="
journalctl -u booklab-api -n 8 --no-pager --since '5 minutes ago' | sed 's/^/  /'

echo
echo "=== every site through nginx ==="
grep -hE '^[[:space:]]*server_name[[:space:]]' /etc/nginx/sites-enabled/* 2>/dev/null \
  | tr -d ';' | sed 's/^[[:space:]]*server_name[[:space:]]*//' | tr ' ' '\n' \
  | grep -vE '^\s*$|^_$|\.test$' | sort -u | while read -r host; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 12 \
           --resolve "$host:443:127.0.0.1" "https://$host/" 2>/dev/null)
    flag=""
    [ "$code" = 200 ] || flag="   <-- CHECK"
    printf '  %-42s %s%s\n' "$host" "$code" "$flag"
  done

echo
echo "=== .NET apps (should be untouched) ==="
for p in 5260 5261 5262 5264; do
  printf '  port %s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:$p/)"
done
