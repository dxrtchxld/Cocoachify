"""Co-Coachify PHASE 3 backend tests: 5 new features
1) Coach reply from inbox
2) Exercise Library (auto + manual + delete)
3) Client detail progress fields (streak/total/week/last_active)
4) Program duplicate
5) Customizable dashboard layout (GET default + PUT persist)
Uses REAL migrated JWT coach: jcgfit@gmail.com / Coach1234! (owns 61 programs, 13 clients).
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else os.environ.get("EXPO_BACKEND_URL", "https://gemini-mobile-app-12.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

COACH_EMAIL = "jcgfit@gmail.com"
COACH_PASS = "Coach1234!"
CLIENT_EMAIL = "ilovejeremygillespie@gmail.com"
CLIENT_PASS = "Client1234!"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def coach(s):
    r = s.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    return {"token": j["access_token"], "user": j["user"]}


@pytest.fixture(scope="module")
def client_user(s):
    r = s.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    return {"token": j["access_token"], "user": j["user"]}


# ============================= 1. Coach Reply from Inbox =============================


class TestInboxReply:
    def test_inbox_reply_creates_message_and_marks_reviewed(self, s, coach, client_user):
        # Grab an inbox item for the connected client
        inbox = s.get(f"{API}/coach/inbox", headers=_auth(coach["token"]))
        assert inbox.status_code == 200
        items = inbox.json()
        assert isinstance(items, list) and len(items) > 0, "coach jcgfit should have inbox items"
        # Pick a log belonging to the real test client if possible
        target = next(
            (i for i in items if i.get("user_id") == client_user["user"]["user_id"]),
            items[0],
        )
        log_id = target["id"]
        reply_text = f"TEST_p3 auto-reply {uuid.uuid4().hex[:6]}"

        r = s.post(
            f"{API}/coach/inbox/{log_id}/reply",
            headers=_auth(coach["token"]),
            json={"text": reply_text},
        )
        assert r.status_code == 201, r.text
        assert r.json().get("ok") is True

        # Verify inbox now shows the reply + reviewed
        inbox2 = s.get(f"{API}/coach/inbox", headers=_auth(coach["token"])).json()
        found = next(i for i in inbox2 if i["id"] == log_id)
        assert found["reviewed"] is True
        assert found.get("coach_reply") == reply_text

        # Verify chat has the message (coach -> client)
        peer_id = target["user_id"]
        conv = s.get(f"{API}/chat/{peer_id}/messages", headers=_auth(coach["token"]))
        assert conv.status_code == 200
        texts = [m["text"] for m in conv.json()["messages"]]
        assert reply_text in texts

    def test_reply_empty_text_rejected(self, s, coach):
        items = s.get(f"{API}/coach/inbox", headers=_auth(coach["token"])).json()
        log_id = items[0]["id"]
        r = s.post(
            f"{API}/coach/inbox/{log_id}/reply",
            headers=_auth(coach["token"]),
            json={"text": ""},
        )
        assert r.status_code == 422

    def test_reply_unknown_log_404(self, s, coach):
        r = s.post(
            f"{API}/coach/inbox/not_a_real_log/reply",
            headers=_auth(coach["token"]),
            json={"text": "hi"},
        )
        assert r.status_code == 404

    def test_reply_forbidden_for_client(self, s, client_user):
        r = s.post(
            f"{API}/coach/inbox/anything/reply",
            headers=_auth(client_user["token"]),
            json={"text": "hi"},
        )
        assert r.status_code == 403


# ============================= 2. Exercise Library =============================


class TestExerciseLibrary:
    def test_library_returns_aggregated_from_sessions(self, s, coach):
        r = s.get(f"{API}/coach/exercise-library", headers=_auth(coach["token"]))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 50, f"jcgfit should have many exercises aggregated, got {len(items)}"
        first = items[0]
        assert "name" in first and isinstance(first["name"], str)
        assert first["source"] in ("program", "manual")
        assert isinstance(first["usage_count"], int)
        # Sorted by usage_count desc
        counts = [x["usage_count"] for x in items]
        assert counts == sorted(counts, reverse=True) or counts[0] >= counts[-1]

    def test_add_manual_exercise_and_delete(self, s, coach):
        name = f"TEST_p3_ex_{uuid.uuid4().hex[:6]}"
        note = "Keep chest up. Drive through midfoot."
        # Create
        r = s.post(
            f"{API}/coach/exercise-library",
            headers=_auth(coach["token"]),
            json={"name": name, "note": note},
        )
        assert r.status_code == 201, r.text
        ex_id = r.json()["id"]
        assert ex_id.startswith("lib_")

        # Verify present via GET
        lib = s.get(f"{API}/coach/exercise-library", headers=_auth(coach["token"])).json()
        found = next((e for e in lib if e.get("name") == name), None)
        assert found is not None, "manual exercise should appear in library"
        assert found["source"] == "manual"
        assert found["id"] == ex_id
        assert found["note"] == note

        # Delete
        d = s.delete(f"{API}/coach/exercise-library/{ex_id}", headers=_auth(coach["token"]))
        assert d.status_code == 200
        lib2 = s.get(f"{API}/coach/exercise-library", headers=_auth(coach["token"])).json()
        assert all(e.get("name") != name for e in lib2 if e.get("source") == "manual")

    def test_library_forbidden_for_client(self, s, client_user):
        r = s.get(f"{API}/coach/exercise-library", headers=_auth(client_user["token"]))
        assert r.status_code == 403

    def test_add_exercise_validation(self, s, coach):
        r = s.post(
            f"{API}/coach/exercise-library",
            headers=_auth(coach["token"]),
            json={"name": "", "note": ""},
        )
        assert r.status_code == 422


# ============================= 3. Client Progress =============================


class TestClientProgress:
    def test_client_detail_includes_progress(self, s, coach, client_user):
        cid = client_user["user"]["user_id"]
        r = s.get(f"{API}/coach/clients/{cid}", headers=_auth(coach["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        for field in ("streak", "total_checkins", "week_checkins", "last_active"):
            assert field in j, f"missing field {field}"
        assert isinstance(j["streak"], int) and j["streak"] >= 0
        assert isinstance(j["total_checkins"], int) and j["total_checkins"] >= 0
        assert isinstance(j["week_checkins"], int) and j["week_checkins"] >= 0
        # last_active is either null or an ISO string
        assert j["last_active"] is None or isinstance(j["last_active"], str)

    def test_client_detail_unrelated_404(self, s, coach):
        r = s.get(f"{API}/coach/clients/user_deadbeef", headers=_auth(coach["token"]))
        assert r.status_code == 404


# ============================= 4. Program Duplicate =============================


class TestProgramDuplicate:
    def test_duplicate_program_creates_copy(self, s, coach):
        # Find a program owned by coach that has at least one non-null session
        progs = s.get(f"{API}/programs", headers=_auth(coach["token"])).json()
        assert len(progs) > 0
        candidate = next((p for p in progs if p.get("session_count", 0) > 0), progs[0])
        pid = candidate["id"]
        # Get schedule of source (via full detail)
        src = s.get(f"{API}/programs/{pid}", headers=_auth(coach["token"])).json()
        src_session_ids = {d["session_id"] for d in src["schedule"] if d["session_id"]}

        r = s.post(f"{API}/programs/{pid}/duplicate", headers=_auth(coach["token"]))
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["id"].startswith("prog_") and j["id"] != pid
        assert j["name"].endswith("(Copy)")
        assert j["owner_id"] == coach["user"]["user_id"]
        assert j.get("is_template") in (False, None)
        assert j["total_days"] == src["total_days"]

        # Verify copy exists and sessions are new ids
        copy_detail = s.get(f"{API}/programs/{j['id']}", headers=_auth(coach["token"]))
        assert copy_detail.status_code == 200
        cd = copy_detail.json()
        copy_session_ids = {d["session_id"] for d in cd["schedule"] if d["session_id"]}
        # No overlap between src and copy session ids (fresh copies)
        assert copy_session_ids.isdisjoint(src_session_ids), "duplicated sessions should have new ids"

        # Cleanup — remove the duplicate to avoid clutter
        s.delete(f"{API}/programs/{j['id']}", headers=_auth(coach["token"]))

    def test_duplicate_unknown_404(self, s, coach):
        r = s.post(f"{API}/programs/not_a_real_prog/duplicate", headers=_auth(coach["token"]))
        assert r.status_code == 404

    def test_duplicate_forbidden_for_client(self, s, coach, client_user):
        progs = s.get(f"{API}/programs", headers=_auth(coach["token"])).json()
        pid = progs[0]["id"]
        r = s.post(f"{API}/programs/{pid}/duplicate", headers=_auth(client_user["token"]))
        assert r.status_code == 403


# ============================= 5. Dashboard Layout =============================


DEFAULT_KEYS = ["stats", "quick_actions", "needs_attention", "inbox_preview", "recent_activity"]


class TestDashboardLayout:
    def test_get_default_layout(self, s, coach):
        # Reset by setting all defaults first for deterministic assertions
        s.put(
            f"{API}/me/dashboard-layout",
            headers=_auth(coach["token"]),
            json={"sections": [{"key": k, "visible": True} for k in DEFAULT_KEYS]},
        )
        r = s.get(f"{API}/me/dashboard-layout", headers=_auth(coach["token"]))
        assert r.status_code == 200
        j = r.json()
        keys = [s_["key"] for s_ in j["sections"]]
        assert keys == DEFAULT_KEYS
        assert all(s_["visible"] for s_ in j["sections"])

    def test_put_reorder_and_hide_persists(self, s, coach):
        # Reverse + hide recent_activity
        new_sections = [
            {"key": "recent_activity", "visible": False},
            {"key": "inbox_preview", "visible": True},
            {"key": "needs_attention", "visible": True},
            {"key": "quick_actions", "visible": True},
            {"key": "stats", "visible": False},
        ]
        r = s.put(
            f"{API}/me/dashboard-layout",
            headers=_auth(coach["token"]),
            json={"sections": new_sections},
        )
        assert r.status_code == 200
        j = r.json()
        assert [s_["key"] for s_ in j["sections"]] == [s_["key"] for s_ in new_sections]
        assert j["sections"][0]["visible"] is False  # recent_activity hidden
        assert j["sections"][4]["visible"] is False  # stats hidden

        # GET again to verify persistence
        g = s.get(f"{API}/me/dashboard-layout", headers=_auth(coach["token"])).json()
        assert [s_["key"] for s_ in g["sections"]] == [s_["key"] for s_ in new_sections]
        assert g["sections"][0]["visible"] is False
        assert g["sections"][4]["visible"] is False

    def test_put_unknown_keys_ignored_and_missing_appended(self, s, coach):
        r = s.put(
            f"{API}/me/dashboard-layout",
            headers=_auth(coach["token"]),
            json={"sections": [
                {"key": "quick_actions", "visible": True},
                {"key": "made_up_key", "visible": True},
            ]},
        )
        assert r.status_code == 200
        keys = [s_["key"] for s_ in r.json()["sections"]]
        assert "made_up_key" not in keys
        # All 5 canonical keys should still be present
        assert set(DEFAULT_KEYS).issubset(set(keys))
        # Reset to defaults
        s.put(
            f"{API}/me/dashboard-layout",
            headers=_auth(coach["token"]),
            json={"sections": [{"key": k, "visible": True} for k in DEFAULT_KEYS]},
        )

    def test_layout_requires_auth(self, s):
        r = s.get(f"{API}/me/dashboard-layout")
        assert r.status_code == 401
