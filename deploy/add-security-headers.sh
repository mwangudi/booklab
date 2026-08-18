#!/usr/bin/env bash
# Add the security headers to the vhost nginx ACTUALLY loads.
#
# The headers go in a snippet that is included in the server block AND in every
# location, because nginx drops inherited add_header directives from any block
# that declares its own — and every location here sets Cache-Control.
#
# Trap on this host: sites-enabled/booklab...conf is a REGULAR FILE, not a
# symlink, and sites-available holds a stale unused copy. Editing the available
# one changes nothing at all.
set -euo pipefail

VHOST=/etc/nginx/sites-enabled/booklab.localinvestors.co.ke.conf
SNIPPET=/etc/nginx/snippets/booklab-security.conf
STAMP=$(date +%Y%m%d%H%M%S)
BACKUP="/root/booklab-enabled-vhost.$STAMP.bak"

if [ -L "$VHOST" ]; then echo "It is a symlink now — re-check before running"; exit 1; fi

cp "$VHOST" "$BACKUP"
echo "backup: $BACKUP"

mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" <<'SNIP'
# Security headers for the Booklab app.
#
# READ BEFORE EDITING: nginx only inherits `add_header` from an outer block when
# the inner block declares NO add_header of its own. Every location in the vhost
# sets Cache-Control, so server-level headers alone would silently vanish from
# exactly the responses that matter. Hence this file, included in each location.

add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=()" always;
SNIP

python3 - "$VHOST" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
inc = "include snippets/booklab-security.conf;"

if inc in src:
    print("already present - nothing to change")
    sys.exit(0)

# One include immediately after the client_max_body_size line (server level),
# and one as the first line inside every location block.
src = src.replace("    client_max_body_size 5m;\n",
                  "    client_max_body_size 5m;\n\n    %s\n" % inc, 1)
src = re.sub(r"(\n(\s*)location [^\n]*\{\n)", lambda m: "%s%s    %s\n" % (m.group(1), m.group(2), inc), src)

open(path, "w").write(src)
print("include added in %d place(s)" % src.count(inc))
PY

echo "--- nginx -t ---"
if nginx -t; then
  systemctl reload nginx
  echo "reloaded"
else
  echo "CONFIG BAD - rolling back"
  cp "$BACKUP" "$VHOST"
  nginx -t && systemctl reload nginx
  exit 1
fi
