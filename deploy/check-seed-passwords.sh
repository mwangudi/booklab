#!/usr/bin/env bash
# Which of the seeded passwords still work on production? Reports only whether
# the login succeeded - never echoes a token or a password.
set -uo pipefail
try() {
  code=$(curl -s -o /tmp/l.json -w '%{http_code}' --max-time 10 \
    -X POST http://127.0.0.1:4100/api/auth/login -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}")
  if [ "$code" = 200 ]; then r="WORKS (unchanged)"; else r="rejected ($code)"; fi
  printf '  %-42s %s\n' "$1" "$r"
}
echo "seeded passwords still valid?"
try admin@booklabbookshop.co.ke        admin123
try manager@booklabbookshop.co.ke      manager123
try cashier@booklabbookshop.co.ke      cashier123
try mumias.cashier@booklabbookshop.co.ke cashier123

echo
echo "all active accounts:"
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
mysql -u booklab -p"$PW" booklab --batch -e \
  "SELECT u.id, u.email, u.role, b.name AS branch, u.active FROM User u LEFT JOIN Branch b ON b.id=u.branchId ORDER BY u.id;" 2>/dev/null
