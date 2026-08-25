#!/usr/bin/env python3
"""Usernames work, emails still work, and the guards still hold."""
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
        except Exception: return e.code, raw[:160]

res = []
def check(label, got, want):
    ok = got == want
    print("  [%s] %-50s got %s" % ("PASS" if ok else "FAIL", label, got))
    res.append(ok)

print("sign in with the short username:")
for uname, pw, branch in [("admin", "admin123", "Luanda"),
                          ("luanda.cashier", "manager123", "Luanda"),
                          ("kapsabet.cashier", "cashier123", "Kapsabet"),
                          ("mumias.cashier", "cashier123", "Mumias")]:
    s, r = call("POST", "/api/auth/login", body={"email": uname, "password": pw})
    ok = s == 200 and r["user"].get("branchName") == branch
    print("  [%s] %-18s -> %s  %s / %s" % ("PASS" if ok else "FAIL", uname, s,
          r["user"]["role"] if s == 200 else r, r["user"].get("branchName") if s == 200 else ""))
    res.append(ok)

print("\nthe old email still works (nobody is locked out):")
s, r = call("POST", "/api/auth/login", body={"email": "mumias.cashier@booklabbookshop.co.ke", "password": "cashier123"})
check("email login", s, 200)

print("\nusing the 'username' key instead of 'email':")
s, r = call("POST", "/api/auth/login", body={"username": "admin", "password": "admin123"})
check("username key", s, 200)
admin = r["token"] if s == 200 else None

print("\nbad credentials still refused:")
s, _ = call("POST", "/api/auth/login", body={"email": "admin", "password": "wrong"})
check("wrong password", s, 401)
s, _ = call("POST", "/api/auth/login", body={"email": "nobody.here", "password": "x"})
check("unknown username", s, 401)

print("\nadmin can edit email and username:")
s, users = call("GET", "/api/auth/users", admin)
check("user list carries username", all("username" in u for u in users), True)
uid = [u for u in users if u["username"] == "mumias.cashier"][0]["id"]
s, r = call("PATCH", "/api/auth/users/%d" % uid, admin, {"username": "mumias.till"})
check("rename username", s, 200)
s, r = call("POST", "/api/auth/login", body={"email": "mumias.till", "password": "cashier123"})
check("new username signs in", s, 200)
s, _ = call("PATCH", "/api/auth/users/%d" % uid, admin, {"username": "mumias.cashier"})
check("restored", s, 200)

print("\nduplicates refused:")
s, r = call("PATCH", "/api/auth/users/%d" % uid, admin, {"username": "admin"})
check("username already in use", s, 409)
s, _ = call("PATCH", "/api/auth/users/%d" % uid, admin, {"username": "mumias.cashier"})

print("\n%d/%d passed" % (sum(res), len(res)))
raise SystemExit(0 if all(res) else 1)
