"""Security hardening pass tests (post security_audit_agent review).
Covers:
  FIX 1 (SEC-001): coach-email self-join now requires coach approval (connection_requests flow);
                   invite-code join remains instant.
  FIX 2 (SEC-002): exercise-guide LLM generation rate-limited (cached lookups excluded).
  FIX 3: CORS allow_credentials=False sanity (app still works end-to-end).
  FIX 4: login/forgot-password/reset-password rate limiting.
  FIX 5: public certificate endpoints rate limiting.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL", os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")
).rstrip("/")
API = f"{BASE_URL}/api"

COACH_EMAIL = "jcgfit@gmail.com"
COACH_PASSWORD = "Coach1234!"


def _unique_email(prefix="TEST_secfix"):
    # server lowercases all emails on register/login, so generate lowercase to match
    return f"{prefix}_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@test.com".lower()


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def coach_token(s):
    r = s.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"coach login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture()
def new_client(s):
    """Fresh throwaway client registration for connection-request tests."""
    email = _unique_email()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Sec Test Client"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    rr = s.post(f"{API}/me/role", headers=_auth(token), json={"role": "client"})
    assert rr.status_code == 200, rr.text
    return {"email": email, "token": token}


class TestFix1ConnectionRequestFlow:
    """SEC-001: coach-email join requires approval; invite-code join is instant."""

    def test_coach_email_join_creates_pending_not_instant(self, s, new_client):
        r = s.post(
            f"{API}/invites/accept",
            headers=_auth(new_client["token"]),
            json={"coach_email": COACH_EMAIL},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending"
        assert data["coach"]["email"] == COACH_EMAIL

    def test_client_coach_endpoint_shows_pending_not_connected(self, s, new_client):
        s.post(f"{API}/invites/accept", headers=_auth(new_client["token"]), json={"coach_email": COACH_EMAIL})
        r = s.get(f"{API}/coach", headers=_auth(new_client["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["coach"] is None
        assert data["pending"] is not None
        assert data["pending"]["email"] == COACH_EMAIL

    def test_client_not_in_coach_clients_list_until_approved(self, s, new_client, coach_token):
        s.post(f"{API}/invites/accept", headers=_auth(new_client["token"]), json={"coach_email": COACH_EMAIL})
        r = s.get(f"{API}/coach/clients", headers=_auth(coach_token))
        assert r.status_code == 200
        emails = [c["email"] for c in r.json()]
        assert new_client["email"] not in emails

    def test_pending_request_appears_in_coach_connection_requests(self, s, new_client, coach_token):
        s.post(f"{API}/invites/accept", headers=_auth(new_client["token"]), json={"coach_email": COACH_EMAIL})
        r = s.get(f"{API}/coach/connection-requests", headers=_auth(coach_token))
        assert r.status_code == 200
        reqs = r.json()
        matching = [req for req in reqs if req["client_email"] == new_client["email"]]
        assert len(matching) == 1
        assert matching[0]["status"] == "pending"

    def test_approve_connects_client_and_appears_in_clients_list(self, s, new_client, coach_token):
        s.post(f"{API}/invites/accept", headers=_auth(new_client["token"]), json={"coach_email": COACH_EMAIL})
        r = s.get(f"{API}/coach/connection-requests", headers=_auth(coach_token))
        req_id = [req for req in r.json() if req["client_email"] == new_client["email"]][0]["id"]

        ar = s.post(f"{API}/coach/connection-requests/{req_id}/approve", headers=_auth(coach_token))
        assert ar.status_code == 200, ar.text

        # Client now shows in coach's clients list
        cl = s.get(f"{API}/coach/clients", headers=_auth(coach_token))
        emails = [c["email"] for c in cl.json()]
        assert new_client["email"] in emails

        # GET /api/coach for that client returns the real coach now
        my_coach = s.get(f"{API}/coach", headers=_auth(new_client["token"]))
        assert my_coach.status_code == 200
        data = my_coach.json()
        assert data["coach"] is not None
        assert data["coach"]["email"] == COACH_EMAIL
        assert data["pending"] is None

    def test_deny_keeps_client_disconnected(self, s, new_client, coach_token):
        s.post(f"{API}/invites/accept", headers=_auth(new_client["token"]), json={"coach_email": COACH_EMAIL})
        r = s.get(f"{API}/coach/connection-requests", headers=_auth(coach_token))
        req_id = [req for req in r.json() if req["client_email"] == new_client["email"]][0]["id"]

        dr = s.post(f"{API}/coach/connection-requests/{req_id}/deny", headers=_auth(coach_token))
        assert dr.status_code == 200, dr.text

        my_coach = s.get(f"{API}/coach", headers=_auth(new_client["token"]))
        data = my_coach.json()
        assert data["coach"] is None

        cl = s.get(f"{API}/coach/clients", headers=_auth(coach_token))
        emails = [c["email"] for c in cl.json()]
        assert new_client["email"] not in emails

    def test_invite_code_join_still_instant(self, s, new_client, coach_token):
        """Invite code = coach-issued authorization -> connects immediately, no approval."""
        inv = s.post(f"{API}/invites", headers=_auth(coach_token))
        assert inv.status_code in (200, 201), inv.text
        code = inv.json()["code"]

        r = s.post(f"{API}/invites/accept", headers=_auth(new_client["token"]), json={"code": code})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "connected"

        my_coach = s.get(f"{API}/coach", headers=_auth(new_client["token"]))
        assert my_coach.json()["coach"]["email"] == COACH_EMAIL

        cl = s.get(f"{API}/coach/clients", headers=_auth(coach_token))
        emails = [c["email"] for c in cl.json()]
        assert new_client["email"] in emails


class TestFix2ExerciseGuideRateLimit:
    """SEC-002: only fresh LLM generations count toward 40/day; cached lookups don't."""

    def test_cached_lookup_not_rate_limited_repeated_calls(self, s, coach_token):
        # "squat" is a very common exercise name likely already cached from prior test runs;
        # call it repeatedly - should never 429 regardless of count since these are cache hits.
        r = s.get(f"{API}/exercise-guide", params={"name": "squat"}, headers=_auth(coach_token))
        assert r.status_code == 200, r.text
        first = r.json()
        for _ in range(5):
            rr = s.get(f"{API}/exercise-guide", params={"name": "squat"}, headers=_auth(coach_token))
            assert rr.status_code == 200
            assert rr.json()["cached"] is True

    def test_new_unique_exercise_generates_and_caches(self, s, coach_token):
        unique_name = f"test move {uuid.uuid4().hex[:8]}"
        r = s.get(f"{API}/exercise-guide", params={"name": unique_name}, headers=_auth(coach_token))
        assert r.status_code in (200, 429, 502, 503), r.text
        if r.status_code == 200:
            assert r.json()["cached"] is False
            # second call for same name should now be cached
            rr = s.get(f"{API}/exercise-guide", params={"name": unique_name}, headers=_auth(coach_token))
            assert rr.status_code == 200
            assert rr.json()["cached"] is True


class TestFix3CORS:
    def test_cors_headers_allow_origin_star_no_credentials(self, s):
        r = s.options(
            f"{API}/auth/login",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        # Preflight should succeed and allow_credentials should not be present/true
        acac = r.headers.get("access-control-allow-credentials")
        assert acac is None or acac.lower() == "false"

    def test_normal_login_works_end_to_end(self, s):
        r = s.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()


class TestFix4LoginRateLimit:
    def test_repeated_correct_login_never_rate_limited(self, s):
        for _ in range(8):
            r = s.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASSWORD})
            assert r.status_code == 200

    def test_repeated_wrong_password_eventually_429(self, s):
        email = _unique_email("TEST_bruteforce")
        # register a throwaway account so we don't disturb real accounts' rate limit windows
        reg = s.post(f"{API}/auth/register", json={"email": email, "password": "RealPass123!", "name": "BF Test"})
        assert reg.status_code == 201

        statuses = []
        for _ in range(17):
            r = s.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass123!"})
            statuses.append(r.status_code)
        assert 401 in statuses
        assert 429 in statuses, f"Expected a 429 among {statuses} after 17 wrong attempts"


class TestFix4ForgotResetRateLimit:
    def test_forgot_password_rate_limited_after_3_per_email(self, s):
        email = _unique_email("TEST_forgot")
        s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Forgot Test"})
        statuses = []
        for _ in range(5):
            r = s.post(f"{API}/auth/forgot-password", json={"email": email})
            statuses.append(r.status_code)
        assert 429 in statuses, f"Expected 429 among {statuses} after 5 forgot-password calls for same email"


class TestFix5CertificateRateLimit:
    def test_normal_certificate_lookup_works(self, s):
        r = s.get(f"{API}/certificates/TESTPDF1")
        # Should work fine (200) or 404 if that seed doesn't exist anymore - either way, not 429/500
        assert r.status_code in (200, 404), r.text

    def test_certificate_pdf_lookup_works(self, s):
        r = s.get(f"{API}/certificates/TESTPDF1/pdf")
        assert r.status_code in (200, 404), r.text
