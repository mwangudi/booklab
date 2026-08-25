#!/usr/bin/env bash
# Clear demo data so the branches can start pilot trading.
#
# Confirmed with the product owner 2026-08-25:
#   - delete all trading history
#   - delete the 23 seeded demo products (keep the 12 real ST-coded ones)
#   - reset stock to zero everywhere; each branch does an opening stock take
#   - delete the 5 demo customers; KEEP branches, users and the 4 real suppliers
#
# Pass GO to actually delete. Without it this only reports what it would do.
set -uo pipefail
MODE=${1:-DRYRUN}
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }

DEMO="sku NOT REGEXP '^ST[0-9]+$' AND sku NOT LIKE 'LUX-%'"

echo "=== what will go ==="
q "SELECT 'demo products' item, COUNT(*) n FROM Book WHERE $DEMO
   UNION ALL SELECT 'products kept', COUNT(*) FROM Book WHERE NOT ($DEMO)
   UNION ALL SELECT 'sales', COUNT(*) FROM Sale
   UNION ALL SELECT 'sale lines', COUNT(*) FROM SaleItem
   UNION ALL SELECT 'stock movements', COUNT(*) FROM StockMovement
   UNION ALL SELECT 'expenses', COUNT(*) FROM Expense
   UNION ALL SELECT 'invoices', COUNT(*) FROM Invoice
   UNION ALL SELECT 'customers', COUNT(*) FROM Customer
   UNION ALL SELECT 'goods receipts', COUNT(*) FROM GoodsReceipt
   UNION ALL SELECT 'payroll runs', COUNT(*) FROM PayrollRun
   UNION ALL SELECT 'employees', COUNT(*) FROM Employee
   UNION ALL SELECT 'audit rows', COUNT(*) FROM AuditLog
   UNION ALL SELECT 'suppliers KEPT', COUNT(*) FROM Supplier
   UNION ALL SELECT 'users KEPT', COUNT(*) FROM User
   UNION ALL SELECT 'branches KEPT', COUNT(*) FROM Branch;"

if [ "$MODE" != "GO" ]; then
  echo
  echo "DRY RUN. Nothing deleted. Re-run with:  bash $0 GO"
  exit 0
fi

echo
echo "=== deleting (child tables first) ==="
q "
START TRANSACTION;
DELETE FROM SaleItem;
DELETE FROM MpesaPayment;
DELETE FROM Sale;
DELETE FROM StockMovement;
DELETE FROM InvoiceItem;
DELETE FROM CustomerPayment;
DELETE FROM Invoice;
DELETE FROM Customer;
DELETE FROM GoodsReceiptItem;
DELETE FROM SupplierPayment;
DELETE FROM GoodsReceipt;
DELETE FROM Payslip;
DELETE FROM PayrollRun;
DELETE FROM Employee;
DELETE FROM Expense;
DELETE FROM AuditLog;
DELETE FROM Outbox;
DELETE FROM SyncState;
-- stock rows for products that are going, then zero what remains
DELETE s FROM Stock s JOIN Book b ON b.id = s.bookId WHERE $DEMO;
UPDATE Stock SET quantity = 0;
DELETE FROM Book WHERE $DEMO;
COMMIT;
"

echo "=== numbering restarts at 1 for the pilot ==="
for t in Sale SaleItem StockMovement Expense Invoice InvoiceItem CustomerPayment \
         GoodsReceipt GoodsReceiptItem SupplierPayment Customer AuditLog \
         PayrollRun Payslip Employee MpesaPayment; do
  q "ALTER TABLE $t AUTO_INCREMENT = 1;"
done

echo
echo "=== after ==="
q "SELECT 'sales' item, COUNT(*) n FROM Sale
   UNION ALL SELECT 'sale lines', COUNT(*) FROM SaleItem
   UNION ALL SELECT 'stock movements', COUNT(*) FROM StockMovement
   UNION ALL SELECT 'expenses', COUNT(*) FROM Expense
   UNION ALL SELECT 'invoices', COUNT(*) FROM Invoice
   UNION ALL SELECT 'customers', COUNT(*) FROM Customer
   UNION ALL SELECT 'goods receipts', COUNT(*) FROM GoodsReceipt
   UNION ALL SELECT 'payroll runs', COUNT(*) FROM PayrollRun
   UNION ALL SELECT 'employees', COUNT(*) FROM Employee
   UNION ALL SELECT 'audit rows', COUNT(*) FROM AuditLog
   UNION ALL SELECT 'outbox', COUNT(*) FROM Outbox
   UNION ALL SELECT 'products', COUNT(*) FROM Book
   UNION ALL SELECT 'suppliers', COUNT(*) FROM Supplier
   UNION ALL SELECT 'users', COUNT(*) FROM User
   UNION ALL SELECT 'branches', COUNT(*) FROM Branch;"

echo
echo "=== stock per branch (should be 0 units, one row per kept product) ==="
q "SELECT b.name, COUNT(s.id) rows_, COALESCE(SUM(s.quantity),0) units
   FROM Branch b LEFT JOIN Stock s ON s.branchId=b.id GROUP BY b.id ORDER BY b.id;"

echo
echo "=== the catalogue that remains ==="
q "SELECT id, sku, title, unitPrice, costPrice FROM Book ORDER BY sku;"

echo
echo "=== orphan check (all must be 0) ==="
q "SELECT
   (SELECT COUNT(*) FROM SaleItem si LEFT JOIN Sale s ON s.id=si.saleId WHERE s.id IS NULL) orphan_sale_items,
   (SELECT COUNT(*) FROM Stock st LEFT JOIN Book bk ON bk.id=st.bookId WHERE bk.id IS NULL) orphan_stock,
   (SELECT COUNT(*) FROM InvoiceItem ii LEFT JOIN Invoice i ON i.id=ii.invoiceId WHERE i.id IS NULL) orphan_invoice_items;"
