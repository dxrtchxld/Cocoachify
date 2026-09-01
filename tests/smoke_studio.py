"""End-to-end smoke test for the new modular coaching platform (Phases A-F)."""
import sys

import requests

BASE = "http://localhost:8001/api"
COACH = ("jcgfit@gmail.com", "Coach1234!")
CLIENT = ("ilovejeremygillespie@gmail.com", "Client1234!")

fails: list[str] = []


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def call(method, path, token, expect=200, **kw):
    r = requests.request(method, f"{BASE}{path}",
                         headers={"Authorization": f"Bearer {token}"}, timeout=60, **kw)
    if r.status_code != expect:
        fails.append(f"{method} {path} -> {r.status_code} (expected {expect}): {r.text[:200]}")
    try:
        return r.json()
    except Exception:
        return {}


ct = login(*COACH)
clt = login(*CLIENT)
me = call("GET", "/auth/me", ct)
client_me = call("GET", "/auth/me", clt)
client_id = client_me["user_id"]
print("coach", me["user_id"], "client", client_id)

# --- Phase A: flags gate everything off by default ---
mods = call("GET", "/modules", ct)
print("modules:", [(m["key"], m["enabled"]) for m in mods["modules"]])
call("GET", "/studio/courses", ct, expect=403)
call("PUT", "/modules", ct, json={"flags": {k: True for k in
     ["courses", "coaching", "community", "crm", "landing", "memberships", "assistant", "files"]}})

# --- Phase B: course + section + lesson + drip + enroll ---
course = call("POST", "/studio/courses", ct, expect=201, json={
    "title": "Smoke Test Course", "subtitle": "s", "description": "d",
    "category": "fitness", "pricing_type": "one_time", "price": 49.0, "status": "published"})
cid = course["id"]
sec = call("POST", f"/studio/courses/{cid}/sections", ct, expect=201, json={"title": "Week 1", "order": 0})
l1 = call("POST", f"/studio/courses/{cid}/lessons", ct, expect=201, json={
    "title": "Lesson One", "content": "body", "module_id": sec["id"], "order": 0,
    "release": {"type": "immediate", "day_offset": 0}})
l2 = call("POST", f"/studio/courses/{cid}/lessons", ct, expect=201, json={
    "title": "Locked Lesson", "content": "later", "module_id": sec["id"], "order": 1,
    "release": {"type": "day_offset", "day_offset": 14}})

# client has no access before enrollment
call("GET", f"/studio/courses/{cid}", clt, expect=403)
call("POST", f"/studio/courses/{cid}/enroll", ct, expect=201, json={"client_id": client_id})
cview = call("GET", f"/studio/courses/{cid}", clt)
lessons = cview["sections"][0]["lessons"]
locked = [l for l in lessons if not l["unlocked"]]
if len(locked) != 1:
    fails.append(f"drip release failed: {[ (l['title'], l['unlocked']) for l in lessons ]}")
call("GET", f"/studio/lessons/{l2['id']}", clt, expect=403)   # not released
call("GET", f"/studio/lessons/{l1['id']}", clt)
call("POST", f"/studio/lessons/{l1['id']}/complete", clt)
resume = call("GET", "/studio/continue", clt)
print("resume:", resume["resume"]["course_title"] if resume.get("resume") else None)
perf = call("GET", f"/studio/analytics/courses/{cid}", ct)
print("course perf:", perf["enrollments"], perf["avg_progress"])
call("GET", f"/studio/analytics/courses/{cid}", clt, expect=403)

# --- Phase B: plans / private notes ---
mil = call("POST", f"/studio/clients/{client_id}/milestones", ct, expect=201,
           json={"title": "First 5k", "description": ""})
goal = call("POST", f"/studio/clients/{client_id}/goals", ct, expect=201,
            json={"title": "Bodyweight", "metric": "weight", "unit": "lb", "target_value": 180, "current_value": 190})
plan = call("POST", f"/studio/clients/{client_id}/action-plans", ct, expect=201,
            json={"title": "This week", "items": [{"text": "Walk 8k steps"}]})
asg = call("POST", f"/studio/clients/{client_id}/assignments", ct, expect=201,
           json={"title": "Food log", "instructions": "3 days"})
note = call("POST", f"/studio/clients/{client_id}/notes", ct, expect=201, json={
    "title": "Session 1", "agenda": "Review", "shared_note": "Great work",
    "private_note": "SECRET-COACH-ONLY"})
tpl = call("POST", "/studio/checkin-templates", ct, expect=201, json={
    "title": "Weekly", "cadence": "weekly",
    "questions": [{"label": "Energy 1-10", "type": "scale", "required": True}],
    "client_ids": [client_id]})
qid = tpl["questions"][0]["id"]
call("POST", f"/studio/checkin-templates/{tpl['id']}/respond", clt, expect=201, json={"answers": {qid: "8"}})
resp = call("GET", "/studio/checkin-responses", ct)
if not resp or resp[0].get("client_name") is None:
    fails.append("check-in response not visible to coach")

myplan = call("GET", "/studio/my/plan", clt)
blob = str(myplan)
if "SECRET-COACH-ONLY" in blob:
    fails.append("PRIVACY BREACH: private coach note leaked to client")
if "Great work" not in blob:
    fails.append("shared note missing for client")
call("POST", f"/studio/goals/{goal['id']}/progress", clt, json={"current_value": 185})
call("POST", f"/studio/action-plans/{plan['id']}/items/{plan['items'][0]['id']}/toggle", clt)
call("POST", f"/studio/assignments/{asg['id']}/submit", clt, json={"text": "done"})
call("POST", f"/studio/assignments/{asg['id']}/review", ct, json={"feedback": "nice"})
# client must not be able to write coach-side data
call("POST", f"/studio/clients/{client_id}/milestones", clt, expect=403, json={"title": "hack"})
call("GET", f"/studio/clients/{client_id}/notes", clt, expect=403)

# --- Phase D: CRM + landing ---
form = call("POST", "/studio/lead-forms", ct, expect=201, json={
    "title": "Apply", "intro": "Tell me about you",
    "fields": [{"label": "Biggest challenge", "type": "textarea", "required": True}]})
call("PUT", f"/studio/courses/{cid}/landing", ct, json={
    "headline": "Train like never before", "subheadline": "8 weeks",
    "highlights": ["Weekly calls"], "testimonials": [{"name": "A", "text": "Loved it"}],
    "cta_label": "Apply", "lead_form_id": form["id"], "published": True})
pub = requests.get(f"{BASE}/public/courses/{course['slug']}", timeout=20)
if pub.status_code != 200:
    fails.append(f"public landing page failed: {pub.status_code} {pub.text[:200]}")
else:
    print("public page ok:", pub.json()["course"]["title"], "| form:", bool(pub.json()["lead_form"]))
lead = requests.post(f"{BASE}/public/leads", timeout=20, json={
    "form_id": form["id"], "name": "Jane Lead", "email": "jane.smoke@example.com",
    "answers": {form["fields"][0]["key"]: "Consistency"}})
if lead.status_code != 201:
    fails.append(f"lead capture failed: {lead.status_code} {lead.text[:200]}")
contacts = call("GET", "/studio/contacts", ct)
if not any(c["email"] == "jane.smoke@example.com" for c in contacts):
    fails.append("lead did not become a contact")
seg = call("POST", "/studio/segments", ct, expect=201, json={"name": "New leads", "lifecycle": ["lead"]})
print("segment size:", seg.get("size"))
call("GET", "/studio/contacts", clt, expect=403)

# --- Phase E: community + memberships ---
post = call("POST", "/studio/community/posts", ct, expect=201, json={
    "kind": "announcement", "title": "Welcome", "body": "New cohort starts Monday", "pinned": True})
call("POST", f"/studio/community/posts/{post['id']}/comments", clt, expect=201, json={"body": "Excited!"})
call("POST", f"/studio/community/posts/{post['id']}/react", clt, json={"emoji": "❤️"})
ev = call("POST", "/studio/community/posts", ct, expect=201, json={
    "kind": "event", "title": "Live Q&A", "body": "Zoom call",
    "event": {"starts_at": "2027-01-01T18:00:00Z", "location": "Zoom"}})
call("POST", f"/studio/community/posts/{ev['id']}/rsvp", clt, json={"status": "going"})
feed = call("GET", "/studio/community/feed", clt)
print("feed posts:", len(feed))
call("POST", "/studio/community/posts", clt, expect=403, json={"kind": "announcement", "body": "spam"})

mplan = call("POST", "/studio/memberships/plans", ct, expect=201, json={
    "name": "Inner Circle", "price": 99, "interval": "month", "course_ids": [cid], "grace_days": 5})
print("plan:", mplan["name"], mplan["grace_days"])
mine = call("GET", "/studio/memberships/my", clt)

# --- Phase F: assistant consent gating ---
call("POST", "/studio/assistant/drafts", ct, expect=403,
     json={"client_id": client_id, "kind": "agenda"})
call("PUT", "/studio/assistant/my-consent", clt, json={"granted": True})
draft = call("POST", "/studio/assistant/drafts", ct, expect=201,
             json={"client_id": client_id, "kind": "agenda", "model": "claude-sonnet-4-6"})
print("draft chars:", len(draft.get("content", "")), "| model:", draft.get("model_label"))
call("PUT", "/studio/assistant/my-consent", clt, json={"granted": False})
call("POST", "/studio/assistant/drafts", ct, expect=403, json={"client_id": client_id, "kind": "followup"})

overview = call("GET", "/studio/analytics/overview", ct)
print("overview:", {k: overview.get(k) for k in
                    ["clients", "courses", "course_enrollments", "contacts", "checkins_pending"]})

# --- cleanup test artifacts ---
call("DELETE", f"/studio/courses/{cid}", ct)
call("DELETE", f"/studio/milestones/{mil['id']}", ct)
call("DELETE", f"/studio/goals/{goal['id']}", ct)
call("DELETE", f"/studio/action-plans/{plan['id']}", ct)
call("DELETE", f"/studio/assignments/{asg['id']}", ct)
call("DELETE", f"/studio/notes/{note['id']}", ct)
call("DELETE", f"/studio/checkin-templates/{tpl['id']}", ct)
call("DELETE", f"/studio/community/posts/{post['id']}", ct)
call("DELETE", f"/studio/community/posts/{ev['id']}", ct)
call("DELETE", f"/studio/memberships/plans/{mplan['id']}", ct)
call("DELETE", f"/studio/lead-forms/{form['id']}", ct)
call("DELETE", f"/studio/segments/{seg['id']}", ct)
for c in call("GET", "/studio/contacts", ct):
    if c["email"] == "jane.smoke@example.com":
        call("DELETE", f"/studio/contacts/{c['id']}", ct)

print()
if fails:
    print(f"❌ {len(fails)} FAILURES")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("✅ ALL SMOKE CHECKS PASSED")
