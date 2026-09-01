"""Phase 7 backend tests — booking/scheduling links, certificate PDF + public
verification, and private video streaming with HTTP Range."""
import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://gemini-mobile-app-12.preview.emergentagent.com").rstrip("/") + "/api"
COACH = ("jcgfit@gmail.com", "Coach1234!")
CLIENT = ("ilovejeremygillespie@gmail.com", "Client1234!")
ALL_FLAGS = ["courses", "coaching", "community", "crm", "landing", "memberships", "assistant", "files", "automations"]


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def coach_tok():
    return _login(*COACH)


@pytest.fixture(scope="module")
def client_tok():
    return _login(*CLIENT)


@pytest.fixture(scope="module", autouse=True)
def _flags_on(coach_tok):
    requests.put(f"{BASE}/modules", json={"flags": {k: True for k in ALL_FLAGS}}, headers=_h(coach_tok), timeout=20)
    yield


@pytest.fixture(scope="module")
def booking(coach_tok):
    """Publish a wide-open booking page so slots always exist.

    booking_settings is one document per coach, so snapshot the coach's real
    page first and restore it on teardown — otherwise the seeded live page is
    clobbered by the test run.
    """
    before = requests.get(f"{BASE}/studio/booking/settings", headers=_h(coach_tok), timeout=20).json()
    slug = "pytest-booking"
    body = {
        "enabled": True,
        "slug": slug,
        "headline": "Book a session",
        "intro": "pytest",
        "timezone": "UTC",
        "session_types": [{"id": "st_pytest", "name": "Pytest call", "duration_minutes": 30,
                           "description": "", "location": "Zoom"}],
        "availability": [{"weekday": d, "start": "00:00", "end": "23:30"} for d in range(7)],
        "slot_interval_minutes": 30,
        "buffer_minutes": 0,
        "lead_time_hours": 0,
        "max_days_ahead": 30,
    }
    r = requests.put(f"{BASE}/studio/booking/settings", json=body, headers=_h(coach_tok), timeout=30)
    assert r.status_code == 200, r.text
    saved = r.json()
    yield {"slug": saved["slug"], "type_id": saved["session_types"][0]["id"], "body": body}
    before.pop("public_path", None)
    requests.put(f"{BASE}/studio/booking/settings", json=before, headers=_h(coach_tok), timeout=30)


def _free_slot(slug, type_id, days_ahead=3):
    day = (date.today() + timedelta(days=days_ahead)).isoformat()
    r = requests.get(f"{BASE}/public/book/{slug}/slots",
                     params={"date": day, "session_type_id": type_id}, timeout=30)
    assert r.status_code == 200, r.text
    slots = r.json()["slots"]
    assert slots, "expected open slots"
    return slots[0], slots


class TestBookingSettings:
    def test_defaults_readable(self, coach_tok):
        r = requests.get(f"{BASE}/studio/booking/settings", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200, r.text
        assert "session_types" in r.json()

    def test_bad_time_rejected(self, coach_tok, booking):
        bad = {**booking["body"], "availability": [{"weekday": 0, "start": "9am", "end": "17:00"}]}
        r = requests.put(f"{BASE}/studio/booking/settings", json=bad, headers=_h(coach_tok), timeout=20)
        assert r.status_code == 400
        requests.put(f"{BASE}/studio/booking/settings", json=booking["body"], headers=_h(coach_tok), timeout=20)

    def test_inverted_window_rejected(self, coach_tok, booking):
        bad = {**booking["body"], "availability": [{"weekday": 0, "start": "18:00", "end": "09:00"}]}
        r = requests.put(f"{BASE}/studio/booking/settings", json=bad, headers=_h(coach_tok), timeout=20)
        assert r.status_code == 400
        requests.put(f"{BASE}/studio/booking/settings", json=booking["body"], headers=_h(coach_tok), timeout=20)

    def test_client_cannot_edit(self, client_tok, booking):
        r = requests.put(f"{BASE}/studio/booking/settings", json=booking["body"],
                         headers=_h(client_tok), timeout=20)
        assert r.status_code == 403


class TestPublicBooking:
    def test_page_and_slots(self, booking):
        r = requests.get(f"{BASE}/public/book/{booking['slug']}", timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["session_types"][0]["name"] == "Pytest call"
        _free_slot(booking["slug"], booking["type_id"])

    def test_unknown_slug_404(self):
        r = requests.get(f"{BASE}/public/book/does-not-exist-xyz", timeout=20)
        assert r.status_code == 404

    def test_bad_date_400(self, booking):
        r = requests.get(f"{BASE}/public/book/{booking['slug']}/slots",
                         params={"date": "tomorrow"}, timeout=20)
        assert r.status_code == 400

    def test_anon_requires_contact_details(self, booking):
        slot, _ = _free_slot(booking["slug"], booking["type_id"], 4)
        r = requests.post(f"{BASE}/public/book/{booking['slug']}",
                          json={"session_type_id": booking["type_id"], "starts_at": slot}, timeout=20)
        assert r.status_code == 400

    def test_slot_outside_availability_rejected(self, booking):
        # A time that is not on the 30-minute grid can never be offered.
        odd = (datetime.now(timezone.utc) + timedelta(days=5)).replace(
            minute=7, second=0, microsecond=0).isoformat()
        r = requests.post(f"{BASE}/public/book/{booking['slug']}",
                          json={"session_type_id": booking["type_id"], "starts_at": odd,
                                "name": "Odd", "email": "odd@example.com"}, timeout=20)
        assert r.status_code == 409

    def test_anon_booking_creates_crm_lead(self, coach_tok, booking):
        slot, _ = _free_slot(booking["slug"], booking["type_id"], 6)
        email = f"lead_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE}/public/book/{booking['slug']}",
                          json={"session_type_id": booking["type_id"], "starts_at": slot,
                                "name": "Lead Larry", "email": email, "notes": "pytest"}, timeout=30)
        assert r.status_code == 201, r.text
        contacts = requests.get(f"{BASE}/studio/contacts", headers=_h(coach_tok), timeout=30).json()
        assert any(c.get("email") == email for c in contacts)


class TestBookingLifecycle:
    def test_full_flow(self, coach_tok, client_tok, booking):
        slot, _ = _free_slot(booking["slug"], booking["type_id"], 8)

        r = requests.post(f"{BASE}/public/book/{booking['slug']}", headers=_h(client_tok),
                          json={"session_type_id": booking["type_id"], "starts_at": slot,
                                "notes": "pytest client"}, timeout=30)
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        assert r.json()["status"] == "pending"

        # Slot is held while pending.
        _, slots = _free_slot(booking["slug"], booking["type_id"], 8)
        assert slot not in slots

        # Same slot cannot be double booked.
        r = requests.post(f"{BASE}/public/book/{booking['slug']}", headers=_h(client_tok),
                          json={"session_type_id": booking["type_id"], "starts_at": slot}, timeout=30)
        assert r.status_code == 409

        # Client cannot confirm.
        r = requests.post(f"{BASE}/studio/booking/requests/{bid}/decision",
                          json={"action": "confirm"}, headers=_h(client_tok), timeout=20)
        assert r.status_code == 403

        # Coach confirms; the client gets a chat message.
        r = requests.post(f"{BASE}/studio/booking/requests/{bid}/decision",
                          json={"action": "confirm", "message": "see you then"},
                          headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200 and r.json()["status"] == "confirmed"

        # Client cancels their own booking and the slot frees up.
        r = requests.post(f"{BASE}/studio/booking/requests/{bid}/decision",
                          json={"action": "cancel"}, headers=_h(client_tok), timeout=20)
        assert r.status_code == 200
        _, slots = _free_slot(booking["slug"], booking["type_id"], 8)
        assert slot in slots

    def test_client_only_sees_own_bookings(self, coach_tok, client_tok, booking):
        slot, _ = _free_slot(booking["slug"], booking["type_id"], 10)
        anon = requests.post(f"{BASE}/public/book/{booking['slug']}",
                             json={"session_type_id": booking["type_id"], "starts_at": slot,
                                   "name": "Nobody", "email": "nobody@example.com"}, timeout=30)
        assert anon.status_code == 201
        anon_id = anon.json()["id"]
        coach_ids = [b["id"] for b in requests.get(f"{BASE}/studio/booking/requests",
                                                   headers=_h(coach_tok), timeout=30).json()]
        client_ids = [b["id"] for b in requests.get(f"{BASE}/studio/booking/requests",
                                                    headers=_h(client_tok), timeout=30).json()]
        assert anon_id in coach_ids
        assert anon_id not in client_ids

    def test_client_link_helper(self, client_tok, booking):
        r = requests.get(f"{BASE}/studio/booking/link", headers=_h(client_tok), timeout=20)
        assert r.status_code == 200
        assert r.json()["available"] is True
        assert r.json()["slug"] == booking["slug"]


class TestCertificates:
    def test_list_and_pdf(self, coach_tok):
        r = requests.get(f"{BASE}/studio/certificates", headers=_h(coach_tok), timeout=30)
        assert r.status_code == 200, r.text
        certs = r.json()
        if not certs:
            pytest.skip("no certificates issued yet")
        code = certs[0]["code"]
        v = requests.get(f"{BASE}/public/certificates/{code}", timeout=20)
        assert v.status_code == 200 and v.json()["code"] == code
        p = requests.get(f"{BASE}/public/certificates/{code}/pdf", timeout=30)
        assert p.status_code == 200
        assert p.headers["content-type"].startswith("application/pdf")
        assert p.content[:4] == b"%PDF"

    def test_unknown_code_404(self):
        assert requests.get(f"{BASE}/public/certificates/ZZZZZZZZ", timeout=20).status_code == 404


class TestVideoStreaming:
    def _video_lesson(self, tok):
        courses = requests.get(f"{BASE}/studio/courses", headers=_h(tok), timeout=30).json()
        for c in courses:
            detail = requests.get(f"{BASE}/studio/courses/{c['id']}", headers=_h(tok), timeout=30).json()
            for sec in detail.get("sections") or []:
                for l in sec.get("lessons") or []:
                    if l.get("video_file_id"):
                        return l
        return None

    def test_range_streaming(self, client_tok):
        lesson = self._video_lesson(client_tok)
        if not lesson:
            pytest.skip("no video lesson seeded")
        link = requests.get(f"{BASE}/library/files/{lesson['video_file_id']}/link",
                            headers=_h(client_tok), timeout=30)
        assert link.status_code == 200, link.text
        url = BASE.replace("/api", "") + link.json()["url"]

        full = requests.get(url, timeout=60)
        assert full.status_code == 200
        assert full.headers.get("accept-ranges") == "bytes"
        total = len(full.content)

        part = requests.get(url, headers={"Range": "bytes=0-999"}, timeout=60)
        assert part.status_code == 206
        assert len(part.content) == 1000
        assert part.headers["content-range"] == f"bytes 0-999/{total}"

    def test_video_requires_authorization(self, client_tok):
        lesson = self._video_lesson(client_tok)
        if not lesson:
            pytest.skip("no video lesson seeded")
        link = requests.get(f"{BASE}/library/files/{lesson['video_file_id']}/link",
                            headers=_h(client_tok), timeout=30).json()["url"]
        naked = BASE.replace("/api", "") + link.split("?")[0]
        assert requests.get(naked, timeout=30).status_code in (401, 403)


class TestBookingReminders:
    """Day-before booking reminders: in-app chat + email, sent once (idempotent)."""

    def _slot_about_24h_out(self, booking):
        target = datetime.now(timezone.utc) + timedelta(hours=24)
        day = target.date().isoformat()
        r = requests.get(f"{BASE}/public/book/{booking['slug']}/slots",
                         params={"date": day, "session_type_id": booking["type_id"]}, timeout=30)
        assert r.status_code == 200, r.text
        slots = r.json()["slots"]
        assert slots, "expected open slots ~24h out for the reminder test"
        chosen = min(slots, key=lambda s: abs((datetime.fromisoformat(s) - target).total_seconds()))
        hours_out = (datetime.fromisoformat(chosen) - datetime.now(timezone.utc)).total_seconds() / 3600
        assert 18 <= hours_out <= 30, f"chosen slot {chosen} is {hours_out:.1f}h out, not close to 24h"
        return chosen

    def test_reminder_sweep_sends_and_is_idempotent(self, coach_tok, client_tok, booking):
        slot = self._slot_about_24h_out(booking)
        r = requests.post(f"{BASE}/public/book/{booking['slug']}", headers=_h(client_tok),
                          json={"session_type_id": booking["type_id"], "starts_at": slot,
                                "notes": "pytest reminder"}, timeout=30)
        assert r.status_code == 201, r.text
        bid = r.json()["id"]

        r = requests.post(f"{BASE}/studio/booking/requests/{bid}/decision",
                          json={"action": "confirm"}, headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200, r.text

        r = requests.post(f"{BASE}/studio/booking/run-reminders", headers=_h(coach_tok), timeout=30)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["checked"] >= 1
        assert result["chat_sent"] >= 1
        assert result["email_sent"] >= 1

        rows = requests.get(f"{BASE}/studio/booking/requests", headers=_h(coach_tok), timeout=30).json()
        row = next(b for b in rows if b["id"] == bid)
        assert row["reminded"] is True

        # Re-running the sweep must not error on an already-reminded booking.
        again = requests.post(f"{BASE}/studio/booking/run-reminders", headers=_h(coach_tok), timeout=30)
        assert again.status_code == 200
        assert again.json()["checked"] >= 0

    def test_reminder_sweep_is_coach_only(self, client_tok):
        r = requests.post(f"{BASE}/studio/booking/run-reminders", headers=_h(client_tok), timeout=20)
        assert r.status_code == 403
