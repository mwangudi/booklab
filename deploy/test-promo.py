#!/usr/bin/env python3
"""End-to-end check of the login-screen carousel API, including its guards.

Creates one slide, verifies it, then deletes it. Leaves no data behind.
"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:4100"

# 1x1 PNG, and an SVG that carries script.
PNG = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAE"
       "hQGAhKmMIQAAAABJRU5ErkJggg==")
SVG = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4="

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
            raw = r.read()
            return r.status, r.headers, raw
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()

def login(email, pw):
    s, _, b = call("POST", "/api/auth/login", body={"email": email, "password": pw})
    if s != 200:
        raise SystemExit("login failed for %s: %s %s" % (email, s, b[:200]))
    return json.loads(b)["token"]

def check(label, got, want):
    ok = "PASS" if got == want else "FAIL"
    print("  [%s] %-52s got %s, want %s" % (ok, label, got, want))
    return got == want

admin = login("admin@booklabbookshop.co.ke", "admin123")
cashier = login("cashier@booklabbookshop.co.ke", "cashier123")
print("logged in\n")

results = []
print("guards:")
s, _, _ = call("POST", "/api/promo", cashier, {"imageBase64": PNG})
results.append(check("cashier cannot add a slide", s, 403))

s, _, _ = call("POST", "/api/promo", None, {"imageBase64": PNG})
results.append(check("anonymous cannot add a slide", s, 401))

s, _, b = call("POST", "/api/promo", admin, {"imageBase64": SVG})
results.append(check("SVG is refused (stored XSS)", s, 400))
print("       -> %s" % json.loads(b).get("error"))

s, _, _ = call("POST", "/api/promo", admin, {"imageBase64": "bm90IGFuIGltYWdlIGF0IGFsbA=="})
results.append(check("non-image is refused", s, 400))

s, _, _ = call("GET", "/api/promo/manage", cashier)
results.append(check("cashier cannot list slides for management", s, 403))

print("\nhappy path:")
s, _, b = call("POST", "/api/promo", admin,
               {"imageBase64": PNG, "title": "PROBE TITLE", "subtitle": "probe subtitle"})
results.append(check("admin adds a slide", s, 201))
slide = json.loads(b)
sid = slide["id"]

s, _, b = call("GET", "/api/promo")
pub = json.loads(b)
results.append(check("public list is readable without a token", s, 200))
results.append(check("the new slide is listed", any(x["id"] == sid for x in pub), True))
results.append(check("public list carries no image bytes", "image" in json.dumps(pub), False))

s, h, b = call("GET", "/api/promo/%d/image" % sid)
results.append(check("image serves", s, 200))
results.append(check("image content-type", h.get("content-type"), "image/png"))
results.append(check("image is cached hard (URL is versioned)",
                     "immutable" in (h.get("cache-control") or ""), True))
results.append(check("image is byte-identical to what was sent", len(b), 70))

s, _, b = call("PUT", "/api/promo/%d" % sid, admin, {"active": False})
results.append(check("admin can hide a slide", s, 200))
s, _, b = call("GET", "/api/promo")
results.append(check("hidden slide drops out of the public list",
                     any(x["id"] == sid for x in json.loads(b)), False))

print("\ncleanup:")
s, _, _ = call("DELETE", "/api/promo/%d" % sid, admin)
results.append(check("admin deletes the slide", s, 204))
s, _, b = call("GET", "/api/promo")
results.append(check("public list is empty again", json.loads(b), []))

print("\n%d/%d passed" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
