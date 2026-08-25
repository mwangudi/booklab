#!/usr/bin/env python3
"""Verify the pilot state: cashier stock take, zero-price guard, clean data."""
import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:4100"

def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b'null')
        except Exception: return e.code, raw[:200]

def login(email, pw):
    s, r = call("POST", "/api/auth/login", body={"email": email, "password": pw})
    assert s == 200, (email, s, r)
    return r["token"], r["user"]

results = []
def check(label, got, want):
    ok = got == want
    print("  [%s] %-54s got %s" % ("PASS" if ok else "FAIL", label, got))
    results.append(ok)

print("cashiers on every branch:")
for email in ["cashier@booklabbookshop.co.ke", "manager@booklabbookshop.co.ke",
              "mumias.cashier@booklabbookshop.co.ke"]:
    t, u = login(email, "cashier123" if "mumias" in email or email.startswith("cashier") else "manager123")
    print("      %-40s %-8s branch=%s" % (email, u["role"], u.get("branchName")))

admin, _ = login("admin@booklabbookshop.co.ke", "admin123")
cash, cashu = login("cashier@booklabbookshop.co.ke", "cashier123")
bid = cashu["branchId"]

print("\ncashier can run a stock take:")
s, r = call("GET", "/api/stock/take-sheet?branchId=%d" % bid, cash)
check("cashier GET /stock/take-sheet", s, 200)
print("       sheet rows: %s" % (len(r) if isinstance(r, list) else r))

s, _ = call("GET", "/api/stock/branch/%d" % bid, cash)
check("cashier can read branch stock", s, 200)

print("\nzero-price guard:")
s, books = call("GET", "/api/books", admin)
book = books[0]
s, r = call("POST", "/api/sales", cash, {
    "branchId": bid, "paymentMethod": "CASH",
    "items": [{"bookId": book["id"], "quantity": 1, "unitPrice": 0}]})
check("selling below the set price is refused", s, 400)
print("       -> %s" % (r.get("error") if isinstance(r, dict) else r))

print("\ndata is clean:")
for ep, want in [("/api/sales?limit=5", 0)]:
    s, r = call("GET", ep, admin)
    rows = r if isinstance(r, list) else r.get("rows", r)
    check("sales list is empty", len(rows) if isinstance(rows, list) else -1, want)
s, books = call("GET", "/api/books", admin)
check("catalogue is the 12 real products", len(books), 12)
s, br = call("GET", "/api/branches", admin)
check("branches intact", len(br), 3)

print("\n%d/%d passed" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
