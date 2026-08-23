#!/usr/bin/env bash
# Read-only survey before any Node upgrade. Changes nothing.
set -uo pipefail

echo "=========== OS / resources ==========="
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
uname -r
echo "uptime: $(uptime -p)"
df -h / | tail -1
free -h | sed -n 2p

echo
echo "=========== node / npm ==========="
echo "node: $(command -v node)  $(node -v 2>/dev/null)"
echo "npm : $(command -v npm)   $(npm -v 2>/dev/null)"
echo "npx : $(command -v npx)"
ls -l /usr/bin/node /usr/local/bin/node 2>/dev/null
echo "-- how was it installed? --"
dpkg -l | grep -iE '^ii\s+nodejs' || echo "  no nodejs apt package"
ls /etc/apt/sources.list.d/ 2>/dev/null | grep -i node || echo "  no nodesource apt list"
command -v fnm nvm n volta 2>/dev/null || echo "  no version manager on PATH"
[ -d "$HOME/.nvm" ] && echo "  ~/.nvm EXISTS"

echo
echo "=========== systemd services mentioning node ==========="
for u in $(systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}'); do
  f=$(systemctl show -p FragmentPath --value "$u" 2>/dev/null)
  [ -n "$f" ] && [ -f "$f" ] || continue
  if grep -qiE 'node|npm|pm2' "$f"; then
    echo "--- $u  ($f)"
    grep -E '^(ExecStart|WorkingDirectory|Environment|User)' "$f" | sed 's/^/      /'
  fi
done

echo
echo "=========== pm2 ==========="
if command -v pm2 >/dev/null 2>&1; then pm2 list 2>/dev/null; else echo "  pm2 not installed"; fi

echo
echo "=========== nginx sites ==========="
ls -l /etc/nginx/sites-enabled/
echo "-- server_name / proxy_pass --"
grep -hE 'server_name|proxy_pass' /etc/nginx/sites-enabled/* 2>/dev/null | sed 's/^\s*/  /' | sort -u

echo
echo "=========== listening ports ==========="
ss -lntp 2>/dev/null | sed 's/^/  /'

echo
echo "=========== node app directories ==========="
for d in /var/www/* /opt/* /srv/* /root/*; do
  [ -f "$d/package.json" ] || { for s in "$d"/*/package.json; do [ -f "$s" ] && echo "  nested: $s"; done; continue; }
  echo "--- $d"
  node -e "const p=require('$d/package.json');console.log('    name:',p.name,'| engines:',JSON.stringify(p.engines||{}))" 2>/dev/null
done

echo
echo "=========== native modules (these break on a Node major bump) ==========="
find /var/www /opt /srv -name '*.node' -path '*node_modules*' 2>/dev/null | head -40 || true
echo "(none listed above means nothing obvious to rebuild)"
