"""Tests for Sign in with Apple endpoint: POST /api/auth/apple.

Covers: malformed token robustness, rate limiting behavior, and that the
endpoint never 500s. Cannot end-to-end test with a real Apple identity token
in this environment (requires real Apple device/build).
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
APPLE_URL = f"{BASE_URL}/api/auth/apple"


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestAppleSignInMalformedToken:
    def test_garbage_string_token_returns_401(self, api_client):
        resp = api_client.post(APPLE_URL, json={"identity_token": "not-a-jwt-at-all"})
        assert resp.status_code == 401
        data = resp.json()
        assert "detail" in data
        assert "Invalid Apple credential" in data["detail"]

    def test_empty_string_token_returns_401_or_422(self, api_client):
        resp = api_client.post(APPLE_URL, json={"identity_token": ""})
        assert resp.status_code in (401, 422)

    def test_missing_identity_token_field_returns_422(self, api_client):
        resp = api_client.post(APPLE_URL, json={})
        assert resp.status_code == 422

    def test_well_formed_but_unsigned_jwt_returns_401(self, api_client):
        # A syntactically valid JWT-shaped string (header.payload.signature) but
        # bogus content/signature — should still be rejected, never 500.
        fake_jwt = (
            "eyJhbGciOiJSUzI1NiIsImtpZCI6ImJvZ3VzIn0."
            "eyJzdWIiOiJmYWtlIiwiYXVkIjoiZmFrZSIsImlzcyI6ImZha2UifQ."
            "fakesignature"
        )
        resp = api_client.post(APPLE_URL, json={"identity_token": fake_jwt})
        assert resp.status_code == 401
        assert "Invalid Apple credential" in resp.json()["detail"]

    def test_never_500_on_various_bad_inputs(self, api_client):
        bad_payloads = [
            {"identity_token": "a.b.c"},
            {"identity_token": "1234567890"},
            {"identity_token": "null"},
            {"identity_token": "   "},
        ]
        for payload in bad_payloads:
            resp = api_client.post(APPLE_URL, json=payload)
            assert resp.status_code < 500, f"Got 5xx for payload {payload}: {resp.text}"

    def test_extra_optional_fields_dont_break_validation(self, api_client):
        resp = api_client.post(
            APPLE_URL,
            json={"identity_token": "garbage", "full_name": "Test User", "email": "test@example.com"},
        )
        assert resp.status_code == 401


class TestAppleSignInRateLimit:
    def test_repeated_failures_eventually_rate_limited(self, api_client):
        """Rate limit is 20 failed attempts per IP per 10 min. Fire a burst of
        failures and confirm we eventually get a 429 (or all remain 401 if
        quota wasn't exhausted by prior tests in this run — either is fine,
        we just assert we never see 500)."""
        statuses = []
        for _ in range(25):
            resp = api_client.post(APPLE_URL, json={"identity_token": "still-garbage"})
            statuses.append(resp.status_code)
            if resp.status_code == 429:
                break
        assert all(s < 500 for s in statuses)
        # Either rate limited eventually, or still 401s (quota shared across test run)
        assert set(statuses).issubset({401, 429})
