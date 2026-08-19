#!/usr/bin/env python3
"""Refresh the buying price of the five Luxor products already in the catalogue.

Cost basis confirmed by the product owner: price per packet EXCLUDING VAT.
Selling prices must not move, so this also verifies that a cost-only import
leaves retail/wholesale/school untouched.
"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:4100"

# sku -> new cost, from "Price per pkt EXCL of VAT" in the Luxor sheet
NEW_COST = {
    'ST02702': 260.00,   # Inkglide 100 orange body 0.7mm Black, 20 pack
    'ST02089': 275.00,   # Inkglide 100 orange body 1.0mm Blue, 25 pack
    'ST01891': 500.00,   # Refillable Permanent marker Chisel, packet of 10
    'ST01887': 500.00,   # Refillable Whiteboard marker Chisel, packet of 10
    'ST01119': 362.40,   # Eco Textliter Orange, packet of 12
}


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


s, res = call("POST", "/api/auth/login",
              body={"email": "admin@booklabbookshop.co.ke", "password": "admin123"})
assert s == 200, res
token = res["token"]

s, books = call("GET", "/api/books?archived=all", token)
before = {b['sku']: b for b in books if b['sku'] in NEW_COST}
assert len(before) == 5, "expected 5 products, found %d" % len(before)

print("before:")
for sku, b in sorted(before.items()):
    print("  %-9s cost=%-8s retail=%-8s wholesale=%-8s school=%-8s  %s"
          % (sku, b['costPrice'], b['unitPrice'], b['priceWholesale'], b['priceSchool'], b['title'][:40]))

# Cost only. Titles are the products' own, so nothing gets renamed.
items = [{"sku": sku, "title": before[sku]['title'], "costPrice": cost}
         for sku, cost in NEW_COST.items()]
s, res = call("POST", "/api/books/import", token, {"items": items})
print("\nimport -> %s %s" % (s, res))

s, books = call("GET", "/api/books?archived=all", token)
after = {b['sku']: b for b in books if b['sku'] in NEW_COST}

print("\nafter:")
ok = True
for sku in sorted(NEW_COST):
    a, b = after[sku], before[sku]
    cost_ok = abs(float(a['costPrice']) - NEW_COST[sku]) < 0.005
    kept = (a['unitPrice'] == b['unitPrice']
            and a['priceWholesale'] == b['priceWholesale']
            and a['priceSchool'] == b['priceSchool']
            and a['title'] == b['title'])
    ok = ok and cost_ok and kept
    print("  %-9s cost %s -> %-8s %s | selling prices %s"
          % (sku, b['costPrice'], a['costPrice'],
             'OK' if cost_ok else 'WRONG',
             'untouched OK' if kept else 'CHANGED - BAD'))

print("\n%s" % ("all five updated, selling prices intact" if ok else "SOMETHING IS WRONG"))
raise SystemExit(0 if ok else 1)
