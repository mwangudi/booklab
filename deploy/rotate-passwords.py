#!/usr/bin/env python3
"""Rotate every staff password. Passwords are generated ON THE SERVER, set via
the API so they are bcrypt-hashed and audited, and written to a root-only file.

They are never printed to stdout, so they do not reach a terminal transcript.
Read them with:  sudo cat <the file>  — then delete it once distributed.
"""
import json, os, secrets, stat, sys, urllib.request, urllib.error
from datetime import date

BASE = "http://127.0.0.1:4100"
CURRENT_ADMIN = sys.argv[1] if len(sys.argv) > 1 else "admin123"

# No 0/O/1/l/I — these get read aloud and typed at a till.
ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
def make_password(n=14):
    return "".join(secrets.choice(ALPHABET) for _ in range(n))

def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token: req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b'null')
        except Exception: return e.code, raw[:200]

s, r = call("POST", "/api/auth/login", body={"email": "admin", "password": CURRENT_ADMIN})
if s != 200:
    print("Could not sign in as admin with the password given. Pass the current one as an argument.")
    raise SystemExit(1)
token = r["token"]

s, users = call("GET", "/api/auth/users", token)
assert s == 200, users

rotated = []
for u in sorted(users, key=lambda x: x["id"]):
    pw = make_password()
    s, _ = call("PATCH", "/api/auth/users/%d" % u["id"], token, {"password": pw})
    ok = s == 200
    # Prove the new password actually works before recording it.
    if ok:
        s2, _ = call("POST", "/api/auth/login",
                     body={"email": u["username"] or u["email"], "password": pw})
        ok = s2 == 200
    rotated.append((u, pw, ok))
    print("  %-18s %-38s %s" % (u["username"] or "-", u["email"], "rotated & verified" if ok else "FAILED"))

path = "/root/booklab-credentials-%s.txt" % date.today().isoformat()
with open(path, "w") as f:
    f.write("Booklab sign-in details - generated %s\n" % date.today().isoformat())
    f.write("Sign in at https://booklab.localinvestors.co.ke with the USERNAME.\n")
    f.write("Give each person only their own line, then delete this file.\n")
    f.write("=" * 72 + "\n\n")
    for u, pw, ok in rotated:
        f.write("%-10s %s\n" % ("Name:", u["name"]))
        f.write("%-10s %s\n" % ("Role:", u["role"]))
        f.write("%-10s %s\n" % ("Branch:", (u.get("branch") or {}).get("name") or "-"))
        f.write("%-10s %s\n" % ("Username:", u["username"] or u["email"]))
        f.write("%-10s %s\n" % ("Password:", pw))
        f.write("%-10s %s\n\n" % ("Email:", u["email"]))
os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)

print("\n  %d accounts rotated." % sum(1 for _, _, ok in rotated if ok))
print("  Written to %s (root only, 0600)." % path)
print("  Read with:  cat %s" % path)
print("  Delete once distributed:  shred -u %s" % path)

print("\n  old published passwords now rejected?")
for uname, old in [("admin", "admin123"), ("kapsabet.cashier", "cashier123"),
                   ("luanda.cashier", "manager123"), ("mumias.cashier", "cashier123")]:
    s, _ = call("POST", "/api/auth/login", body={"email": uname, "password": old})
    print("    %-18s %s" % (uname, "still works - BAD" if s == 200 else "rejected"))
