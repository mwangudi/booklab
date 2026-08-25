#!/usr/bin/env bash
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
echo "=== tables ==="
mysql -u booklab -p"$PW" booklab --batch -e "SHOW TABLES;" 2>/dev/null
echo
echo "=== foreign keys pointing at Book, Sale, Invoice, Customer, GoodsReceipt, Employee ==="
mysql -u booklab -p"$PW" information_schema --batch -e \
 "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, DELETE_RULE
  FROM KEY_COLUMN_USAGE k
  JOIN REFERENTIAL_CONSTRAINTS r USING (CONSTRAINT_NAME, CONSTRAINT_SCHEMA)
  WHERE k.CONSTRAINT_SCHEMA='booklab' AND k.REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY REFERENCED_TABLE_NAME, TABLE_NAME;" 2>/dev/null
