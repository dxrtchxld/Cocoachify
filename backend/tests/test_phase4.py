"""Co-Coachify Phase 4 backend tests — Luxe Dark redesign + customization.

Covers:
- Object Storage: POST /upload (auth, mime whitelist, MB limit); GET /files/{path} public serve
- Brand: PUT/GET /me/brand persists brand_logo; setting null clears it; /auth/me reflects it
- Programs cover_image: POST/PUT/GET persist; omitting on update must NOT wipe existing cover
- Remove client: DELETE /coach/clients/{id} (must relink after) — done on throwaway client
- Regression: coach exercise-library, client detail progress fields, dashboard-layout, inbox reply
"""
import io
import os
import struct
import time
import uuid
import zlib

import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/") if "EXPO_BACKEND_URL" in os.environ else "https://gemini-mobile-app-12.preview.emergentagent.com"
API = f"{BASE_URL}/api"

COACH_EMAIL = "jcgfit@gmail.com"
COACH_PW = "Coach1234!"
COACH_ID = "0wj2PJsaAOZBQ145aKKK5l1hZnb2"
CLIENT_EMAIL = "ilovejeremygillespie@gmail.com"
CLIENT_PW = "Client1234!"


# ---------------- helpers ----------------

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _tiny_png(color=(200, 160, 80)) -> bytes:
    """Return a valid 1x1 PNG (no external deps)."""
    def _chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = _chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw = b"\x00" + bytes(color)  # 1 filter byte + 3 RGB bytes
    idat = _chunk(b"IDAT", zlib.compress(raw))
    iend = _chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def coach_token(s):
    r = s.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client_token(s):
    r = s.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------------- Uploads / Files ----------------

class TestUploads:
    def test_upload_unauth_401(self, s):
        png = _tiny_png()
        r = s.post(f"{API}/upload", files={"file": ("t.png", png, "image/png")})
        assert r.status_code in (401, 403), r.text

    def test_upload_rejects_non_image(self, s, coach_token):
        r = s.post(
            f"{API}/upload",
            headers=_auth(coach_token),
            files={"file": ("note.txt", b"hello world", "text/plain")},
        )
        assert r.status_code == 400
        assert "image" in r.json().get("detail", "").lower()

    def test_upload_success_and_public_get(self, s, coach_token):
        png = _tiny_png()
        r = s.post(
            f"{API}/upload",
            headers=_auth(coach_token),
            files={"file": ("cover.png", png, "image/png")},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].startswith("/api/files/cocoachify/uploads/"), j
        assert j["path"].startswith("cocoachify/uploads/")
        # public GET (no auth) works
        g = requests.get(f"{BASE_URL}{j['url']}")
        assert g.status_code == 200
        assert g.headers.get("Content-Type", "").startswith("image/png")
        assert g.content == png

    def test_serve_missing_file_404(self, s):
        r = s.get(f"{API}/files/cocoachify/uploads/does-not-exist.png")
        assert r.status_code == 404


# ---------------- Brand ----------------

class TestBrand:
    def test_put_brand_persists_and_get_me_reflects(self, s, coach_token):
        # 1) upload a fresh logo
        png = _tiny_png(color=(240, 220, 160))
        up = s.post(
            f"{API}/upload",
            headers=_auth(coach_token),
            files={"file": ("logo.png", png, "image/png")},
        )
        assert up.status_code == 200
        logo_url = up.json()["url"]
        # 2) persist on user
        r = s.put(
            f"{API}/me/brand",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"logo_url": logo_url},
        )
        assert r.status_code == 200, r.text
        assert r.json()["brand_logo"] == logo_url
        # 3) /auth/me reflects it
        me = s.get(f"{API}/auth/me", headers=_auth(coach_token))
        assert me.status_code == 200
        assert me.json()["brand_logo"] == logo_url

    def test_null_logo_clears(self, s, coach_token):
        r = s.put(
            f"{API}/me/brand",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"logo_url": None},
        )
        assert r.status_code == 200
        assert r.json()["brand_logo"] is None
        me = s.get(f"{API}/auth/me", headers=_auth(coach_token)).json()
        assert me["brand_logo"] is None

    def test_theme_color_persists(self, s, coach_token):
        r = s.put(
            f"{API}/me/theme",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"theme_color": "#E5D0A1"},
        )
        assert r.status_code == 200
        assert r.json()["theme_color"] == "#E5D0A1"
        # bad hex -> 422
        r2 = s.put(
            f"{API}/me/theme",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"theme_color": "not-a-hex"},
        )
        assert r2.status_code == 422


# ---------------- Program cover_image ----------------

class TestProgramCover:
    @pytest.fixture(scope="class")
    def created_program(self, s, coach_token):
        # upload a cover
        png = _tiny_png(color=(30, 30, 30))
        up = s.post(
            f"{API}/upload",
            headers=_auth(coach_token),
            files={"file": ("cover.png", png, "image/png")},
        )
        cover_url = up.json()["url"]
        # create with cover
        body = {
            "name": f"TEST_p4_cover_{uuid.uuid4().hex[:6]}",
            "description": "test cover",
            "category": "fitness",
            "difficulty": "beginner",
            "total_days": 7,
            "days_per_week": 3,
            "cover_image": cover_url,
            "schedule": [None] * 7,
        }
        r = s.post(
            f"{API}/programs",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json=body,
        )
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        yield {"id": pid, "cover_url": cover_url}
        # cleanup
        s.delete(f"{API}/programs/{pid}", headers=_auth(coach_token))

    def test_create_persists_cover(self, s, coach_token, created_program):
        g = s.get(f"{API}/programs/{created_program['id']}", headers=_auth(coach_token))
        assert g.status_code == 200
        assert g.json()["cover_image"] == created_program["cover_url"]

    def test_list_returns_cover(self, s, coach_token, created_program):
        lst = s.get(f"{API}/programs", headers=_auth(coach_token)).json()
        target = next(p for p in lst if p["id"] == created_program["id"])
        assert target["cover_image"] == created_program["cover_url"]

    def test_update_without_cover_keeps_existing(self, s, coach_token, created_program):
        # PUT without cover_image field -> defaults to None in body -> route must NOT wipe
        body = {
            "name": "TEST_p4_cover_renamed",
            "description": "no cover in body",
            "category": "fitness",
            "difficulty": "beginner",
            "total_days": 7,
            "days_per_week": 3,
            "schedule": [None] * 7,
        }
        r = s.put(
            f"{API}/programs/{created_program['id']}",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json=body,
        )
        assert r.status_code == 200, r.text
        # Cover should be preserved
        g = s.get(f"{API}/programs/{created_program['id']}", headers=_auth(coach_token)).json()
        assert g["cover_image"] == created_program["cover_url"]

    def test_update_with_new_cover_overwrites(self, s, coach_token, created_program):
        png = _tiny_png(color=(10, 10, 200))
        new_cover = s.post(
            f"{API}/upload",
            headers=_auth(coach_token),
            files={"file": ("cover2.png", png, "image/png")},
        ).json()["url"]
        body = {
            "name": "TEST_p4_cover_new",
            "category": "fitness",
            "difficulty": "beginner",
            "total_days": 7,
            "days_per_week": 3,
            "cover_image": new_cover,
            "schedule": [None] * 7,
        }
        r = s.put(
            f"{API}/programs/{created_program['id']}",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json=body,
        )
        assert r.status_code == 200
        assert r.json()["cover_image"] == new_cover


# ---------------- Remove client (on a throwaway) ----------------

class TestRemoveClient:
    @pytest.fixture(scope="class")
    def throwaway_client(self, s, coach_token):
        # Create + connect a brand-new throwaway client to jcgfit
        email = f"TEST_p4_rem_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@test.com"
        reg = s.post(
            f"{API}/auth/register",
            json={"email": email, "password": "Test1234!", "name": "Throwaway Rem"},
        )
        assert reg.status_code == 201, reg.text
        t = reg.json()["access_token"]
        uid = reg.json()["user"]["user_id"]
        s.post(
            f"{API}/me/role",
            headers={**_auth(t), "Content-Type": "application/json"},
            json={"role": "client"},
        )
        s.put(
            f"{API}/me/onboarding",
            headers={**_auth(t), "Content-Type": "application/json"},
            json={"goal": "cardio", "experience": "just_starting", "days_per_week": 3},
        )
        # accept jcgfit invite via email
        acc = s.post(
            f"{API}/invites/accept",
            headers={**_auth(t), "Content-Type": "application/json"},
            json={"coach_email": COACH_EMAIL},
        )
        assert acc.status_code == 200, acc.text
        return {"user_id": uid, "token": t, "email": email}

    def test_client_shows_up_in_list(self, s, coach_token, throwaway_client):
        r = s.get(f"{API}/coach/clients", headers=_auth(coach_token))
        assert r.status_code == 200
        ids = [c["user_id"] for c in r.json()]
        assert throwaway_client["user_id"] in ids

    def test_delete_client_and_verify_absence(self, s, coach_token, throwaway_client):
        r = s.delete(
            f"{API}/coach/clients/{throwaway_client['user_id']}", headers=_auth(coach_token)
        )
        assert r.status_code == 200, r.text
        # Now absent from /coach/clients
        lst = s.get(f"{API}/coach/clients", headers=_auth(coach_token)).json()
        ids = [c["user_id"] for c in lst]
        assert throwaway_client["user_id"] not in ids
        # detail 404 (no longer this coach's client)
        d = s.get(
            f"{API}/coach/clients/{throwaway_client['user_id']}", headers=_auth(coach_token)
        )
        assert d.status_code == 404

    def test_delete_non_client_404(self, s, coach_token):
        r = s.delete(f"{API}/coach/clients/user_notreal", headers=_auth(coach_token))
        assert r.status_code == 404

    def test_delete_requires_coach(self, s, client_token, throwaway_client):
        r = s.delete(
            f"{API}/coach/clients/{throwaway_client['user_id']}", headers=_auth(client_token)
        )
        assert r.status_code == 403


# ---------------- Regression: exercise-library, client progress, dashboard-layout ----------------

class TestRegression:
    def test_exercise_library_returns_list(self, s, coach_token):
        r = s.get(f"{API}/coach/exercise-library", headers=_auth(coach_token))
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 1
        assert {"name", "usage_count", "source"} <= set(arr[0].keys())

    def test_exercise_library_add_and_delete(self, s, coach_token):
        name = f"TEST_p4_ex_{uuid.uuid4().hex[:8]}"
        r = s.post(
            f"{API}/coach/exercise-library",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"name": name, "note": "test-only"},
        )
        assert r.status_code == 201, r.text
        eid = r.json()["id"]
        assert eid.startswith("lib_")
        d = s.delete(f"{API}/coach/exercise-library/{eid}", headers=_auth(coach_token))
        assert d.status_code == 200

    def test_client_detail_has_progress_fields(self, s, coach_token):
        clients = s.get(f"{API}/coach/clients", headers=_auth(coach_token)).json()
        # Pick a real migrated client (not the throwaway just created — should be gone anyway)
        real = next(c for c in clients if not c["email"].startswith("TEST_"))
        r = s.get(f"{API}/coach/clients/{real['user_id']}", headers=_auth(coach_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("streak", "total_checkins", "week_checkins", "last_active"):
            assert k in d, f"missing {k}"
        assert isinstance(d["streak"], int) and d["streak"] >= 0

    def test_dashboard_layout_get_and_put(self, s, coach_token):
        g = s.get(f"{API}/me/dashboard-layout", headers=_auth(coach_token))
        assert g.status_code == 200
        secs = g.json()["sections"]
        keys = [s["key"] for s in secs]
        assert set(keys) == {"stats", "quick_actions", "needs_attention", "inbox_preview", "recent_activity"}
        # put a mutation, then reset back to default
        mutated = [{"key": k, "visible": (k != "stats")} for k in keys]
        p = s.put(
            f"{API}/me/dashboard-layout",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"sections": mutated},
        )
        assert p.status_code == 200
        # Reset defaults
        default = [{"key": k, "visible": True} for k in keys]
        s.put(
            f"{API}/me/dashboard-layout",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"sections": default},
        )

    def test_inbox_reply_flow(self, s, coach_token):
        # Find an unreviewed inbox item to reply to
        inbox = s.get(f"{API}/coach/inbox", headers=_auth(coach_token))
        assert inbox.status_code == 200
        items = inbox.json()
        if not items:
            pytest.skip("no inbox items")
        # pick any workout log
        target = items[0]
        log_id = target["id"]
        text = f"TEST_p4 reply {uuid.uuid4().hex[:6]}"
        r = s.post(
            f"{API}/coach/inbox/{log_id}/reply",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"text": text},
        )
        assert r.status_code == 201, r.text
        # 422 on empty text
        bad = s.post(
            f"{API}/coach/inbox/{log_id}/reply",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"text": ""},
        )
        assert bad.status_code == 422
        # 404 unknown log
        no = s.post(
            f"{API}/coach/inbox/nope-nope/reply",
            headers={**_auth(coach_token), "Content-Type": "application/json"},
            json={"text": "x"},
        )
        assert no.status_code == 404
