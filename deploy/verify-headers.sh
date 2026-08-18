#!/usr/bin/env bash
# Confirm the security headers survive on every kind of response, including the
# location blocks that set their own Cache-Control.
set -uo pipefail
HOST=https://booklab.localinvestors.co.ke
ASSET=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' /var/www/booklab/frontend/dist/index.html | head -1)

for p in / "$ASSET" /manifest.webmanifest /sw.js /api/promo; do
  echo "=== $p"
  curl -sI "$HOST$p" | grep -iE 'HTTP/|strict-transport|x-frame-options|x-content-type|referrer-policy|permissions-policy|content-security' | sed 's/^/   /'
done

echo
echo "=== other sites on this box must be untouched ==="
for h in cedarclient.martensafrica.com ke.martensafrica.com; do
  printf '%s: ' "$h"
  curl -sI --max-time 8 "https://$h/" | grep -ci 'strict-transport' || true
done
