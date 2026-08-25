#!/usr/bin/env bash
# Did branch cost reach COGS, and what did the test leave behind?
set -uo pipefail
MODE=${1:-CHECK}
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }

echo "=== COGS on the test sale (branch cost was 300, catalogue 275) ==="
q "SELECT si.saleId, si.bookId, si.unitPrice, si.costPrice, s.voidedAt IS NOT NULL AS voided
   FROM SaleItem si JOIN Sale s ON s.id=si.saleId;"

echo
echo "=== residue ==="
q "SELECT 'sales' item, COUNT(*) n FROM Sale
   UNION ALL SELECT 'sale items', COUNT(*) FROM SaleItem
   UNION ALL SELECT 'stock movements', COUNT(*) FROM StockMovement
   UNION ALL SELECT 'audit rows', COUNT(*) FROM AuditLog
   UNION ALL SELECT 'units on hand', COALESCE(SUM(quantity),0) FROM Stock
   UNION ALL SELECT 'branch price overrides', COUNT(*) FROM Stock
        WHERE price IS NOT NULL OR priceWholesale IS NOT NULL OR priceSchool IS NOT NULL OR costPrice IS NOT NULL;"

if [ "$MODE" != "GO" ]; then echo; echo "CHECK only. Re-run with GO to clean."; exit 0; fi

q "
START TRANSACTION;
DELETE FROM SaleItem;
DELETE FROM Sale;
DELETE FROM StockMovement;
DELETE FROM AuditLog WHERE entity <> 'book';
COMMIT;
ALTER TABLE Sale AUTO_INCREMENT = 1;
ALTER TABLE SaleItem AUTO_INCREMENT = 1;
ALTER TABLE StockMovement AUTO_INCREMENT = 1;
"
echo
echo "=== after ==="
q "SELECT 'sales' item, COUNT(*) n FROM Sale
   UNION ALL SELECT 'stock movements', COUNT(*) FROM StockMovement
   UNION ALL SELECT 'audit rows', COUNT(*) FROM AuditLog
   UNION ALL SELECT 'units on hand', COALESCE(SUM(quantity),0) FROM Stock
   UNION ALL SELECT 'products', COUNT(*) FROM Book;"
