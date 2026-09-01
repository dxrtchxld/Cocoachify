"""E2E smoke for booking + certificate PDF + video field. Run: python /app/tests/smoke_booking.py"""
import json
import os
import sys
from datetime import date, timedelta

import requests

BASE = "http://localhost:8001/api"
COACH = ("jcgfit@gmail.com", "Coach1234!")
CLIENT = ("ilovejeremygillespie@gmail.com", "Client1234!")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def h(t):
    return {"Authorization": f"Bearer {t}"}


def ok(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        sys.exit(1)


coach = login(*COACH)
client = login(*CLIENT)

# Coach settings default read
r = requests.get(f"{BASE}/studio/booking/settings", headers=h(coach))
ok("GET settings", r.status_code == 200, r.text[:200])
s = r.json()

# Publish the booking page
body = {
    **{k: s[k] for k in ("headline", "intro", "session_types", "availability",
                         "slot_interval_minutes", "buffer_minutes", "max_days_ahead")},
    "enabled": True,
    "slug": "jcg-test",
    "timezone": "UTC",
    "lead_time_hours": 0,
    "availability": [{"weekday": d, "start": "06:00", "end": "20:00"} for d in range(7)],
}
r = requests.put(f"{BASE}/studio/booking/settings", headers=h(coach), json=body)
ok("PUT settings", r.status_code == 200, r.text[:300])
slug = r.json()["slug"]
type_id = r.json()["session_types"][0]["id"]

# Public page
r = requests.get(f"{BASE}/public/book/{slug}")
ok("public page", r.status_code == 200 and r.json()["session_types"], r.text[:200])

# Slots tomorrow
day = (date.today() + timedelta(days=1)).isoformat()
r = requests.get(f"{BASE}/public/book/{slug}/slots", params={"date": day, "session_type_id": type_id})
ok("slots", r.status_code == 200 and len(r.json()["slots"]) > 5, r.text[:200])
slot = r.json()["slots"][0]

# Client (authenticated) books
r = requests.post(f"{BASE}/public/book/{slug}", headers=h(client),
                  json={"session_type_id": type_id, "starts_at": slot, "notes": "smoke test"})
ok("client booking", r.status_code == 201, r.text[:300])
booking_id = r.json()["id"]

# Slot no longer offered
r = requests.get(f"{BASE}/public/book/{slug}/slots", params={"date": day, "session_type_id": type_id})
ok("slot removed after booking", slot not in r.json()["slots"])

# Double booking rejected
r = requests.post(f"{BASE}/public/book/{slug}", headers=h(client),
                  json={"session_type_id": type_id, "starts_at": slot})
ok("double booking 409", r.status_code == 409, r.text[:200])

# Anonymous prospect booking on another slot
r = requests.get(f"{BASE}/public/book/{slug}/slots", params={"date": day, "session_type_id": type_id})
slot2 = r.json()["slots"][0]
r = requests.post(f"{BASE}/public/book/{slug}",
                  json={"session_type_id": type_id, "starts_at": slot2,
                        "name": "Prospect Pat", "email": "pat@example.com", "notes": "hi"})
ok("anon booking", r.status_code == 201, r.text[:300])
anon_id = r.json()["id"]

# Anon booking without name/email rejected
r = requests.get(f"{BASE}/public/book/{slug}/slots", params={"date": day, "session_type_id": type_id})
slot3 = r.json()["slots"][0]
r = requests.post(f"{BASE}/public/book/{slug}", json={"session_type_id": type_id, "starts_at": slot3})
ok("anon needs name/email", r.status_code == 400, r.text[:200])

# Coach sees both, client sees only theirs
r = requests.get(f"{BASE}/studio/booking/requests", headers=h(coach))
ids = [b["id"] for b in r.json()]
ok("coach sees all", booking_id in ids and anon_id in ids)
r = requests.get(f"{BASE}/studio/booking/requests", headers=h(client))
cids = [b["id"] for b in r.json()]
ok("client isolation", booking_id in cids and anon_id not in cids)

# Client cannot confirm
r = requests.post(f"{BASE}/studio/booking/requests/{booking_id}/decision", headers=h(client),
                  json={"action": "confirm"})
ok("client cannot confirm", r.status_code == 403, r.text[:200])

# Coach confirms
r = requests.post(f"{BASE}/studio/booking/requests/{booking_id}/decision", headers=h(coach),
                  json={"action": "confirm", "message": "See you then"})
ok("coach confirms", r.status_code == 200 and r.json()["status"] == "confirmed", r.text[:200])

# Client can cancel own
r = requests.post(f"{BASE}/studio/booking/requests/{booking_id}/decision", headers=h(client),
                  json={"action": "cancel"})
ok("client cancels own", r.status_code == 200, r.text[:200])

# Freed after cancel
r = requests.get(f"{BASE}/public/book/{slug}/slots", params={"date": day, "session_type_id": type_id})
ok("slot freed after cancel", slot in r.json()["slots"])

# Client booking link helper
r = requests.get(f"{BASE}/studio/booking/link", headers=h(client))
ok("client link helper", r.status_code == 200 and r.json()["available"] and r.json()["slug"] == slug, r.text[:200])

# Certificates + PDF
r = requests.get(f"{BASE}/studio/certificates", headers=h(coach))
ok("coach certificates", r.status_code == 200, r.text[:200])
if r.json():
    code = r.json()[0]["code"]
    p = requests.get(f"{BASE}/public/certificates/{code}/pdf")
    ok("certificate pdf", p.status_code == 200 and p.content[:4] == b"%PDF", str(p.status_code))
    v = requests.get(f"{BASE}/public/certificates/{code}")
    ok("certificate verify", v.status_code == 200, v.text[:200])

# Disabled page 404s
requests.put(f"{BASE}/studio/booking/settings", headers=h(coach), json={**body, "enabled": False})
r = requests.get(f"{BASE}/public/book/{slug}")
ok("disabled page 404", r.status_code == 404)
requests.put(f"{BASE}/studio/booking/settings", headers=h(coach), json=body)

print("\nAll booking smoke checks passed.")
