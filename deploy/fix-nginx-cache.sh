#!/usr/bin/env bash
# Ensure the SPA fallback sends a no-cache header so browsers never get stuck on
# a stale index.html (and therefore an old JS bundle) after a redeploy.
set -euo pipefail
CONF=/etc/nginx/sites-available/booklab.localinvestors.co.ke.conf

if [ "$(grep -c 'no-cache, must-revalidate' "$CONF")" -ge 2 ]; then
  echo "already patched"
else
  sed -i '\#try_files $uri $uri/ /index.html;#a\        add_header Cache-Control "no-cache, must-revalidate";' "$CONF"
  echo "patched"
fi
nginx -t && systemctl reload nginx && echo reloaded
