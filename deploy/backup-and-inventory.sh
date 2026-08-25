#!/usr/bin/env bash
# Back up booklab, then inventory exactly what is demo and what is real.
# READ-ONLY apart from writing the backup.
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
q() { mysql -u booklab -p"$PW" booklab --batch -e "$1" 2>/dev/null; }

mkdir -p /root/backups
F=/root/backups/booklab-preclear-$(date +%Y%m%d-%H%M%S).sql.gz
echo "=== backing up to $F ==="
mysqldump -u booklab -p"$PW" --single-transaction --routines --triggers booklab 2>/dev/null | gzip -9 > "$F"
ls -lh "$F" | awk '{print "   " $5, $9}'
gunzip -t "$F" && echo "   gzip integrity OK"

echo
echo "=== transaction volume (all of this is demo) ==="
q "SELECT
 (SELECT COUNT(*) FROM Sale) sales,
 (SELECT COUNT(*) FROM SaleItem) sale_items,
 (SELECT COUNT(*) FROM StockMovement) movements,
 (SELECT COUNT(*) FROM Expense) expenses,
 (SELECT COUNT(*) FROM Invoice) invoices,
 (SELECT COUNT(*) FROM InvoiceItem) invoice_items,
 (SELECT COUNT(*) FROM CustomerPayment) cust_payments,
 (SELECT COUNT(*) FROM GoodsReceipt) grns,
 (SELECT COUNT(*) FROM SupplierPayment) supp_payments,
 (SELECT COUNT(*) FROM MpesaPayment) mpesa;"
q "SELECT
 (SELECT COUNT(*) FROM PayrollRun) payroll_runs,
 (SELECT COUNT(*) FROM Payslip) payslips,
 (SELECT COUNT(*) FROM Employee) employees,
 (SELECT COUNT(*) FROM AuditLog) audit_rows,
 (SELECT COUNT(*) FROM Customer) customers,
 (SELECT COUNT(*) FROM Supplier) suppliers,
 (SELECT COUNT(*) FROM Stock) stock_rows,
 (SELECT COUNT(*) FROM Book) books;"

echo
echo "=== the catalogue: which look real, which look seeded? ==="
q "SELECT
   CASE WHEN sku REGEXP '^ST[0-9]+$' THEN 'real (ST supplier code)'
        WHEN sku LIKE 'LUX-%'        THEN 'real (Luxor import)'
        ELSE 'seeded demo' END AS kind,
   COUNT(*) n
 FROM Book GROUP BY kind;"
echo "  seeded demo titles:"
q "SELECT sku, title FROM Book WHERE sku NOT REGEXP '^ST[0-9]+$' AND sku NOT LIKE 'LUX-%' ORDER BY sku;"

echo
echo "=== stock on hand per branch ==="
q "SELECT b.name, COUNT(s.id) rows_, COALESCE(SUM(s.quantity),0) units
   FROM Branch b LEFT JOIN Stock s ON s.branchId=b.id GROUP BY b.id ORDER BY b.id;"

echo
echo "=== users per branch ==="
q "SELECT b.name AS branch, SUM(u.role='CASHIER') cashiers, SUM(u.role='MANAGER') managers, SUM(u.role='ADMIN') admins
   FROM Branch b LEFT JOIN User u ON u.branchId=b.id AND u.deletedAt IS NULL
   GROUP BY b.id ORDER BY b.id;"

echo
echo "=== customers & suppliers (are any real?) ==="
q "SELECT id, name, type FROM Customer ORDER BY id;"
q "SELECT id, name FROM Supplier ORDER BY id;"
