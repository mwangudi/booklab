#!/usr/bin/env bash
# Prove PharmaCare's Prisma/MySQL path works on Node 24 without needing real
# credentials: a bad login still performs a database lookup. 401 = Prisma fine,
# 500 = Prisma broken.
set -uo pipefail
for ep in /api/auth/login /auth/login; do
  code=$(curl -s -o /tmp/ph.json -w '%{http_code}' --max-time 12 \
    -X POST "http://127.0.0.1:4000$ep" -H 'Content-Type: application/json' \
    -d '{"email":"upgrade-probe@invalid.local","password":"definitely-wrong"}')
  printf '  POST %-20s -> %s   %s\n' "$ep" "$code" "$(head -c 120 /tmp/ph.json)"
done
echo
echo "  any errors in the log since the restart?"
journalctl -u pharmacare-api --since '10 minutes ago' --no-pager \
  | grep -iE 'error|econnrefused|prisma|panic|level":(50|60)' | tail -15 | sed 's/^/    /' \
  || echo "    none"
