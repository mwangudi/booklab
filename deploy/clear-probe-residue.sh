#!/usr/bin/env bash
# Remove the movement and audit rows left by deploy/verify-product-stock.py and
# the other verification scripts run today. No trading has happened yet, so the
# only genuine entry to keep is the catalogue import.
#
# The stock itself needs no correction: the probe went 0 -> 7 -> 0.
set -uo pipefail
MODE=${1:-DRYRUN}
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }

echo "=== would delete ==="
q "SELECT 'stock movements' item, COUNT(*) n FROM StockMovement
   UNION ALL SELECT 'audit: stock probe', COUNT(*) FROM AuditLog WHERE entity IN ('stock.quantity','stock.price')
   UNION ALL SELECT 'audit: script logins', COUNT(*) FROM AuditLog WHERE entity='auth'
   UNION ALL SELECT 'audit: username tests', COUNT(*) FROM AuditLog WHERE entity='user'
   UNION ALL SELECT 'audit: KEEP book import', COUNT(*) FROM AuditLog WHERE entity='book';"

if [ "$MODE" != "GO" ]; then
  echo; echo "DRY RUN. Re-run with: bash $0 GO"; exit 0
fi

q "
START TRANSACTION;
DELETE FROM StockMovement;
DELETE FROM AuditLog WHERE entity IN ('stock.quantity','stock.price','auth','user');
COMMIT;
ALTER TABLE StockMovement AUTO_INCREMENT = 1;
"

echo
echo "=== after ==="
q "SELECT 'stock movements' item, COUNT(*) n FROM StockMovement
   UNION ALL SELECT 'audit rows', COUNT(*) FROM AuditLog
   UNION ALL SELECT 'sales', COUNT(*) FROM Sale
   UNION ALL SELECT 'units on hand', COALESCE(SUM(quantity),0) FROM Stock
   UNION ALL SELECT 'products', COUNT(*) FROM Book;"
echo
echo "  the audit trail that remains:"
q "SELECT id, entity, action, LEFT(details,60) details, createdAt FROM AuditLog ORDER BY id;"
