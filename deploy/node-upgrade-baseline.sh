#!/usr/bin/env bash
# Baseline every site and service, so "did I break it?" is answerable. Read-only.
set -uo pipefail
OUT=${1:-/root/node-upgrade-baseline.txt}

{
echo "captured: $(date -Is)"
echo "node: $(node -v)   npm: $(npm -v)"
echo
echo "--- services ---"
for s in booklab-api pharmacare-api nginx mysql; do
  printf '%-18s %s\n' "$s" "$(systemctl is-active $s 2>/dev/null)"
done
systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}' | grep -iE 'cedar|dotnet|kestrel|marten' | while read -r u; do
  printf '%-18s %s\n' "$u" "$(systemctl is-active "$u")"
done

echo
echo "--- local API health ---"
printf 'booklab  4100 /api/promo   -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:4100/api/promo)"
printf 'booklab  4100 /health      -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:4100/health)"
printf 'pharma   4000 /health      -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:4000/health)"
for p in 5260 5261 5262 5264; do
  printf 'dotnet   %s              -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:$p/)"
done

echo
echo "--- every server_name through nginx (resolved to localhost) ---"
grep -h 'server_name' /etc/nginx/sites-enabled/* 2>/dev/null \
  | tr -d ';' | sed 's/server_name//' | tr ' ' '\n' \
  | grep -vE '^\s*$|^_$|\.test$' | sort -u | while read -r host; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
           --resolve "$host:443:127.0.0.1" "https://$host/" 2>/dev/null)
    printf '  %-42s %s\n' "$host" "$code"
  done
} | tee "$OUT"

echo
echo "baseline written to $OUT"
