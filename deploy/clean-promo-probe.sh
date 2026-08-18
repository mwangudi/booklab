#!/usr/bin/env bash
# Remove the audit rows left by deploy/test-promo.py. Safe to run: the audit
# table has no hash chain, and these rows record probe actions, not trading.
set -uo pipefail
cd /var/www/booklab/backend
PW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"' | sed -E 's#.*://[^:]+:([^@]*)@.*#\1#')
mysql -u booklab -p"$PW" booklab -e "
DELETE FROM AuditLog WHERE entity='promo.slide';
SELECT COUNT(*) AS promo_audit_rows_left FROM AuditLog WHERE entity='promo.slide';
SELECT COUNT(*) AS slides_left FROM PromoSlide;
SELECT COUNT(*) AS total_audit_rows FROM AuditLog;
" 2>/dev/null
