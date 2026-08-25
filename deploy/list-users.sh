#!/usr/bin/env bash
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
mysql -u booklab -p"$PW" booklab --batch -e \
 "SELECT u.id, u.email, u.name, u.role, COALESCE(b.name,'-') branch, u.active,
         IF(u.deletedAt IS NULL,'','ARCHIVED') st, u.createdAt
  FROM User u LEFT JOIN Branch b ON b.id=u.branchId ORDER BY u.id;" 2>/dev/null
echo
echo "branches with NO active cashier:"
mysql -u booklab -p"$PW" booklab --batch -e \
 "SELECT b.id, b.code, b.name FROM Branch b
  WHERE NOT EXISTS (SELECT 1 FROM User u WHERE u.branchId=b.id AND u.role='CASHIER'
                    AND u.active=1 AND u.deletedAt IS NULL);" 2>/dev/null
