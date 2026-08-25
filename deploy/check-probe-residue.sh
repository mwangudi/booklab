#!/usr/bin/env bash
# What did the product-stock verification leave behind?
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }

echo "=== is the quantity actually right? (should be 0 everywhere) ==="
q "SELECT b.name branch, s.quantity, s.price
   FROM Stock s JOIN Branch b ON b.id=s.branchId
   WHERE s.bookId=26;"

echo
echo "=== total units anywhere (whole system should still be 0 pre-pilot) ==="
q "SELECT COALESCE(SUM(quantity),0) units_on_hand, COUNT(*) stock_rows FROM Stock;"

echo
echo "=== movements left by the probe ==="
q "SELECT id, bookId, branchId, type, delta, note, createdAt
   FROM StockMovement ORDER BY id;"

echo
echo "=== audit rows left by the probe ==="
q "SELECT id, entity, entityId, action, LEFT(details,70) details, createdAt
   FROM AuditLog WHERE entity IN ('stock.quantity','stock.price') ORDER BY id;"

echo
echo "=== all audit rows now ==="
q "SELECT entity, action, COUNT(*) n FROM AuditLog GROUP BY entity, action ORDER BY n DESC;"
