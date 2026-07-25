#!/usr/bin/env bash
# Set the M-Pesa Daraja consumer key/secret in the deployed backend .env and restart.
# Keeps secrets OUT of source control — pass them as arguments at run time:
#   bash set-mpesa.sh <CONSUMER_KEY> <CONSUMER_SECRET>
set -euo pipefail
F=/var/www/booklab/backend/.env
sed -i "s#^MPESA_CONSUMER_KEY=.*#MPESA_CONSUMER_KEY=\"${1:-}\"#" "$F"
sed -i "s#^MPESA_CONSUMER_SECRET=.*#MPESA_CONSUMER_SECRET=\"${2:-}\"#" "$F"
systemctl restart booklab-api
sleep 2
TOKEN=$(curl -s http://127.0.0.1:4100/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@booklabbookshop.co.ke","password":"admin123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "M-Pesa config after update:"
curl -s http://127.0.0.1:4100/api/mpesa/config -H "Authorization: Bearer $TOKEN"; echo
