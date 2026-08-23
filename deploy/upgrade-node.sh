#!/usr/bin/env bash
# Upgrade Node 20 (end of life, 30 Apr 2026) to Node 24 LTS on this host.
#
# Only two services run on Node here - booklab-api and pharmacare-api. The
# cedarcapital / martensafrica sites are .NET and are not touched.
#
# Rolls itself back if either Node service fails to come up.
set -euo pipefail

STAMP=$(date +%Y%m%d%H%M%S)
BACKUP_DIR=/root/node-upgrade-$STAMP
mkdir -p "$BACKUP_DIR"

echo "=== 1. preserving a way back ==="
node -v > "$BACKUP_DIR/old-node-version.txt"
cp /etc/apt/sources.list.d/nodesource.sources "$BACKUP_DIR/"
# Fetch the CURRENT .deb while the 20.x repo is still configured, so rollback
# does not depend on that repo still being reachable afterwards.
( cd "$BACKUP_DIR" && apt-get download nodejs >/dev/null 2>&1 ) || echo "  (could not cache the .deb - rollback will need the repo)"
ls -1 "$BACKUP_DIR" | sed 's/^/  /'

rollback() {
  echo
  echo "!!! ROLLING BACK to $(cat "$BACKUP_DIR/old-node-version.txt")"
  cp "$BACKUP_DIR/nodesource.sources" /etc/apt/sources.list.d/nodesource.sources
  DEB=$(ls "$BACKUP_DIR"/nodejs_*.deb 2>/dev/null | head -1)
  if [ -n "$DEB" ]; then
    dpkg -i "$DEB" || true
  else
    apt-get update -qq && apt-get install -y --allow-downgrades nodejs || true
  fi
  systemctl restart booklab-api pharmacare-api || true
  sleep 4
  echo "node is now $(node -v)"
  systemctl is-active booklab-api pharmacare-api || true
  exit 1
}

echo
echo "=== 2. switching the NodeSource repo to 24.x ==="
sed -i 's#node_20\.x#node_24.x#g' /etc/apt/sources.list.d/nodesource.sources
grep -i 'URIs' /etc/apt/sources.list.d/nodesource.sources | sed 's/^/  /'
apt-get update -qq

echo
echo "=== 3. installing nodejs (only this package) ==="
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null
echo "  node: $(node -v)"
echo "  npm : $(npm -v)"

case "$(node -v)" in
  v24.*) : ;;
  *) echo "  unexpected version"; rollback ;;
esac

echo
echo "=== 4. restarting the two Node services ==="
systemctl restart booklab-api
systemctl restart pharmacare-api
sleep 6

ok=1
for s in booklab-api pharmacare-api; do
  state=$(systemctl is-active "$s" || true)
  printf '  %-16s %s\n' "$s" "$state"
  [ "$state" = active ] || ok=0
done

echo
echo "=== 5. health ==="
b=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:4100/health || echo 000)
p=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:4000/health || echo 000)
echo "  booklab /health -> $b"
echo "  pharma  /health -> $p"
[ "$b" = 200 ] || ok=0
[ "$p" = 200 ] || ok=0

if [ "$ok" -ne 1 ]; then
  echo
  echo "  a service did not come back cleanly - recent logs:"
  journalctl -u booklab-api -u pharmacare-api -n 25 --no-pager | sed 's/^/    /'
  rollback
fi

echo
echo "=== done: Node $(node -v), both services healthy ==="
echo "rollback material kept in $BACKUP_DIR"
