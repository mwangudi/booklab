#!/usr/bin/env python3
"""Import the shared price list (Option A: selling prices now, costs later).

costPrice is deliberately NOT sent. The list has none, and the importer treats a
missing column as "leave alone", so re-running this later cannot wipe any cost
that has since been entered.
"""
import csv, json, sys, urllib.request, urllib.error

BASE = "http://127.0.0.1:4100"
CSV = sys.argv[1] if len(sys.argv) > 1 else "/tmp/booklab-pricelist.csv"
DRY = "--go" not in sys.argv

def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=300) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b'null')
        except Exception: return e.code, raw[:300]

rows = list(csv.DictReader(open(CSV, encoding='utf-8-sig')))
items = []
for r in rows:
    price = float(r.get('unitPrice') or 0)
    items.append({
        "sku": r['sku'].strip(),
        "title": r['title'].strip(),
        "category": (r.get('category') or '').strip() or None,
        "unitPrice": price,
    })

print("rows in file        : %d" % len(rows))
print("items to send       : %d" % len(items))
print("any without a price : %d" % sum(1 for i in items if i['unitPrice'] <= 0))
print("payload size        : %.1f KB" % (len(json.dumps({'items': items}).encode()) / 1024))

s, r = call("POST", "/api/auth/login", body={"email": "admin", "password": "admin123"})
assert s == 200, r
token = r["token"]

s, before = call("GET", "/api/books?archived=all", token)
print("catalogue before    : %d" % len(before))

if DRY:
    print("\nDRY RUN — pass --go to import.")
    raise SystemExit(0)

print("\nimporting…")
s, res = call("POST", "/api/books/import", token, {"items": items})
print("  HTTP %s -> %s" % (s, json.dumps(res)[:300] if not isinstance(res, dict) else
      {k: res[k] for k in ('total', 'created', 'updated') if k in res}))
if isinstance(res, dict) and res.get("errors"):
    print("  errors (first 5): %s" % res["errors"][:5])

s, after = call("GET", "/api/books?archived=all", token)
print("catalogue after     : %d" % len(after))
zero_cost = sum(1 for b in after if float(b.get('costPrice') or 0) == 0)
zero_price = sum(1 for b in after if float(b.get('unitPrice') or 0) == 0)
print("  with no cost price: %d  <-- P&L cannot be trusted until these are filled" % zero_cost)
print("  with no sell price: %d" % zero_price)
