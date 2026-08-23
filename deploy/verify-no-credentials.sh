#!/usr/bin/env bash
# Confirm no credentials survive in the bundle nginx is actually serving.
set -uo pipefail
ASSET=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' /var/www/booklab/frontend/dist/index.html | head -1)
echo "serving: $ASSET"
BODY=$(curl -s "https://booklab.localinvestors.co.ke$ASSET")
echo "bytes: ${#BODY}"
for pat in admin123 cashier123 manager123 'Demo admin' 'admin@booklabbookshop'; do
  if printf '%s' "$BODY" | grep -qF "$pat"; then
    printf '  %-24s STILL PRESENT\n' "$pat"
  else
    printf '  %-24s gone\n' "$pat"
  fi
done
echo
echo "and in the whole dist tree:"
grep -rlF -e admin123 -e 'Demo admin' /var/www/booklab/frontend/dist/ 2>/dev/null | sed 's/^/  /' || echo "  clean"
