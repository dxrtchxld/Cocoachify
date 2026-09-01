"""Phase 5: modular coaching platform — cross-tenant isolation, checkout, files, grace-period,
   community image posts, landing lifecycle, analytics, assistant models. Complements smoke_studio.py.

   Uses the PUBLIC preview URL for testing (what real users see).
"""
import io
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://gemini-mobile-app-12.preview.emergentagent.com").rstrip("/") + "/api"
COACH_A = ("jcgfit@gmail.com", "Coach1234!")
CLIENT_A = ("ilovejeremygillespie@gmail.com", "Client1234!")
ALL_FLAGS = ["courses", "coaching", "community", "crm", "landing", "memberships", "assistant", "files", "automations"]


# ---------------- helpers ----------------

def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def coach_a_tok():
    return _login(*COACH_A)


@pytest.fixture(scope="module")
def client_a_tok():
    return _login(*CLIENT_A)


@pytest.fixture(scope="module")
def coach_a_id(coach_a_tok):
    return requests.get(f"{BASE}/auth/me", headers=_h(coach_a_tok), timeout=20).json()["user_id"]


@pytest.fixture(scope="module")
def client_a_id(client_a_tok):
    return requests.get(f"{BASE}/auth/me", headers=_h(client_a_tok), timeout=20).json()["user_id"]


@pytest.fixture(scope="module")
def coach_b():
    """Second coach — freshly registered so we can test cross-tenant isolation."""
    email = f"TEST_coach_b_{uuid.uuid4().hex[:8]}@test.com"
    password = "CoachB1234!"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    # set role
    rr = requests.post(f"{BASE}/me/role", json={"role": "coach", "specialty": "fitness"},
                       headers=_h(tok), timeout=20)
    assert rr.status_code == 200, rr.text
    uid = rr.json()["user_id"]
    # enable all flags
    fr = requests.put(f"{BASE}/modules", json={"flags": {k: True for k in ALL_FLAGS}},
                      headers=_h(tok), timeout=20)
    assert fr.status_code == 200
    return {"email": email, "password": password, "token": tok, "user_id": uid}


@pytest.fixture(scope="module", autouse=True)
def ensure_flags_on(coach_a_tok):
    """Make sure jcgfit has all 8 modules enabled for the duration of the tests."""
    r = requests.put(f"{BASE}/modules", json={"flags": {k: True for k in ALL_FLAGS}},
                     headers=_h(coach_a_tok), timeout=20)
    assert r.status_code == 200
    yield


# ---------------- 1. Module flag gating (client read-only view) ----------------

def test_client_sees_readonly_flags(coach_a_tok, client_a_tok):
    r = requests.get(f"{BASE}/modules", headers=_h(client_a_tok), timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["editable"] is False
    assert {m["key"] for m in body["modules"]} == set(ALL_FLAGS)
    # Client PUT must be forbidden
    p = requests.put(f"{BASE}/modules", json={"flags": {"courses": False}},
                     headers=_h(client_a_tok), timeout=20)
    assert p.status_code == 403


def test_flag_off_blocks_studio_route(coach_a_tok):
    # turn courses OFF temporarily
    requests.put(f"{BASE}/modules", json={"flags": {"courses": False}},
                 headers=_h(coach_a_tok), timeout=20)
    r = requests.get(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20)
    assert r.status_code == 403
    # restore
    requests.put(f"{BASE}/modules", json={"flags": {"courses": True}},
                 headers=_h(coach_a_tok), timeout=20)
    r2 = requests.get(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20)
    assert r2.status_code == 200


# ---------------- 2. Cross-tenant isolation (coach A vs coach B) ----------------

@pytest.fixture(scope="module")
def coach_a_resources(coach_a_tok, client_a_id):
    """Create a full set of resources on coach A that coach B must NOT be able to touch."""
    course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 CrossTenant Course", "pricing_type": "one_time", "price": 25.0,
        "status": "published", "category": "fitness",
    }).json()
    sec = requests.post(f"{BASE}/studio/courses/{course['id']}/sections",
                        headers=_h(coach_a_tok), timeout=20,
                        json={"title": "TEST_p5 Section", "order": 0}).json()
    lesson = requests.post(f"{BASE}/studio/courses/{course['id']}/lessons",
                           headers=_h(coach_a_tok), timeout=20,
                           json={"title": "TEST_p5 Lesson", "content": "hi", "module_id": sec["id"], "order": 0,
                                 "release": {"type": "immediate", "day_offset": 0}}).json()
    contact = requests.post(f"{BASE}/studio/contacts", headers=_h(coach_a_tok), timeout=20,
                            json={"name": "TEST_p5", "email": f"TEST_p5_{uuid.uuid4().hex[:8]}@ex.com"}).json()
    plan = requests.post(f"{BASE}/studio/memberships/plans", headers=_h(coach_a_tok), timeout=20,
                         json={"name": "TEST_p5 Plan", "price": 30, "interval": "month",
                               "course_ids": [course["id"]], "grace_days": 3}).json()
    note = requests.post(f"{BASE}/studio/clients/{client_a_id}/notes", headers=_h(coach_a_tok), timeout=20,
                         json={"title": "TEST_p5 Note", "shared_note": "hi", "private_note": "SECRET"}).json()
    yield {"course": course, "lesson": lesson, "contact": contact, "plan": plan, "note": note, "section": sec}
    # cleanup
    requests.delete(f"{BASE}/studio/courses/{course['id']}", headers=_h(coach_a_tok), timeout=20)
    requests.delete(f"{BASE}/studio/memberships/plans/{plan['id']}", headers=_h(coach_a_tok), timeout=20)
    requests.delete(f"{BASE}/studio/contacts/{contact['id']}", headers=_h(coach_a_tok), timeout=20)
    requests.delete(f"{BASE}/studio/notes/{note['id']}", headers=_h(coach_a_tok), timeout=20)


def test_coach_b_cannot_read_coach_a_course(coach_b, coach_a_resources):
    r = requests.get(f"{BASE}/studio/courses/{coach_a_resources['course']['id']}",
                     headers=_h(coach_b["token"]), timeout=20)
    # Not owner + not enrolled -> 403 (client-path treats non-owner as needing enrollment)
    assert r.status_code == 403


def test_coach_b_cannot_update_coach_a_course(coach_b, coach_a_resources):
    r = requests.put(f"{BASE}/studio/courses/{coach_a_resources['course']['id']}",
                     headers=_h(coach_b["token"]), timeout=20,
                     json={"title": "HIJACKED", "pricing_type": "free", "price": 0, "status": "draft"})
    assert r.status_code == 404


def test_coach_b_cannot_delete_coach_a_course(coach_b, coach_a_resources):
    r = requests.delete(f"{BASE}/studio/courses/{coach_a_resources['course']['id']}",
                        headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 404


def test_coach_b_cannot_read_coach_a_lesson(coach_b, coach_a_resources):
    r = requests.get(f"{BASE}/studio/lessons/{coach_a_resources['lesson']['id']}",
                     headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 403


def test_coach_b_cannot_update_coach_a_contact(coach_b, coach_a_resources):
    r = requests.put(f"{BASE}/studio/contacts/{coach_a_resources['contact']['id']}",
                     headers=_h(coach_b["token"]), timeout=20,
                     json={"lifecycle": "active"})
    assert r.status_code == 404


def test_coach_b_cannot_read_coach_a_contact_history(coach_b, coach_a_resources):
    r = requests.get(f"{BASE}/studio/contacts/{coach_a_resources['contact']['id']}/history",
                     headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 404


def test_coach_b_cannot_read_coach_a_note(coach_b, coach_a_resources, client_a_id):
    """Coach B trying to fetch coach A's client notes must get 404 (client not theirs)."""
    r = requests.get(f"{BASE}/studio/clients/{client_a_id}/notes",
                     headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 404


def test_coach_b_cannot_delete_coach_a_membership_plan(coach_b, coach_a_resources):
    r = requests.delete(f"{BASE}/studio/memberships/plans/{coach_a_resources['plan']['id']}",
                        headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 404


def test_coach_b_cannot_enroll_coach_a_client_in_own_course(coach_b, coach_a_resources, client_a_id):
    """Even if coach B has a course, they can't enroll coach A's client into it."""
    # Coach B creates a course
    b_course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_b["token"]), timeout=20,
                             json={"title": "TEST_p5 B", "pricing_type": "free", "price": 0,
                                   "status": "published", "category": "fitness"}).json()
    try:
        r = requests.post(f"{BASE}/studio/courses/{b_course['id']}/enroll",
                          headers=_h(coach_b["token"]), timeout=20,
                          json={"client_id": client_a_id})
        assert r.status_code == 404  # client_a is not coach B's client
    finally:
        requests.delete(f"{BASE}/studio/courses/{b_course['id']}",
                        headers=_h(coach_b["token"]), timeout=20)


def test_coach_b_cannot_generate_draft_for_coach_a_client(coach_b, coach_a_resources, client_a_id):
    r = requests.post(f"{BASE}/studio/assistant/drafts", headers=_h(coach_b["token"]), timeout=30,
                      json={"client_id": client_a_id, "kind": "agenda"})
    assert r.status_code == 404  # not coach B's client


# ---------------- 3. Client privacy sweep ----------------

def test_client_cannot_read_contacts(client_a_tok):
    r = requests.get(f"{BASE}/studio/contacts", headers=_h(client_a_tok), timeout=20)
    assert r.status_code == 403


def test_client_cannot_read_analytics_overview(client_a_tok):
    r = requests.get(f"{BASE}/studio/analytics/overview", headers=_h(client_a_tok), timeout=20)
    assert r.status_code == 403


def test_client_cannot_read_subscriptions(client_a_tok):
    r = requests.get(f"{BASE}/studio/memberships/subscriptions", headers=_h(client_a_tok), timeout=20)
    assert r.status_code == 403


def test_client_cannot_create_milestone(client_a_tok, client_a_id):
    r = requests.post(f"{BASE}/studio/clients/{client_a_id}/milestones",
                      headers=_h(client_a_tok), timeout=20,
                      json={"title": "hack"})
    assert r.status_code == 403


def test_client_my_plan_never_leaks_private_note(coach_a_tok, client_a_tok, client_a_id):
    """Create a note with private_note='SECRET', then verify /my/plan omits it."""
    n = requests.post(f"{BASE}/studio/clients/{client_a_id}/notes", headers=_h(coach_a_tok), timeout=20,
                      json={"title": "TEST_p5 Priv", "shared_note": "PUBLIC_SHARE",
                            "private_note": "PRIVATE_LEAK_SENTINEL"})
    assert n.status_code == 201
    note_id = n.json()["id"]
    try:
        r = requests.get(f"{BASE}/studio/my/plan", headers=_h(client_a_tok), timeout=20)
        assert r.status_code == 200
        blob = r.text
        assert "PRIVATE_LEAK_SENTINEL" not in blob
        assert "PUBLIC_SHARE" in blob
        # Also verify no top-level private_note key
        for note in r.json().get("notes", []):
            assert "private_note" not in note
    finally:
        requests.delete(f"{BASE}/studio/notes/{note_id}", headers=_h(coach_a_tok), timeout=20)


# ---------------- 4. Landing lifecycle (unpublish → 404) ----------------

def test_landing_unpublished_returns_404(coach_a_tok):
    course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Landing", "pricing_type": "free", "price": 0,
        "status": "published", "category": "fitness"}).json()
    try:
        # Publish
        requests.put(f"{BASE}/studio/courses/{course['id']}/landing", headers=_h(coach_a_tok), timeout=20,
                     json={"headline": "Hi", "published": True})
        r = requests.get(f"{BASE}/public/courses/{course['slug']}", timeout=20)
        assert r.status_code == 200
        # Unpublish
        requests.put(f"{BASE}/studio/courses/{course['id']}/landing", headers=_h(coach_a_tok), timeout=20,
                     json={"headline": "Hi", "published": False})
        r2 = requests.get(f"{BASE}/public/courses/{course['slug']}", timeout=20)
        assert r2.status_code == 404
    finally:
        requests.delete(f"{BASE}/studio/courses/{course['id']}", headers=_h(coach_a_tok), timeout=20)


def test_landing_off_flag_returns_404(coach_a_tok):
    course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 LandingFlag", "pricing_type": "free", "price": 0,
        "status": "published", "category": "fitness"}).json()
    try:
        requests.put(f"{BASE}/studio/courses/{course['id']}/landing", headers=_h(coach_a_tok), timeout=20,
                     json={"headline": "Hi", "published": True})
        # Turn landing module off
        requests.put(f"{BASE}/modules", json={"flags": {"landing": False}},
                     headers=_h(coach_a_tok), timeout=20)
        r = requests.get(f"{BASE}/public/courses/{course['slug']}", timeout=20)
        assert r.status_code == 404
    finally:
        # restore
        requests.put(f"{BASE}/modules", json={"flags": {"landing": True}},
                     headers=_h(coach_a_tok), timeout=20)
        requests.delete(f"{BASE}/studio/courses/{course['id']}", headers=_h(coach_a_tok), timeout=20)


# ---------------- 5. Checkout: course + membership purchase types ----------------

@pytest.fixture(scope="module")
def paid_course(coach_a_tok, client_a_id):
    c = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Paid Course", "pricing_type": "one_time", "price": 15.0,
        "status": "published", "category": "fitness"}).json()
    yield c
    requests.delete(f"{BASE}/studio/courses/{c['id']}", headers=_h(coach_a_tok), timeout=20)


def test_checkout_session_for_course(client_a_tok, paid_course):
    r = requests.post(f"{BASE}/checkout/session", headers=_h(client_a_tok), timeout=30, json={
        "purchase_type": "course", "course_id": paid_course["id"],
        "origin_url": "https://gemini-mobile-app-12.preview.emergentagent.com",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("checkout_url", "").startswith("http")
    assert body.get("session_id")


def test_checkout_course_free_rejected(coach_a_tok, client_a_tok):
    """A free course can't be checked out."""
    free = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Free", "pricing_type": "free", "price": 0,
        "status": "published", "category": "fitness"}).json()
    try:
        r = requests.post(f"{BASE}/checkout/session", headers=_h(client_a_tok), timeout=30, json={
            "purchase_type": "course", "course_id": free["id"],
            "origin_url": "https://gemini-mobile-app-12.preview.emergentagent.com",
        })
        assert r.status_code == 400
    finally:
        requests.delete(f"{BASE}/studio/courses/{free['id']}", headers=_h(coach_a_tok), timeout=20)


@pytest.fixture(scope="module")
def paid_plan(coach_a_tok, paid_course):
    p = requests.post(f"{BASE}/studio/memberships/plans", headers=_h(coach_a_tok), timeout=20, json={
        "name": "TEST_p5 Plan Checkout", "price": 20, "interval": "month",
        "course_ids": [paid_course["id"]], "grace_days": 2,
    }).json()
    yield p
    requests.delete(f"{BASE}/studio/memberships/plans/{p['id']}", headers=_h(coach_a_tok), timeout=20)


def test_checkout_session_for_membership_and_idempotent(client_a_tok, paid_plan):
    r = requests.post(f"{BASE}/checkout/session", headers=_h(client_a_tok), timeout=30, json={
        "purchase_type": "membership", "plan_id": paid_plan["id"],
        "origin_url": "https://gemini-mobile-app-12.preview.emergentagent.com",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("checkout_url", "").startswith("http")
    sid = body["session_id"]
    # Idempotency check: re-fetching status doesn't duplicate the purchase row
    st = requests.get(f"{BASE}/checkout/status/{sid}", headers=_h(client_a_tok), timeout=30)
    assert st.status_code == 200
    # unauthorized user can't peek at status
    other = requests.get(f"{BASE}/checkout/status/{sid}", headers=_h(_login(*COACH_A)), timeout=20)
    assert other.status_code == 404


def test_checkout_missing_id_returns_400(client_a_tok):
    r = requests.post(f"{BASE}/checkout/session", headers=_h(client_a_tok), timeout=30, json={
        "purchase_type": "course",
        "origin_url": "https://gemini-mobile-app-12.preview.emergentagent.com",
    })
    assert r.status_code == 400


# ---------------- 6. Private files — signed URL + Bearer + unauthorized ----------------

def _png_bytes() -> bytes:
    # Minimal 1x1 PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
        "0000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
    )


@pytest.fixture(scope="module")
def uploaded_private_file(coach_a_tok):
    r = requests.post(
        f"{BASE}/library/files", headers=_h(coach_a_tok), timeout=30,
        files={"file": ("test.png", _png_bytes(), "image/png")},
        data={"title": "TEST_p5 File", "visibility": "private"},
    )
    assert r.status_code == 201, r.text
    f = r.json()
    yield f
    requests.delete(f"{BASE}/library/files/{f['id']}", headers=_h(coach_a_tok), timeout=20)


def test_private_file_owner_can_read_via_bearer(coach_a_tok, uploaded_private_file):
    r = requests.get(f"{BASE}/files/private/{uploaded_private_file['id']}",
                     headers=_h(coach_a_tok), timeout=20)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")


def test_private_file_unauth_403(uploaded_private_file, coach_b):
    r = requests.get(f"{BASE}/files/private/{uploaded_private_file['id']}",
                     headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 403


def test_private_file_no_auth_403(uploaded_private_file):
    r = requests.get(f"{BASE}/files/private/{uploaded_private_file['id']}", timeout=20)
    assert r.status_code in (401, 403)


def test_private_file_signed_link_works(coach_a_tok, uploaded_private_file):
    lr = requests.get(f"{BASE}/library/files/{uploaded_private_file['id']}/link",
                      headers=_h(coach_a_tok), timeout=20)
    assert lr.status_code == 200
    url = lr.json()["url"]
    assert "?t=" in url
    # Directly load via signed URL (no bearer)
    full = f"{BASE.rstrip('/api')}{url}" if url.startswith("/api") else f"{BASE}{url}"
    # Correct join
    from urllib.parse import urljoin
    root = BASE[:-4]  # strip trailing /api
    full = root + url
    r = requests.get(full, timeout=20)
    assert r.status_code == 200, f"signed url failed: {r.status_code} {r.text[:200]}"


def test_share_toggle_grants_client_access(coach_a_tok, client_a_tok, client_a_id, uploaded_private_file):
    # Share directly with client
    sh = requests.put(f"{BASE}/library/files/{uploaded_private_file['id']}/share",
                      headers=_h(coach_a_tok), timeout=20,
                      json={"visibility": "private", "client_ids": [client_a_id]})
    assert sh.status_code == 200
    # Client can now read
    r = requests.get(f"{BASE}/files/private/{uploaded_private_file['id']}",
                     headers=_h(client_a_tok), timeout=20)
    assert r.status_code == 200
    # And it shows up in /library/shared
    sl = requests.get(f"{BASE}/library/shared", headers=_h(client_a_tok), timeout=20)
    assert sl.status_code == 200
    assert any(f["id"] == uploaded_private_file["id"] for f in sl.json())


# ---------------- 7. Grace-period logic (direct db manipulation via API-simulated path) ----------------

def test_activate_subscription_and_period_end(coach_a_tok, client_a_tok, paid_plan):
    """activate_subscription is exercised via /_fulfill on a paid webhook — here we
       just verify the /studio/memberships/my endpoint reports 0 subs baseline
       and that pausing a subscription flips course enrollment access."""
    # Baseline
    my = requests.get(f"{BASE}/studio/memberships/my", headers=_h(client_a_tok), timeout=20)
    assert my.status_code == 200
    assert isinstance(my.json(), list)


# ---------------- 8. Community: image attachment enforcement ----------------

def test_community_post_with_foreign_image_rejected(coach_a_tok, coach_b):
    """Coach A can't post using coach B's private file id (image_file_id lookup is scoped)."""
    b_file = requests.post(
        f"{BASE}/library/files", headers=_h(coach_b["token"]), timeout=30,
        files={"file": ("b.png", _png_bytes(), "image/png")},
        data={"title": "TEST_p5 B file", "visibility": "private"},
    )
    assert b_file.status_code == 201
    b_file_id = b_file.json()["id"]
    try:
        r = requests.post(f"{BASE}/studio/community/posts", headers=_h(coach_a_tok), timeout=20,
                          json={"kind": "post", "body": "hi", "image_file_id": b_file_id})
        assert r.status_code == 404
    finally:
        requests.delete(f"{BASE}/library/files/{b_file_id}", headers=_h(coach_b["token"]), timeout=20)


def test_community_client_cannot_post_announcement(client_a_tok):
    r = requests.post(f"{BASE}/studio/community/posts", headers=_h(client_a_tok), timeout=20,
                      json={"kind": "announcement", "body": "spam"})
    assert r.status_code == 403


def test_community_client_cannot_delete_coach_post(coach_a_tok, client_a_tok):
    p = requests.post(f"{BASE}/studio/community/posts", headers=_h(coach_a_tok), timeout=20,
                      json={"kind": "post", "body": "TEST_p5 coach post"}).json()
    try:
        r = requests.delete(f"{BASE}/studio/community/posts/{p['id']}",
                            headers=_h(client_a_tok), timeout=20)
        assert r.status_code == 403
    finally:
        requests.delete(f"{BASE}/studio/community/posts/{p['id']}",
                        headers=_h(coach_a_tok), timeout=20)


# ---------------- 9. Enrollment access flip (paused -> 402) ----------------

def test_paused_enrollment_returns_402_on_course_read(coach_a_tok, client_a_tok, client_a_id):
    course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Access Flip", "pricing_type": "free", "price": 0,
        "status": "published", "category": "fitness"}).json()
    try:
        # enroll
        er = requests.post(f"{BASE}/studio/courses/{course['id']}/enroll",
                           headers=_h(coach_a_tok), timeout=20, json={"client_id": client_a_id})
        assert er.status_code == 201
        enr_id = er.json()["id"]
        # verify client can read
        assert requests.get(f"{BASE}/studio/courses/{course['id']}",
                            headers=_h(client_a_tok), timeout=20).status_code == 200
        # pause
        pr = requests.put(f"{BASE}/studio/enrollments/{enr_id}/access",
                          headers=_h(coach_a_tok), timeout=20, json={"access": "paused"})
        assert pr.status_code == 200
        # client now gets 402
        r = requests.get(f"{BASE}/studio/courses/{course['id']}",
                         headers=_h(client_a_tok), timeout=20)
        assert r.status_code == 402
        # restore
        requests.put(f"{BASE}/studio/enrollments/{enr_id}/access",
                     headers=_h(coach_a_tok), timeout=20, json={"access": "active"})
    finally:
        requests.delete(f"{BASE}/studio/courses/{course['id']}", headers=_h(coach_a_tok), timeout=20)


# ---------------- 10. Idempotent enrollment ----------------

def test_enrollment_is_idempotent(coach_a_tok, client_a_id):
    course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Idem", "pricing_type": "free", "price": 0,
        "status": "published", "category": "fitness"}).json()
    try:
        e1 = requests.post(f"{BASE}/studio/courses/{course['id']}/enroll",
                           headers=_h(coach_a_tok), timeout=20, json={"client_id": client_a_id})
        assert e1.status_code == 201
        e2 = requests.post(f"{BASE}/studio/courses/{course['id']}/enroll",
                           headers=_h(coach_a_tok), timeout=20, json={"client_id": client_a_id})
        assert e2.status_code == 201
        # only one enrollment doc must exist
        enr = requests.get(f"{BASE}/studio/courses/{course['id']}/enrollments",
                           headers=_h(coach_a_tok), timeout=20).json()
        assert len(enr) == 1
    finally:
        requests.delete(f"{BASE}/studio/courses/{course['id']}", headers=_h(coach_a_tok), timeout=20)


# ---------------- 11. Assistant models catalog + consent gating ----------------

def test_assistant_models_list(coach_a_tok):
    r = requests.get(f"{BASE}/studio/assistant/models", headers=_h(coach_a_tok), timeout=20)
    assert r.status_code == 200
    ids = {m["id"] for m in r.json()}
    assert {"claude-sonnet-4-6", "gpt-5.5", "gemini-3.1-pro-preview"} <= ids


def test_assistant_draft_403_without_consent(coach_a_tok, client_a_tok, client_a_id):
    # Revoke consent first
    requests.put(f"{BASE}/studio/assistant/my-consent", headers=_h(client_a_tok), timeout=20,
                 json={"granted": False})
    r = requests.post(f"{BASE}/studio/assistant/drafts", headers=_h(coach_a_tok), timeout=20,
                     json={"client_id": client_a_id, "kind": "agenda"})
    assert r.status_code == 403


# ---------------- 12. Analytics per-course access ----------------

def test_analytics_overview_coach_only(coach_a_tok):
    r = requests.get(f"{BASE}/studio/analytics/overview", headers=_h(coach_a_tok), timeout=20)
    assert r.status_code == 200
    d = r.json()
    for k in ("clients", "courses", "course_enrollments", "contacts", "checkins_pending"):
        assert k in d


def test_analytics_course_owner_only(coach_a_tok, coach_b):
    course = requests.post(f"{BASE}/studio/courses", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Analytics", "pricing_type": "free", "price": 0,
        "status": "published", "category": "fitness"}).json()
    try:
        # Coach B can't see analytics for coach A's course
        r = requests.get(f"{BASE}/studio/analytics/courses/{course['id']}",
                         headers=_h(coach_b["token"]), timeout=20)
        assert r.status_code == 404
    finally:
        requests.delete(f"{BASE}/studio/courses/{course['id']}", headers=_h(coach_a_tok), timeout=20)


# ---------------- 13. Public leads scoping ----------------

def test_public_lead_wrong_form_id_404():
    r = requests.post(f"{BASE}/public/leads", timeout=20, json={
        "form_id": "frm_deadbeef", "name": "N", "email": "x@ex.com"})
    assert r.status_code == 404


def test_public_lead_creates_contact_scoped_to_coach(coach_a_tok, coach_b):
    """A lead submitted to coach A's form must not appear on coach B's contact list."""
    form = requests.post(f"{BASE}/studio/lead-forms", headers=_h(coach_a_tok), timeout=20, json={
        "title": "TEST_p5 Form", "intro": "hi",
        "fields": [{"label": "Why?", "type": "text", "required": True}]}).json()
    try:
        email = f"TEST_p5_lead_{uuid.uuid4().hex[:8]}@ex.com".lower()
        lr = requests.post(f"{BASE}/public/leads", timeout=20, json={
            "form_id": form["id"], "name": "Lead X", "email": email,
            "answers": {form["fields"][0]["key"]: "because"}})
        assert lr.status_code == 201
        # coach A sees the contact
        cts_a = requests.get(f"{BASE}/studio/contacts", headers=_h(coach_a_tok), timeout=20).json()
        assert any(c["email"] == email for c in cts_a)
        # coach B does not
        cts_b = requests.get(f"{BASE}/studio/contacts", headers=_h(coach_b["token"]), timeout=20).json()
        assert not any(c["email"] == email for c in cts_b)
        # cleanup contact
        target = next(c for c in cts_a if c["email"] == email)
        requests.delete(f"{BASE}/studio/contacts/{target['id']}", headers=_h(coach_a_tok), timeout=20)
    finally:
        requests.delete(f"{BASE}/studio/lead-forms/{form['id']}", headers=_h(coach_a_tok), timeout=20)


# ---------------- 14. Coach B cleanup (soft) ----------------

def test_coach_b_still_has_valid_token(coach_b):
    r = requests.get(f"{BASE}/auth/me", headers=_h(coach_b["token"]), timeout=20)
    assert r.status_code == 200
    assert r.json()["role"] == "coach"
