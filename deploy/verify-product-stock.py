#!/usr/bin/env python3
"""Admin can read and set per-branch stock for one product, and it audits."""
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
    print("  [%s] %-52s got %s" % ("PASS" if ok else "FAIL", label, got))
    res.append(ok)

s, r = call("POST", "/api/auth/login", body={"email": "admin", "password": "admin123"})
admin = r["token"]
s, r = call("POST", "/api/auth/login", body={"email": "kapsabet.cashier", "password": "cashier123"})
cash = r["token"]

BOOK = 26   # the URL the product owner asked about: /products/26/edit

s, rows = call("GET", "/api/stock/book/%d" % BOOK, admin)
check("admin reads per-branch stock", s, 200)
check("one row per branch", len(rows) if isinstance(rows, list) else -1, 3)
print("       %s" % json.dumps(rows))

s, _ = call("GET", "/api/stock/book/%d" % BOOK, cash)
check("cashier cannot use it", s, 403)

before = rows[0]["quantity"]
bid = rows[0]["branchId"]
s, _ = call("PUT", "/api/stock", admin, {"branchId": bid, "bookId": BOOK, "quantity": before + 7, "note": "verify"})
check("admin sets quantity", s, 200)
s, rows2 = call("GET", "/api/stock/book/%d" % BOOK, admin)
check("quantity persisted", rows2[0]["quantity"], before + 7)

s, _ = call("PUT", "/api/stock/price", admin, {"branchId": bid, "bookId": BOOK, "price": 512.5})
check("admin sets a branch price", s, 200)
s, rows3 = call("GET", "/api/stock/book/%d" % BOOK, admin)
check("branch price persisted", float(rows3[0]["price"]), 512.5)

print("\n  restoring…")
call("PUT", "/api/stock", admin, {"branchId": bid, "bookId": BOOK, "quantity": before, "note": "restore"})
call("PUT", "/api/stock/price", admin, {"branchId": bid, "bookId": BOOK, "price": None})
s, rows4 = call("GET", "/api/stock/book/%d" % BOOK, admin)
check("quantity restored", rows4[0]["quantity"], before)
check("branch price cleared", rows4[0]["price"], None)

print("\n%d/%d passed" % (sum(res), len(res)))
raise SystemExit(0 if all(res) else 1)
