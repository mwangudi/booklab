#!/usr/bin/env python3
"""Per-branch cost/retail/wholesale/school: does the till honour them?"""
import json, urllib.request, urllib.error
BASE = "http://127.0.0.1:4100"

def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b'null')
        except Exception: return e.code, raw[:200]

res = []
def check(label, got, want):
    ok = got == want
    print("  [%s] %-56s got %s" % ("PASS" if ok else "FAIL", label, got))
    res.append(ok)

admin = call("POST", "/api/auth/login", body={"email": "admin", "password": "admin123"})[1]["token"]
cash  = call("POST", "/api/auth/login", body={"email": "kapsabet.cashier", "password": "cashier123"})[1]["token"]
BOOK, KAP = 26, 2   # Kangaro Paper Punch DP 520, Kapsabet

s, books = call("GET", "/api/books", admin)
book = [b for b in books if b["id"] == BOOK][0]
print("catalogue: retail %s wholesale %s school %s cost %s" %
      (book["unitPrice"], book["priceWholesale"], book["priceSchool"], book["costPrice"]))

print("\nset all four for Kapsabet only:")
s, _ = call("PUT", "/api/stock/price", admin,
            {"branchId": KAP, "bookId": BOOK, "price": 450, "priceWholesale": 420,
             "priceSchool": 430, "costPrice": 300})
check("admin sets four prices", s, 200)
s, rows = call("GET", "/api/stock/book/%d" % BOOK, admin)
kap = [r for r in rows if r["branchId"] == KAP][0]
other = [r for r in rows if r["branchId"] != KAP][0]
check("kapsabet retail",    float(kap["price"]), 450.0)
check("kapsabet wholesale", float(kap["priceWholesale"]), 420.0)
check("kapsabet school",    float(kap["priceSchool"]), 430.0)
check("kapsabet cost",      float(kap["costPrice"]), 300.0)
check("other branch untouched", other["price"], None)

print("\nthe till enforces the BRANCH floor, not the catalogue one:")
s, r = call("POST", "/api/sales", cash,
            {"branchId": KAP, "paymentMethod": "CASH", "priceTier": "WHOLESALE",
             "items": [{"bookId": BOOK, "quantity": 1, "unitPrice": 419}]})
check("below branch wholesale refused", s, 400)
print("       -> %s" % (r.get("error") if isinstance(r, dict) else r))

s, r = call("POST", "/api/sales", cash,
            {"branchId": KAP, "paymentMethod": "CASH", "priceTier": "WHOLESALE",
             "items": [{"bookId": BOOK, "quantity": 1, "unitPrice": 420}]})
check("at branch wholesale accepted", s, 201)
sale_id = r.get("id") if isinstance(r, dict) else None

if sale_id:
    s, sale = call("GET", "/api/sales/%d" % sale_id, admin)
    if s == 200:
        cost = float(sale["items"][0]["costPrice"])
        check("COGS used the BRANCH cost, not the catalogue", cost, 300.0)
    call("POST", "/api/sales/%d/void" % sale_id, admin, {"reason": "verification"})

print("\ncashier may not touch cost or tier prices:")
s, _ = call("PUT", "/api/stock/price", cash, {"branchId": KAP, "bookId": BOOK, "costPrice": 1})
check("cashier blocked from cost", s, 403)

print("\nclearing back:")
s, _ = call("PUT", "/api/stock/price", admin,
            {"branchId": KAP, "bookId": BOOK, "price": None, "priceWholesale": None,
             "priceSchool": None, "costPrice": None})
s, rows = call("GET", "/api/stock/book/%d" % BOOK, admin)
kap = [r for r in rows if r["branchId"] == KAP][0]
check("all cleared", [kap["price"], kap["priceWholesale"], kap["priceSchool"], kap["costPrice"]], [None, None, None, None])

print("\n%d/%d passed" % (sum(res), len(res)))
raise SystemExit(0 if all(res) else 1)
