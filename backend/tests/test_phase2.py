"""Co-Coachify PHASE 2 backend tests: chat, coach inbox (New/Urgent/Watch),
daily habits (water + affirmation), coach specialty update (dynamic vocab),
AI program import (image + graceful error), regression smoke on auth/dashboard."""
import base64
import io
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


# --------------------------- helpers ---------------------------


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _unique_email(prefix="TEST_p2"):
    return f"{prefix}_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@test.com"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# --------------------------- fixtures: connected coach/client pair ---------------------------


@pytest.fixture(scope="module")
def coach(s):
    email = _unique_email("TEST_p2_coach")
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "P2 Coach"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    r2 = s.post(f"{API}/me/role", headers=_auth(token), json={"role": "coach", "specialty": "fitness"})
    assert r2.status_code == 200, r2.text
    return {"email": email, "token": token, "user": r2.json()}


@pytest.fixture(scope="module")
def client_user(s, coach):
    email = _unique_email("TEST_p2_client")
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "P2 Client"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    user_id = r.json()["user"]["user_id"]
    s.post(f"{API}/me/role", headers=_auth(token), json={"role": "client"})
    s.put(f"{API}/me/onboarding", headers=_auth(token),
          json={"goal": "build_strength", "experience": "some_experience", "days_per_week": 3})
    # accept invite
    code = s.post(f"{API}/invites", headers=_auth(coach["token"])).json()["code"]
    a = s.post(f"{API}/invites/accept", headers=_auth(token), json={"code": code})
    assert a.status_code == 200, a.text
    return {"email": email, "token": token, "user_id": user_id}


@pytest.fixture(scope="module")
def demo_coach_token(s):
    """Login as the demo coach account created by main agent."""
    r = s.post(f"{API}/auth/login", json={"email": "coach.demo@cocoachify.com", "password": "Coach1234!"})
    if r.status_code != 200:
        pytest.skip(f"coach.demo login failed: {r.status_code} {r.text}")
    j = r.json()
    return {"token": j["access_token"], "user": j["user"]}


@pytest.fixture(scope="module")
def demo_client_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "client.demo@cocoachify.com", "password": "Client1234!"})
    if r.status_code != 200:
        pytest.skip(f"client.demo login failed: {r.status_code} {r.text}")
    j = r.json()
    return {"token": j["access_token"], "user": j["user"]}


# =========================== module: regression smoke ===========================


class TestRegressionSmoke:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["message"] == "Co-Coachify API"

    def test_demo_coach_login_and_me(self, s, demo_coach_token):
        me = s.get(f"{API}/auth/me", headers=_auth(demo_coach_token["token"]))
        assert me.status_code == 200
        d = me.json()
        assert d["role"] == "coach"
        assert d["is_coach"] is True

    def test_demo_client_login_and_dashboard(self, s, demo_client_token):
        d = s.get(f"{API}/dashboard", headers=_auth(demo_client_token["token"]))
        assert d.status_code == 200
        j = d.json()
        assert "streak" in j and "week" in j
        # user.role should be client
        assert j["user"]["role"] == "client"

    def test_demo_coach_clients(self, s, demo_coach_token):
        r = s.get(f"{API}/coach/clients", headers=_auth(demo_coach_token["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# =========================== module: chat ===========================


class TestChat:
    def test_send_and_fetch_messages(self, s, coach, client_user):
        # client -> coach
        r1 = s.post(
            f"{API}/chat/{coach['user']['user_id']}/messages",
            headers=_auth(client_user["token"]),
            json={"text": "Hi coach, ready for tomorrow?"},
        )
        assert r1.status_code == 201, r1.text
        m1 = r1.json()
        assert m1["sender_id"] == client_user["user_id"]
        assert m1["recipient_id"] == coach["user"]["user_id"]
        assert m1["text"] == "Hi coach, ready for tomorrow?"

        # coach -> client
        r2 = s.post(
            f"{API}/chat/{client_user['user_id']}/messages",
            headers=_auth(coach["token"]),
            json={"text": "Yes! Hit the warmup first."},
        )
        assert r2.status_code == 201, r2.text

        # Coach fetches conversation with client
        r3 = s.get(
            f"{API}/chat/{client_user['user_id']}/messages",
            headers=_auth(coach["token"]),
        )
        assert r3.status_code == 200
        conv = r3.json()
        assert conv["peer"]["user_id"] == client_user["user_id"]
        texts = [m["text"] for m in conv["messages"]]
        assert "Hi coach, ready for tomorrow?" in texts
        assert "Yes! Hit the warmup first." in texts
        # oldest-first
        assert conv["messages"][0]["text"] == "Hi coach, ready for tomorrow?"

    def test_chat_forbidden_between_unrelated_users(self, s, coach):
        # Fresh unrelated user tries to chat with coach
        email = _unique_email("TEST_p2_random")
        reg = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!"})
        rand_tok = reg.json()["access_token"]
        r = s.post(
            f"{API}/chat/{coach['user']['user_id']}/messages",
            headers=_auth(rand_tok),
            json={"text": "hello?"},
        )
        assert r.status_code == 403

    def test_empty_text_rejected(self, s, coach, client_user):
        r = s.post(
            f"{API}/chat/{coach['user']['user_id']}/messages",
            headers=_auth(client_user["token"]),
            json={"text": ""},
        )
        assert r.status_code == 422

    def test_chat_unknown_peer(self, s, coach):
        r = s.get(f"{API}/chat/user_notexist/messages", headers=_auth(coach["token"]))
        assert r.status_code == 404


# =========================== module: coach inbox ===========================


class TestCoachInbox:
    def test_inbox_returns_workout_logs_with_urgency(self, s, coach, client_user):
        # Create a program+session so client can log a workout
        session = s.post(
            f"{API}/sessions",
            headers=_auth(coach["token"]),
            json={"name": "TEST_ Inbox Session", "session_type": "workout", "target_minutes": 40,
                  "exercises": [{"name": "Push-ups"}]},
        ).json()
        program = s.post(
            f"{API}/programs",
            headers=_auth(coach["token"]),
            json={"name": "TEST_ Inbox Program", "category": "fitness", "total_days": 7,
                  "days_per_week": 3,
                  "schedule": [session["id"], None, None, None, None, None, None]},
        ).json()
        # Assign
        s.post(
            f"{API}/coach/assign",
            headers=_auth(coach["token"]),
            json={"client_id": client_user["user_id"], "program_id": program["id"]},
        )
        # Client logs 3 workouts with different RPE / notes to exercise urgency branches
        for payload in [
            {"log_type": "workout", "session_id": session["id"], "program_id": program["id"],
             "duration_minutes": 30, "rpe": 6, "notes": "felt great"},
            {"log_type": "workout", "session_id": session["id"], "program_id": program["id"],
             "duration_minutes": 30, "rpe": 8, "notes": "tough but ok"},
            {"log_type": "workout", "session_id": session["id"], "program_id": program["id"],
             "duration_minutes": 30, "rpe": 9, "notes": "sharp knee pain today"},
        ]:
            r = s.post(f"{API}/logs", headers=_auth(client_user["token"]), json=payload)
            assert r.status_code == 201, r.text

        inbox = s.get(f"{API}/coach/inbox", headers=_auth(coach["token"]))
        assert inbox.status_code == 200
        items = inbox.json()
        assert isinstance(items, list) and len(items) >= 3
        # Verify urgency computation
        by_notes = {i["notes"]: i for i in items if i.get("notes")}
        assert by_notes["sharp knee pain today"]["urgency"] == "urgent"  # rpe 9 + "pain"
        assert by_notes["tough but ok"]["urgency"] == "watch"  # rpe 8
        assert by_notes["felt great"]["urgency"] == "normal"  # rpe 6
        # reviewed flag defaults False
        assert all(i.get("reviewed") is False for i in items[:3])

    def test_inbox_review_toggles_reviewed(self, s, coach, client_user):
        inbox = s.get(f"{API}/coach/inbox", headers=_auth(coach["token"])).json()
        first = inbox[0]
        r = s.post(f"{API}/coach/inbox/{first['id']}/review", headers=_auth(coach["token"]))
        assert r.status_code == 200
        # Confirm reviewed=True after
        inbox2 = s.get(f"{API}/coach/inbox", headers=_auth(coach["token"])).json()
        got = next(i for i in inbox2 if i["id"] == first["id"])
        assert got["reviewed"] is True

    def test_inbox_authz_client_forbidden(self, s, client_user):
        r = s.get(f"{API}/coach/inbox", headers=_auth(client_user["token"]))
        assert r.status_code == 403

    def test_inbox_review_not_your_client(self, s, client_user):
        # A random log_id won't be found -> 404
        r = s.post(f"{API}/coach/inbox/not_a_real_log/review", headers=_auth(client_user["token"]))
        assert r.status_code == 403  # client can't hit coach routes at all


# =========================== module: daily habits ===========================


class TestDailyHabits:
    def test_get_habits_default_zero(self, s, client_user):
        r = s.get(f"{API}/habits/today", headers=_auth(client_user["token"]))
        assert r.status_code == 200
        j = r.json()
        assert j["water_count"] == 0
        assert j["water_goal"] == 8
        assert j["affirmation_done"] is False
        assert isinstance(j["affirmation_text"], str) and len(j["affirmation_text"]) > 5
        assert j["date"]  # yyyy-mm-dd

    def test_update_water_and_affirmation(self, s, client_user):
        r = s.put(
            f"{API}/habits/today",
            headers=_auth(client_user["token"]),
            json={"water_count": 3},
        )
        assert r.status_code == 200
        assert r.json()["water_count"] == 3

        r2 = s.put(
            f"{API}/habits/today",
            headers=_auth(client_user["token"]),
            json={"affirmation_done": True},
        )
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2["affirmation_done"] is True
        # water_count from prior update persists
        assert j2["water_count"] == 3

        # GET verifies persistence
        g = s.get(f"{API}/habits/today", headers=_auth(client_user["token"])).json()
        assert g["water_count"] == 3
        assert g["affirmation_done"] is True

    def test_water_bounds(self, s, client_user):
        r = s.put(f"{API}/habits/today", headers=_auth(client_user["token"]), json={"water_count": -1})
        assert r.status_code == 422
        r2 = s.put(f"{API}/habits/today", headers=_auth(client_user["token"]), json={"water_count": 999})
        assert r2.status_code == 422


# =========================== module: coach specialty (dynamic vocab) ===========================


class TestCoachSpecialty:
    def test_set_specialty_on_role(self, s):
        email = _unique_email("TEST_p2_spec")
        tok = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!"}).json()["access_token"]
        r = s.post(f"{API}/me/role", headers=_auth(tok), json={"role": "coach", "specialty": "yoga"})
        assert r.status_code == 200
        assert r.json()["coach_specialty"] == "yoga"

    def test_update_specialty(self, s, coach):
        # coach fixture created with fitness; update to breathwork
        r = s.post(f"{API}/me/role", headers=_auth(coach["token"]),
                   json={"role": "coach", "specialty": "breathwork"})
        assert r.status_code == 200
        assert r.json()["coach_specialty"] == "breathwork"
        # confirm via /auth/me
        me = s.get(f"{API}/auth/me", headers=_auth(coach["token"])).json()
        assert me["coach_specialty"] == "breathwork"
        # reset to fitness for later tests
        s.post(f"{API}/me/role", headers=_auth(coach["token"]),
               json={"role": "coach", "specialty": "fitness"})

    def test_invalid_specialty_rejected(self, s, coach):
        r = s.post(f"{API}/me/role", headers=_auth(coach["token"]),
                   json={"role": "coach", "specialty": "chef"})
        assert r.status_code == 422


# =========================== module: AI program import ===========================


def _make_workout_image_b64() -> str:
    """Render a plain-text-on-white PNG with a very simple workout so vision AI has structure."""
    try:
        from PIL import Image as PILImage
        from PIL import ImageDraw, ImageFont
    except ImportError:
        pytest.skip("Pillow not installed — skipping AI import image test")

    img = PILImage.new("RGB", (900, 700), color="white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        body = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26)
    except OSError:
        font = ImageFont.load_default()
        body = ImageFont.load_default()

    draw.text((40, 30), "3 Day Strength Starter", fill="black", font=font)
    draw.text((40, 100), "Day 1: Upper Body", fill="black", font=body)
    draw.text((60, 140), "- Bench Press 3x8", fill="black", font=body)
    draw.text((60, 175), "- Bent Over Row 3x8", fill="black", font=body)
    draw.text((60, 210), "- Overhead Press 3x10", fill="black", font=body)
    draw.text((40, 260), "Day 2: Lower Body", fill="black", font=body)
    draw.text((60, 300), "- Squat 4x6", fill="black", font=body)
    draw.text((60, 335), "- Romanian Deadlift 3x8", fill="black", font=body)
    draw.text((60, 370), "- Walking Lunge 3x10", fill="black", font=body)
    draw.text((40, 420), "Day 3: Full Body", fill="black", font=body)
    draw.text((60, 460), "- Deadlift 3x5", fill="black", font=body)
    draw.text((60, 495), "- Pull-ups 3x8", fill="black", font=body)
    draw.text((60, 530), "- Push-ups 3x12", fill="black", font=body)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class TestAIProgramImport:
    def test_import_requires_coach(self, s, client_user):
        # Very short base64 to bypass min_length? min is 100 -- provide a plausible one
        r = s.post(
            f"{API}/programs/import-image",
            headers=_auth(client_user["token"]),
            json={"image_base64": "a" * 200},
        )
        assert r.status_code == 403

    def test_import_bad_base64_returns_502(self, s, coach):
        # Not a valid image -> AI will fail parsing -> 502
        r = s.post(
            f"{API}/programs/import-image",
            headers=_auth(coach["token"]),
            json={"image_base64": "a" * 200},
        )
        # Accept any failure — but must be graceful (not 500). Should be 4xx/502.
        assert r.status_code in (400, 422, 502), f"Unexpected status {r.status_code}: {r.text}"

    def test_import_real_image(self, s, coach):
        """End-to-end: build a workout-plan PNG, send it, expect a program draft back."""
        b64 = _make_workout_image_b64()
        r = s.post(
            f"{API}/programs/import-image",
            headers=_auth(coach["token"]),
            json={"image_base64": b64},
            timeout=120,
        )
        # AI vision may occasionally hiccup — accept 201 or 502/422 but assert on success shape when 201.
        if r.status_code != 201:
            pytest.skip(f"AI vision returned {r.status_code}: {r.text[:400]} (not treated as failure — flaky external service)")
        j = r.json()
        assert j["program_id"].startswith("prog_")
        assert j["sessions_created"] >= 1
        # Verify program actually persisted
        pget = s.get(f"{API}/programs/{j['program_id']}", headers=_auth(coach["token"]))
        assert pget.status_code == 200
        prog = pget.json()
        assert prog["total_days"] in (7, 14, 21, 28, 42, 56, 84)
        assert len(prog["schedule"]) == prog["total_days"]
