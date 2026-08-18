#!/usr/bin/env bash
# The API sits behind nginx, so both helmet (in Fastify) and nginx set security
# headers, and they disagreed: helmet says SAMEORIGIN / 180 days, nginx says
# DENY / 365 days. Two conflicting X-Frame-Options is worse than one.
#
# Hide the upstream's copies so nginx is the single source of truth here. Helmet
# stays enabled because a branch laptop runs Fastify with no nginx in front.
set -euo pipefail
VHOST=/etc/nginx/sites-enabled/booklab.localinvestors.co.ke.conf
cp "$VHOST" "/root/booklab-vhost.hide.$(date +%Y%m%d%H%M%S).bak"

python3 - "$VHOST" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
if "proxy_hide_header X-Frame-Options" in src:
    print("already present"); sys.exit(0)
anchor = "    location /api/ {\n        include snippets/booklab-security.conf;\n"
hide = "".join("        proxy_hide_header %s;\n" % h for h in
               ["X-Frame-Options", "Strict-Transport-Security",
                "X-Content-Type-Options", "Referrer-Policy"])
assert anchor in src, "anchor not found"
src = src.replace(anchor, anchor + hide, 1)
open(path, "w").write(src)
print("proxy_hide_header added")
PY

nginx -t && systemctl reload nginx && echo reloaded
