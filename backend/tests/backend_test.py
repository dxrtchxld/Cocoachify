"""Co-Coachify Phase 1 backend API tests.
Covers: auth, role, onboarding, sessions & programs CRUD, invites (code + coach email),
coach clients/assign/activity/stats (with authz), client dashboard + workout log advance,
progress summary, Stripe checkout creation (no real payment)."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://gemini-mobile-app-12.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


# ---------------------------- shared helpers ----------------------------


def _unique_email(prefix="TEST_e2e"):
    return f"{prefix}_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@test.com"


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def coach(s):
    """Fresh coach: register -> set role coach."""
    email = _unique_email("TEST_coach")
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Test Coach"})
    assert r.status_code == 201, r.text
    data = r.json()
    token = data["access_token"]
    rr = s.post(f"{API}/me/role", headers=_auth(token), json={"role": "coach"})
    assert rr.status_code == 200, rr.text
    return {"email": email, "token": token, "user": rr.json()}


@pytest.fixture(scope="session")
def client_user(s):
    """Fresh client: register -> set role client -> complete onboarding."""
    email = _unique_email("TEST_client")
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Test Client"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    rr = s.post(f"{API}/me/role", headers=_auth(token), json={"role": "client"})
    assert rr.status_code == 200
    ob = s.put(
        f"{API}/me/onboarding",
        headers=_auth(token),
        json={
            "goal": "build_strength",
            "experience": "some_experience",
            "days_per_week": 4,
            "focus": "upper_body",
            "notes": "TEST notes",
        },
    )
    assert ob.status_code == 200, ob.text
    return {"email": email, "token": token, "user": ob.json()}


@pytest.fixture(scope="session")
def coach_program(s, coach):
    """Coach creates one session and one 7-day program with session on day 1."""
    session_body = {
        "name": "TEST_ Rowing Push",
        "session_type": "workout",
        "target_minutes": 45,
        "warmup_notes": "warmup",
        "finisher_notes": "cooldown",
        "coach_notes": "Push hard",
        "exercises": [
            {
                "name": "Bench Press",
                "block_label": "A. Strength",
                "sets": 4,
                "reps": "5",
                "rest_seconds": 120,
                "form_note": "Squeeze scapula",
                "purpose_note": "Chest strength",
            }
        ],
    }
    r = s.post(f"{API}/sessions", headers=_auth(coach["token"]), json=session_body)
    assert r.status_code == 201, r.text
    session = r.json()

    program_body = {
        "name": "TEST_ 7day Program",
        "description": "test",
        "category": "fitness",
        "difficulty": "beginner",
        "total_days": 7,
        "days_per_week": 3,
        "schedule": [session["id"], None, None, None, None, None, None],
    }
    p = s.post(f"{API}/programs", headers=_auth(coach["token"]), json=program_body)
    assert p.status_code == 201, p.text
    return {"session": session, "program": p.json()}


# ---------------------------- module: auth ----------------------------


class TestAuth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("message") == "Co-Coachify API"

    def test_register_and_login(self, s):
        email = _unique_email("TEST_authbasic")
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "X"})
        assert r.status_code == 201
        j = r.json()
        assert j["access_token"] and j["user"]["email"] == email.lower()
        assert j["user"]["role"] is None
        assert j["user"]["onboarding_completed"] is False

        # duplicate
        dup = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert dup.status_code == 409

        # login
        li = s.post(f"{API}/auth/login", json={"email": email, "password": "Pass1234!"})
        assert li.status_code == 200
        assert li.json()["user"]["user_id"] == j["user"]["user_id"]

        # wrong pwd
        wp = s.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass1!"})
        assert wp.status_code == 401

    def test_me_endpoint(self, s, coach):
        r = s.get(f"{API}/auth/me", headers=_auth(coach["token"]))
        assert r.status_code == 200
        me = r.json()
        assert me["role"] == "coach"
        assert me["is_coach"] is True

    def test_me_no_auth(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_session_invalid(self, s):
        r = s.post(f"{API}/auth/session", json={"session_id": "not-a-real-session"})
        assert r.status_code == 401


# ---------------------------- module: role + onboarding ----------------------------


class TestRoleAndOnboarding:
    def test_role_and_onboarding_set(self, s, client_user):
        assert client_user["user"]["role"] == "client"
        assert client_user["user"]["onboarding_completed"] is True

    def test_onboarding_validation(self, s, client_user):
        # bad goal
        r = s.put(
            f"{API}/me/onboarding",
            headers=_auth(client_user["token"]),
            json={"goal": "get_ripped", "experience": "just_starting", "days_per_week": 3},
        )
        assert r.status_code == 422
        # bad days_per_week
        r2 = s.put(
            f"{API}/me/onboarding",
            headers=_auth(client_user["token"]),
            json={"goal": "cardio", "experience": "just_starting", "days_per_week": 0},
        )
        assert r2.status_code == 422

    def test_role_validation(self, s, coach):
        r = s.post(f"{API}/me/role", headers=_auth(coach["token"]), json={"role": "admin"})
        assert r.status_code == 422


# ---------------------------- module: sessions ----------------------------


class TestSessions:
    def test_create_and_get_session(self, s, coach, coach_program):
        sid = coach_program["session"]["id"]
        r = s.get(f"{API}/sessions/{sid}", headers=_auth(coach["token"]))
        assert r.status_code == 200
        ses = r.json()
        assert ses["name"] == "TEST_ Rowing Push"
        assert ses["exercises"][0]["block_label"] == "A. Strength"
        assert ses["exercises"][0]["form_note"] == "Squeeze scapula"
        assert ses["exercises"][0]["purpose_note"] == "Chest strength"

    def test_list_sessions_owner_only(self, s, coach, coach_program):
        r = s.get(f"{API}/sessions", headers=_auth(coach["token"]))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert coach_program["session"]["id"] in ids

    def test_session_create_requires_coach(self, s, client_user):
        r = s.post(
            f"{API}/sessions",
            headers=_auth(client_user["token"]),
            json={"name": "TEST_ nope"},
        )
        assert r.status_code == 403


# ---------------------------- module: programs ----------------------------


class TestPrograms:
    def test_program_created_with_schedule(self, s, coach, coach_program):
        p = coach_program["program"]
        assert p["total_days"] == 7
        assert p["category"] == "fitness"

    def test_get_program_expands_schedule(self, s, coach, coach_program):
        r = s.get(f"{API}/programs/{coach_program['program']['id']}", headers=_auth(coach["token"]))
        assert r.status_code == 200
        prog = r.json()
        assert len(prog["schedule"]) == 7
        assert prog["schedule"][0]["session_id"] == coach_program["session"]["id"]
        assert prog["schedule"][1]["session_id"] is None
        assert prog["schedule"][1]["session_name"] == "Rest Day"

    def test_bad_category(self, s, coach):
        r = s.post(
            f"{API}/programs",
            headers=_auth(coach["token"]),
            json={"name": "bad", "category": "party", "total_days": 7},
        )
        assert r.status_code == 400

    def test_bad_total_days(self, s, coach):
        r = s.post(
            f"{API}/programs",
            headers=_auth(coach["token"]),
            json={"name": "bad", "category": "fitness", "total_days": 10},
        )
        assert r.status_code == 400

    def test_schedule_length_mismatch(self, s, coach):
        r = s.post(
            f"{API}/programs",
            headers=_auth(coach["token"]),
            json={
                "name": "bad",
                "category": "fitness",
                "total_days": 7,
                "schedule": [None, None],
            },
        )
        assert r.status_code == 400

    def test_program_create_requires_coach(self, s, client_user):
        r = s.post(
            f"{API}/programs",
            headers=_auth(client_user["token"]),
            json={"name": "nope", "category": "fitness", "total_days": 7},
        )
        assert r.status_code == 403

    def test_update_program_resize(self, s, coach, coach_program):
        pid = coach_program["program"]["id"]
        # Resize from 7 -> 14 days without supplying schedule
        r = s.put(
            f"{API}/programs/{pid}",
            headers=_auth(coach["token"]),
            json={
                "name": "TEST_ 14day Program",
                "description": "resized",
                "category": "fitness",
                "difficulty": "beginner",
                "total_days": 14,
                "days_per_week": 3,
            },
        )
        assert r.status_code == 200, r.text
        prog = r.json()
        assert prog["total_days"] == 14
        assert len(prog["schedule"]) == 14
        # First day preserved
        assert prog["schedule"][0]["session_id"] == coach_program["session"]["id"]
        # New tail is rest
        assert prog["schedule"][13]["session_id"] is None
        # Resize back to 7 for downstream tests
        s.put(
            f"{API}/programs/{pid}",
            headers=_auth(coach["token"]),
            json={
                "name": "TEST_ 7day Program",
                "category": "fitness",
                "difficulty": "beginner",
                "total_days": 7,
                "days_per_week": 3,
                "schedule": [coach_program["session"]["id"], None, None, None, None, None, None],
            },
        )


# ---------------------------- module: invites ----------------------------


class TestInvites:
    def test_client_cannot_create_invite(self, s, client_user):
        r = s.post(f"{API}/invites", headers=_auth(client_user["token"]))
        assert r.status_code == 403

    def test_coach_invite_idempotent(self, s, coach):
        r1 = s.post(f"{API}/invites", headers=_auth(coach["token"]))
        assert r1.status_code in (200, 201)
        code = r1.json()["code"]
        assert 4 <= len(code) <= 12
        r2 = s.post(f"{API}/invites", headers=_auth(coach["token"]))
        assert r2.json()["code"] == code

    def test_accept_by_code_and_by_email(self, s, coach):
        # Create two fresh clients
        e1 = _unique_email("TEST_c_bycode")
        t1 = s.post(f"{API}/auth/register", json={"email": e1, "password": "Test1234!"}).json()["access_token"]
        s.post(f"{API}/me/role", headers=_auth(t1), json={"role": "client"})

        e2 = _unique_email("TEST_c_byemail")
        t2 = s.post(f"{API}/auth/register", json={"email": e2, "password": "Test1234!"}).json()["access_token"]
        s.post(f"{API}/me/role", headers=_auth(t2), json={"role": "client"})

        # get code
        code = s.post(f"{API}/invites", headers=_auth(coach["token"])).json()["code"]

        # by code
        r1 = s.post(f"{API}/invites/accept", headers=_auth(t1), json={"code": code})
        assert r1.status_code == 200, r1.text
        assert r1.json()["coach"]["user_id"] == coach["user"]["user_id"]

        # by email
        r2 = s.post(
            f"{API}/invites/accept", headers=_auth(t2), json={"coach_email": coach["email"]}
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["coach"]["user_id"] == coach["user"]["user_id"]

        # Invalid code
        r3 = s.post(f"{API}/invites/accept", headers=_auth(t1), json={"code": "NOPE99"})
        assert r3.status_code == 404

        # Unknown coach email
        r4 = s.post(
            f"{API}/invites/accept",
            headers=_auth(t1),
            json={"coach_email": "nonexistent@example.com"},
        )
        assert r4.status_code == 404

        # neither provided
        r5 = s.post(f"{API}/invites/accept", headers=_auth(t1), json={})
        assert r5.status_code == 400

    def test_cannot_connect_to_self(self, s, coach):
        # Coach tries to accept own email -> should 400 (self connect)
        r = s.post(
            f"{API}/invites/accept",
            headers=_auth(coach["token"]),
            json={"coach_email": coach["email"]},
        )
        assert r.status_code == 400


# ---------------------------- module: coach client management ----------------------------


@pytest.fixture(scope="session")
def connected_client(s, coach, coach_program):
    """A brand new client connected to `coach` and assigned `coach_program`."""
    email = _unique_email("TEST_connclient")
    reg = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Conn Client"})
    token = reg.json()["access_token"]
    user_id = reg.json()["user"]["user_id"]
    s.post(f"{API}/me/role", headers=_auth(token), json={"role": "client"})
    s.put(
        f"{API}/me/onboarding",
        headers=_auth(token),
        json={"goal": "cardio", "experience": "just_starting", "days_per_week": 3},
    )
    # accept invite
    code = s.post(f"{API}/invites", headers=_auth(coach["token"])).json()["code"]
    s.post(f"{API}/invites/accept", headers=_auth(token), json={"code": code})
    # coach assigns program
    assign = s.post(
        f"{API}/coach/assign",
        headers=_auth(coach["token"]),
        json={"client_id": user_id, "program_id": coach_program["program"]["id"]},
    )
    assert assign.status_code == 200, assign.text
    return {"email": email, "token": token, "user_id": user_id}


class TestCoachEndpoints:
    def test_authz_client_cannot_use_coach_routes(self, s, client_user):
        for path in ["/coach/clients", "/coach/activity", "/coach/stats"]:
            r = s.get(f"{API}{path}", headers=_auth(client_user["token"]))
            assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"

    def test_list_clients_and_status(self, s, coach, connected_client):
        r = s.get(f"{API}/coach/clients", headers=_auth(coach["token"]))
        assert r.status_code == 200
        clients = r.json()
        ids = [c["user_id"] for c in clients]
        assert connected_client["user_id"] in ids
        me = next(c for c in clients if c["user_id"] == connected_client["user_id"])
        assert me["program_name"] == "TEST_ 7day Program"
        assert me["current_day"] == 1
        assert me["status"] == "on_track"

    def test_client_detail(self, s, coach, connected_client):
        r = s.get(f"{API}/coach/clients/{connected_client['user_id']}", headers=_auth(coach["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == connected_client["email"].lower()
        assert isinstance(d.get("logs"), list)

    def test_client_detail_wrong_client_404(self, s, coach):
        r = s.get(f"{API}/coach/clients/user_notreal", headers=_auth(coach["token"]))
        assert r.status_code == 404

    def test_coach_stats_and_activity(self, s, coach, connected_client):
        r1 = s.get(f"{API}/coach/stats", headers=_auth(coach["token"]))
        assert r1.status_code == 200
        st = r1.json()
        assert st["clients"] >= 1
        assert st["programs"] >= 1
        assert 0 <= st["active_pct"] <= 100

        r2 = s.get(f"{API}/coach/activity", headers=_auth(coach["token"]))
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)

    def test_assign_unknown_client_404(self, s, coach, coach_program):
        r = s.post(
            f"{API}/coach/assign",
            headers=_auth(coach["token"]),
            json={"client_id": "user_deadbeef", "program_id": coach_program["program"]["id"]},
        )
        assert r.status_code == 404

    def test_assign_requires_coach_role(self, s, client_user, coach_program):
        r = s.post(
            f"{API}/coach/assign",
            headers=_auth(client_user["token"]),
            json={"client_id": "irrelevant", "program_id": coach_program["program"]["id"]},
        )
        assert r.status_code == 403


# ---------------------------- module: dashboard + logs (client) ----------------------------


class TestClientDashboardAndLogs:
    def test_dashboard_shows_today_session(self, s, connected_client, coach_program):
        r = s.get(f"{API}/dashboard", headers=_auth(connected_client["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["program"]["id"] == coach_program["program"]["id"]
        assert d["today_session"]["session_id"] == coach_program["session"]["id"]
        assert d["today_session"]["day"] == 1
        assert d["streak"] == 0
        assert d["logged_today"] is False

    def test_workout_log_advances_day(self, s, connected_client, coach_program):
        r = s.post(
            f"{API}/logs",
            headers=_auth(connected_client["token"]),
            json={
                "log_type": "workout",
                "session_id": coach_program["session"]["id"],
                "program_id": coach_program["program"]["id"],
                "duration_minutes": 40,
                "rpe": 7,
                "notes": "great",
            },
        )
        assert r.status_code == 201, r.text
        # Dashboard now on day 2 which is Rest Day
        d = s.get(f"{API}/dashboard", headers=_auth(connected_client["token"])).json()
        assert d["program"]["current_day"] == 2
        assert d["today_session"]["session_type"] == "rest"
        assert d["today_session"]["session_id"] is None
        assert d["logged_today"] is True
        assert d["streak"] >= 1

    def test_body_log_and_progress(self, s, connected_client):
        r = s.post(
            f"{API}/logs",
            headers=_auth(connected_client["token"]),
            json={"log_type": "body", "weight": 82.4},
        )
        assert r.status_code == 201
        # body log without weight
        r2 = s.post(
            f"{API}/logs", headers=_auth(connected_client["token"]), json={"log_type": "body"}
        )
        assert r2.status_code == 400
        # workout log without session_id
        r3 = s.post(
            f"{API}/logs",
            headers=_auth(connected_client["token"]),
            json={"log_type": "workout", "duration_minutes": 20, "rpe": 5},
        )
        assert r3.status_code == 400

        p = s.get(f"{API}/progress/summary", headers=_auth(connected_client["token"]))
        assert p.status_code == 200
        j = p.json()
        assert any(pt["value"] == 82.4 for pt in j["weight_series"])
        assert j["totals"]["total_workouts"] >= 1


# ---------------------------- module: checkout ----------------------------


class TestCheckout:
    def test_create_subscription_checkout(self, s, client_user):
        origin = "https://gemini-mobile-app-12.preview.emergentagent.com"
        r = s.post(
            f"{API}/checkout/session",
            headers=_auth(client_user["token"]),
            json={"purchase_type": "subscription", "origin_url": origin},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["checkout_url"].startswith("http")
        assert j["session_id"]

    def test_checkout_no_auth(self, s):
        r = s.post(
            f"{API}/checkout/session",
            json={"purchase_type": "subscription", "origin_url": "https://example.com"},
        )
        assert r.status_code == 401
