"""Phase 6 backend tests — coaching catalog, practice profile, install-kit,
welcome flag, cover library, plus Phase 5 route-order + module gating regressions."""
import os
import uuid
from typing import Any

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://gemini-mobile-app-12.preview.emergentagent.com").rstrip("/") + "/api"
COACH = ("jcgfit@gmail.com", "Coach1234!")
CLIENT = ("ilovejeremygillespie@gmail.com", "Client1234!")
ALL_FLAGS = ["courses", "coaching", "community", "crm", "landing", "memberships", "assistant", "files", "automations"]


# ---- fixtures ----
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def coach_tok():
    return _login(*COACH)


@pytest.fixture(scope="module")
def client_tok():
    return _login(*CLIENT)


@pytest.fixture(scope="module")
def coach_b_tok():
    email = f"TEST_p6_coach_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "CoachP6!"}, timeout=30)
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    requests.post(f"{BASE}/me/role", json={"role": "coach", "specialty": "fitness"}, headers=_h(tok), timeout=20)
    return tok


@pytest.fixture(scope="module", autouse=True)
def _flags_all_on(coach_tok):
    """Turn on every module for jcgfit so install-kit is testable end-to-end."""
    requests.put(f"{BASE}/modules", json={"flags": {k: True for k in ALL_FLAGS}}, headers=_h(coach_tok), timeout=20)
    yield


# ---- /api/catalog ----
class TestCatalog:
    def test_catalog_shape(self, coach_tok):
        r = requests.get(f"{BASE}/catalog", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(["groups", "approaches", "session_models", "delivery", "directiveness"]).issubset(j.keys())
        groups = j["groups"]
        # 5 groups, 45 domains total distributed as 10/10/9/7/9
        assert len(groups) == 5
        by_key = {g["key"]: g for g in groups}
        for key, expected in [("personal", 10), ("career", 10), ("health", 9), ("relationships", 7), ("specialized", 9)]:
            assert key in by_key, f"missing group {key}"
            assert len(by_key[key]["domains"]) == expected, f"group {key} has {len(by_key[key]['domains'])} domains (expected {expected})"
        total = sum(len(g["domains"]) for g in groups)
        assert total == 45, total
        assert len(j["approaches"]) == 15, len(j["approaches"])
        assert len(j["session_models"]) == 13, len(j["session_models"])
        assert isinstance(j["delivery"], list) and len(j["delivery"]) >= 5
        assert isinstance(j["directiveness"], list) and len(j["directiveness"]) >= 3

    @pytest.mark.parametrize("key", ["sleep", "health_wellness", "career", "conflict", "grief_loss"])
    def test_domain_detail(self, coach_tok, key):
        r = requests.get(f"{BASE}/catalog/domains/{key}", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for f in ["offering", "must_have", "inputs", "outputs", "exclusions",
                  "escalation", "intake", "checkin", "approach_details", "model_details"]:
            assert f in d, f"domain {key} missing field {f}"
        assert isinstance(d["approach_details"], list) and len(d["approach_details"]) > 0
        assert isinstance(d["model_details"], list) and len(d["model_details"]) > 0

    def test_domain_unknown_404(self, coach_tok):
        r = requests.get(f"{BASE}/catalog/domains/does_not_exist", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 404


# ---- /api/me/practice ----
class TestPractice:
    def test_client_put_forbidden(self, client_tok):
        r = requests.put(f"{BASE}/me/practice", json={"domains": ["sleep"]}, headers=_h(client_tok), timeout=20)
        assert r.status_code == 403

    def test_coach_save_and_get(self, coach_tok):
        body = {
            "domains": ["life", "sleep", "career", "conflict", "not_a_real_domain"],
            "approaches": ["motivational_interviewing", "solution_focused", "fake_approach"],
            "default_model": "grow",
            "directiveness": "options",
            "delivery": ["program", "membership", "bogus_delivery"],
            "do_not_do": ["No medical advice", "  ", "No macros"],
        }
        r = requests.put(f"{BASE}/me/practice", json=body, headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200, r.text
        got = r.json()
        assert set(got["domains"]) == {"life", "sleep", "career", "conflict"}
        assert "not_a_real_domain" not in got["domains"]
        assert set(got["approaches"]) == {"motivational_interviewing", "solution_focused"}
        assert got["default_model"] == "grow"
        assert got["directiveness"] == "options"
        assert set(got["delivery"]) == {"program", "membership"}
        assert got["do_not_do"] == ["No medical advice", "No macros"]
        # domain_labels populated
        assert isinstance(got.get("domain_labels"), list) and len(got["domain_labels"]) == 4

        # GET returns the same
        r = requests.get(f"{BASE}/me/practice", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200
        assert set(r.json()["domains"]) == {"life", "sleep", "career", "conflict"}

    def test_client_get_returns_coach_profile(self, client_tok):
        r = requests.get(f"{BASE}/me/practice", headers=_h(client_tok), timeout=20)
        assert r.status_code == 200
        j = r.json()
        # Client is connected to jcgfit; coach's profile just saved above.
        assert isinstance(j.get("domains"), list)
        assert set(j["domains"]) >= {"life", "sleep", "career", "conflict"}


# ---- /api/catalog/domains/{key}/install ----
class TestInstallKit:
    def _find_by_title(self, tok: str, path: str, title: str) -> dict | None:
        r = requests.get(f"{BASE}{path}", headers=_h(tok), timeout=20)
        if r.status_code != 200:
            return None
        items = r.json()
        if isinstance(items, dict):
            # possible {items:[...]} shape
            items = items.get("items") or items.get("results") or items.get("templates") or items.get("forms") or []
        for x in items:
            if x.get("title") == title:
                return x
        return None

    def test_install_creates_forms_and_is_idempotent(self, coach_tok):
        key = "career"
        title_checkin = "Career coaching check-in"
        title_intake = "Career coaching intake"
        # cleanup from previous run
        for p, t in [("/studio/checkin-templates", title_checkin), ("/studio/lead-forms", title_intake)]:
            row = self._find_by_title(coach_tok, p, t)
            if row:
                requests.delete(f"{BASE}{p}/{row['id']}", headers=_h(coach_tok), timeout=20)

        r1 = requests.post(f"{BASE}/catalog/domains/{key}/install", headers=_h(coach_tok), timeout=20)
        assert r1.status_code == 201, r1.text
        j1 = r1.json()
        assert "Check-in form" in j1["created"]
        assert "Intake form" in j1["created"]

        # verify persistence
        tpl = self._find_by_title(coach_tok, "/studio/checkin-templates", title_checkin)
        frm = self._find_by_title(coach_tok, "/studio/lead-forms", title_intake)
        assert tpl is not None, "check-in template not persisted"
        assert frm is not None, "lead form not persisted"

        # idempotent — second install does not duplicate
        r2 = requests.post(f"{BASE}/catalog/domains/{key}/install", headers=_h(coach_tok), timeout=20)
        assert r2.status_code == 201, r2.text
        j2 = r2.json()
        assert "Check-in form" in " ".join(j2["skipped"])
        assert "Intake form" in " ".join(j2["skipped"])

        # practice profile now contains the domain
        pr = requests.get(f"{BASE}/me/practice", headers=_h(coach_tok), timeout=20).json()
        assert key in pr["domains"]

        # cleanup
        if tpl:
            requests.delete(f"{BASE}/studio/checkin-templates/{tpl['id']}", headers=_h(coach_tok), timeout=20)
        if frm:
            requests.delete(f"{BASE}/studio/lead-forms/{frm['id']}", headers=_h(coach_tok), timeout=20)

    def test_install_gated_when_modules_off(self, coach_b_tok):
        # coach B: turn off coaching & crm, install should skip both.
        flags = {k: True for k in ALL_FLAGS}
        flags["coaching"] = False
        flags["crm"] = False
        requests.put(f"{BASE}/modules", json={"flags": flags}, headers=_h(coach_b_tok), timeout=20)
        r = requests.post(f"{BASE}/catalog/domains/sleep/install", headers=_h(coach_b_tok), timeout=20)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["created"] == []
        assert any("Coaching" in s for s in j["skipped"])
        assert any("Contacts" in s or "Leads" in s for s in j["skipped"])

    def test_install_unknown_domain_404(self, coach_tok):
        r = requests.post(f"{BASE}/catalog/domains/nope/install", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 404


# ---- /api/me/welcomed ----
class TestWelcome:
    def test_mark_welcomed_and_persist(self, client_tok):
        r = requests.post(f"{BASE}/me/welcomed", headers=_h(client_tok), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        me = requests.get(f"{BASE}/auth/me", headers=_h(client_tok), timeout=20).json()
        assert me.get("welcomed") is True


# ---- /api/covers ----
class TestCovers:
    def test_requires_auth(self):
        r = requests.get(f"{BASE}/covers", timeout=20)
        assert r.status_code in (401, 403)

    def test_returns_presets_and_mine(self, coach_tok):
        r = requests.get(f"{BASE}/covers", headers=_h(coach_tok), timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j["presets"], list) and len(j["presets"]) == 12
        assert isinstance(j["mine"], list)
        # every preset has required keys
        for p in j["presets"]:
            for k in ["id", "label", "category", "url"]:
                assert k in p


# ---- Phase-5 regressions ----
class TestPhase5Regression:
    def test_studio_my_plan_no_private_note(self, client_tok):
        r = requests.get(f"{BASE}/studio/my/plan", headers=_h(client_tok), timeout=20)
        assert r.status_code in (200, 402, 404)
        if r.status_code == 200:
            body = r.text
            assert "private_note" not in body
            # no leaked private field even if coach saved one previously
            j = r.json() if body else {}
            def _walk(v: Any):
                if isinstance(v, dict):
                    assert "private_note" not in v
                    for x in v.values():
                        _walk(x)
                elif isinstance(v, list):
                    for x in v:
                        _walk(x)
            _walk(j)

    def test_cross_coach_isolation(self, coach_tok, coach_b_tok):
        # Coach B (fresh) should see zero contacts even though coach A may have real ones.
        flags = {k: True for k in ALL_FLAGS}
        requests.put(f"{BASE}/modules", json={"flags": flags}, headers=_h(coach_b_tok), timeout=20)
        a = requests.get(f"{BASE}/studio/contacts", headers=_h(coach_tok), timeout=20)
        b = requests.get(f"{BASE}/studio/contacts", headers=_h(coach_b_tok), timeout=20)
        assert a.status_code == 200 and b.status_code == 200
        a_ids = {c.get("id") for c in a.json()}
        b_ids = {c.get("id") for c in b.json()}
        assert a_ids.isdisjoint(b_ids), "coach B should not see coach A's contacts"

    def test_module_flags_gate_courses(self, coach_b_tok):
        # coach_b: courses off -> 403
        flags = {k: False for k in ALL_FLAGS}
        requests.put(f"{BASE}/modules", json={"flags": flags}, headers=_h(coach_b_tok), timeout=20)
        r = requests.get(f"{BASE}/studio/courses", headers=_h(coach_b_tok), timeout=20)
        assert r.status_code == 403, r.text
        # flip on -> 200
        flags["courses"] = True
        requests.put(f"{BASE}/modules", json={"flags": flags}, headers=_h(coach_b_tok), timeout=20)
        r = requests.get(f"{BASE}/studio/courses", headers=_h(coach_b_tok), timeout=20)
        assert r.status_code == 200, r.text

    def test_private_file_route_before_wildcard(self, coach_tok):
        """Regression for the router-order bug from iteration_5 — private/{file_id} literal
        must win over /files/{path:path}."""
        # Upload a tiny PNG via /library/files
        import io
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        files = {"file": ("t.png", io.BytesIO(png), "image/png")}
        r = requests.post(
            f"{BASE}/library/files",
            files=files,
            data={"title": f"TEST_p6_file_{uuid.uuid4().hex[:6]}"},
            headers=_h(coach_tok),
            timeout=30,
        )
        # library/files may require the files module flag; if flag is on it should be 201.
        if r.status_code == 403:
            pytest.skip("files module gated off — regression already covered by iteration_5")
        assert r.status_code == 201, r.text
        fid = r.json()["id"]
        try:
            got = requests.get(f"{BASE}/files/private/{fid}", headers=_h(coach_tok), timeout=20)
            assert got.status_code == 200, got.text
            assert got.headers.get("content-type", "").startswith("image/")
        finally:
            requests.delete(f"{BASE}/library/files/{fid}", headers=_h(coach_tok), timeout=20)
