"""Push notifications (Emergent-managed, SuprSend relay) — new feature tests.

Covers:
- POST /api/register-push: endpoint exists, validates input, never crashes server
- send_push() wired into chat/booking flows — those flows must succeed (or fail for
  their OWN business reasons) regardless of push relay outcome (placeholder key in
  this dev pod). Push failures must be silently logged/swallowed, never surfaced.
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"

COACH_EMAIL = "jcgfit@gmail.com"
COACH_PASSWORD = "Coach1234!"
CLIENT_EMAIL = "ilovejeremygillespie@gmail.com"
CLIENT_PASSWORD = "Client1234!"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def coach_token(api_client):
    resp = api_client.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Coach login failed: {resp.status_code} {resp.text}")
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def client_token(api_client):
    resp = api_client.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Client login failed: {resp.status_code} {resp.text}")
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def coach_user_id(api_client, coach_token):
    resp = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {coach_token}"})
    assert resp.status_code == 200
    return resp.json()["user_id"]


@pytest.fixture(scope="module")
def client_user_id(api_client, client_token):
    resp = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {client_token}"})
    assert resp.status_code == 200
    return resp.json()["user_id"]


class TestRegisterPushEndpoint:
    """POST /api/register-push — endpoint existence + input validation."""

    def test_register_push_valid_body_does_not_crash(self, api_client, coach_user_id):
        resp = api_client.post(f"{API}/register-push", json={
            "user_id": coach_user_id,
            "platform": "android",
            "device_token": "TEST_dummy_device_token_123",
        })
        # With a placeholder EMERGENT_PUSH_KEY the relay itself will fail (401 from
        # gateway -> mapped to 500 by routes_push.py), but the SERVER must not crash
        # (no raw 502 Bad Gateway / connection reset) and must return valid JSON on error.
        assert resp.status_code in (201, 500, 502), f"Unexpected status: {resp.status_code} {resp.text}"
        body = resp.json()
        if resp.status_code == 201:
            assert body.get("status") == "registered"
        else:
            assert "detail" in body

    def test_register_push_missing_fields_returns_422(self, api_client):
        resp = api_client.post(f"{API}/register-push", json={"user_id": "abc"})
        assert resp.status_code == 422

    def test_register_push_invalid_types_returns_422(self, api_client):
        resp = api_client.post(f"{API}/register-push", json={
            "user_id": 123, "platform": True, "device_token": None,
        })
        assert resp.status_code == 422

    def test_register_push_empty_body_returns_422(self, api_client):
        resp = api_client.post(f"{API}/register-push", json={})
        assert resp.status_code == 422


class TestPushDoesNotBreakChat:
    """Chat send_message wires send_push() — must never break chat regardless of push outcome."""

    def test_send_message_succeeds_despite_push_relay_failure(self, api_client, client_token, coach_user_id):
        resp = api_client.post(
            f"{API}/chat/{coach_user_id}/messages",
            headers={"Authorization": f"Bearer {client_token}"},
            json={"text": "TEST_push_regression message"},
        )
        assert resp.status_code == 201, f"Chat send failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data["text"] == "TEST_push_regression message"
        assert data["sender_id"] is not None

    def test_get_messages_after_send_persisted(self, api_client, client_token, coach_user_id):
        resp = api_client.get(
            f"{API}/chat/{coach_user_id}/messages",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert resp.status_code == 200
        texts = [m["text"] for m in resp.json()["messages"]]
        assert "TEST_push_regression message" in texts


class TestPushDoesNotBreakBooking:
    """Booking create/decide/reminder-sweep wire send_push() — must never break booking flows."""

    def _current_slug(self, api_client, coach_token):
        resp = api_client.get(f"{API}/studio/booking/settings", headers={"Authorization": f"Bearer {coach_token}"})
        assert resp.status_code == 200
        return resp.json().get("slug")

    def test_create_booking_succeeds_despite_push_relay_failure(self, api_client, coach_token):
        # discover the coach's *current* live slug (test_credentials.md's "jcg-test" was
        # overwritten to "pytest-booking" by an earlier phase7 booking test run — a
        # pre-existing test-order artifact, not caused by the push feature) + a free slot
        from datetime import date, timedelta

        slug = self._current_slug(api_client, coach_token)
        if not slug:
            pytest.skip("Coach has no booking slug configured")
        page = api_client.get(f"{API}/public/book/{slug}")
        if page.status_code != 200:
            pytest.skip(f"Booking page {slug} not available: {page.status_code}")
        session_type_id = page.json()["session_types"][0]["id"] if page.json().get("session_types") else None

        slot = None
        for offset in range(1, 15):
            day = (date.today() + timedelta(days=offset)).isoformat()
            slots_resp = api_client.get(
                f"{API}/public/book/{slug}/slots",
                params={"date": day, "session_type_id": session_type_id} if session_type_id else {"date": day},
            )
            if slots_resp.status_code == 200 and slots_resp.json().get("slots"):
                slot = slots_resp.json()["slots"][0]
                break
        if not slot:
            pytest.skip("No free slots found in the next 14 days to test booking creation")

        resp = api_client.post(
            f"{API}/public/book/{slug}",
            json={
                "starts_at": slot,
                "session_type_id": session_type_id,
                "name": "TEST Push Regression",
                "email": "test_push_regression@example.com",
                "notes": "created by test_push_notifications.py",
            },
        )
        assert resp.status_code == 201, f"Booking creation failed: {resp.status_code} {resp.text}"
        body = resp.json()
        assert body["status"] == "pending"
        assert body["name"] == "TEST Push Regression"

    def test_run_reminder_sweep_returns_normally(self, api_client, coach_token):
        resp = api_client.post(
            f"{API}/studio/booking/run-reminders",
            headers={"Authorization": f"Bearer {coach_token}"},
        )
        assert resp.status_code == 200, f"Reminder sweep failed: {resp.status_code} {resp.text}"
        body = resp.json()
        assert "checked" in body and "chat_sent" in body and "email_sent" in body
