#!/usr/bin/env bash
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
mysql -u booklab -p"$PW" booklab --batch -e "
SELECT id, sku, title, category, unit, vatRate, costPrice, unitPrice,
       IFNULL(priceWholesale,''), IFNULL(priceSchool,''), IF(deletedAt IS NULL,'active','archived')
FROM Book ORDER BY id;" 2>/dev/null
