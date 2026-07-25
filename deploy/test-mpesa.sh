#!/usr/bin/env bash
# Test the M-Pesa STK push against the running Booklab API.
# Usage: bash test-mpesa.sh [phone] [amount]
#   Daraja sandbox test MSISDN is 254708374149.
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:4100}"
PHONE="${1:-254708374149}"
AMOUNT="${2:-1}"

TOKEN=$(curl -s "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@booklabbookshop.co.ke","password":"admin123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "Token: ${TOKEN:0:14}…"

RESP=$(curl -s "$BASE/api/mpesa/stk" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"amount\":$AMOUNT,\"phone\":\"$PHONE\"}")
echo "STK initiate: $RESP"
CRID=$(printf '%s' "$RESP" | sed -E 's/.*"checkoutRequestId":"([^"]+)".*/\1/')
if [ -z "$CRID" ] || [ "$CRID" = "$RESP" ]; then echo "No checkoutRequestId returned — stopping."; exit 1; fi
echo "CheckoutRequestID: $CRID"
echo "Polling status…"

for i in $(seq 1 15); do
  sleep 3
  ST=$(curl -s "$BASE/api/mpesa/status?checkoutRequestId=$CRID" -H "Authorization: Bearer $TOKEN")
  echo "  [$i] $ST"
  echo "$ST" | grep -q '"status":"SUCCESS"'  && { echo "=> SUCCESS"; exit 0; }
  echo "$ST" | grep -qE '"status":"(FAILED|CANCELLED)"' && { echo "=> Ended (not success)"; exit 0; }
done
echo "=> Still pending after polling window."
