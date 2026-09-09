"""Tests for the new Bulk Upload & Auto-Organize course-import flow.

Covers: POST /api/studio/courses/import (multipart), GET /api/studio/courses/import/{id},
POST /api/studio/courses/import/{id}/confirm, and downstream course/lessons verification.
"""
import io
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

COACH_EMAIL = "jcgfit@gmail.com"
COACH_PASSWORD = "Coach1234!"
CLIENT_EMAIL = "ilovejeremygillespie@gmail.com"
CLIENT_PASSWORD = "Client1234!"


@pytest.fixture(scope="module")
def coach_token():
    r = requests.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def coach_headers(coach_token):
    return {"Authorization": f"Bearer {coach_token}"}


@pytest.fixture(scope="module")
def client_token():
    r = requests.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client_headers(client_token):
    return {"Authorization": f"Bearer {client_token}"}


WARMUP_TXT = (
    b"Warm-up and Mobility Routine\n\n"
    b"This session covers dynamic stretching, joint mobility drills, and a 10 minute "
    b"warm-up sequence to prepare the body for strength training. Includes hip openers, "
    b"shoulder circles, and ankle mobility work before lifting."
)
NUTRITION_TXT = (
    b"Nutrition Fundamentals for Athletes\n\n"
    b"This guide explains macronutrient basics, protein timing around workouts, "
    b"hydration strategy, and how to build a balanced meal plan for muscle recovery "
    b"and sustained energy throughout the day."
)


class TestCreateImport:
    def test_import_forbidden_for_client(self, client_headers):
        files = [("files", ("warmup.txt", io.BytesIO(WARMUP_TXT), "text/plain"))]
        r = requests.post(f"{API}/studio/courses/import", headers=client_headers, files=files)
        assert r.status_code == 403, r.text

    def test_import_requires_auth(self):
        files = [("files", ("warmup.txt", io.BytesIO(WARMUP_TXT), "text/plain"))]
        r = requests.post(f"{API}/studio/courses/import", files=files)
        assert r.status_code in (401, 403), r.text

    def test_import_two_files_ai_organizes(self, coach_headers):
        files = [
            ("files", ("warmup-mobility.txt", io.BytesIO(WARMUP_TXT), "text/plain")),
            ("files", ("nutrition-fundamentals.txt", io.BytesIO(NUTRITION_TXT), "text/plain")),
        ]
        data = {"course_title": "TEST_ Coach Fundamentals"}
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=files, data=data)
        assert r.status_code == 201, r.text
        body = r.json()
        assert "id" in body and body["id"].startswith("cimp_")
        assert len(body["files"]) == 2
        for f in body["files"]:
            assert f["error"] is None
            assert f["kind"] == "doc"
        plan = body["plan"]
        assert "course_title" in plan
        assert isinstance(plan["modules"], list)
        assert len(plan["modules"]) >= 1
        total_lessons = sum(len(m["lessons"]) for m in plan["modules"])
        assert total_lessons == 2, f"Expected both files mapped to lessons, got plan={plan}"
        # verify every file_id from the upload appears exactly once across lessons
        plan_file_ids = {l["file_id"] for m in plan["modules"] for l in m["lessons"]}
        upload_file_ids = {f["id"] for f in body["files"]}
        assert plan_file_ids == upload_file_ids
        print("AI PLAN:", plan)

    def test_import_more_than_10_files_rejected(self, coach_headers):
        files = [
            ("files", (f"f{i}.txt", io.BytesIO(b"content " + str(i).encode()), "text/plain"))
            for i in range(11)
        ]
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=files)
        assert r.status_code == 400, r.text
        assert "at most" in r.json()["detail"].lower() or "10" in r.json()["detail"]

    def test_import_unsupported_file_type_reported_not_crashed(self, coach_headers):
        files = [
            ("files", ("archive.zip", io.BytesIO(b"PK\x03\x04fakezipdata"), "application/zip")),
            ("files", ("warmup.txt", io.BytesIO(WARMUP_TXT), "text/plain")),
        ]
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=files)
        assert r.status_code == 201, r.text
        body = r.json()
        zip_entry = next(f for f in body["files"] if f["filename"] == "archive.zip")
        assert zip_entry["error"] is not None
        assert zip_entry["id"] is None
        txt_entry = next(f for f in body["files"] if f["filename"] == "warmup.txt")
        assert txt_entry["error"] is None

    def test_import_all_unsupported_files_400(self, coach_headers):
        files = [
            ("files", ("archive.zip", io.BytesIO(b"PK\x03\x04fakezipdata"), "application/zip")),
        ]
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=files)
        assert r.status_code == 400, r.text

    def test_import_no_files_400(self, coach_headers):
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=[])
        assert r.status_code in (400, 422), r.text


class TestGetImport:
    @pytest.fixture(scope="class")
    def import_session(self, coach_headers):
        files = [("files", ("warmup.txt", io.BytesIO(WARMUP_TXT), "text/plain"))]
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=files)
        assert r.status_code == 201
        return r.json()

    def test_get_import_owner_ok(self, coach_headers, import_session):
        import_id = import_session["id"]
        r = requests.get(f"{API}/studio/courses/import/{import_id}", headers=coach_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == import_id
        assert body["plan"]["modules"]

    def test_get_import_not_owner_forbidden_or_404(self, client_headers, import_session):
        import_id = import_session["id"]
        r = requests.get(f"{API}/studio/courses/import/{import_id}", headers=client_headers)
        assert r.status_code in (403, 404), r.text

    def test_get_import_nonexistent_404(self, coach_headers):
        r = requests.get(f"{API}/studio/courses/import/cimp_doesnotexist", headers=coach_headers)
        assert r.status_code == 404


class TestConfirmImport:
    @pytest.fixture()
    def import_session(self, coach_headers):
        files = [
            ("files", ("TEST_warmup.txt", io.BytesIO(WARMUP_TXT), "text/plain")),
            ("files", ("TEST_nutrition.txt", io.BytesIO(NUTRITION_TXT), "text/plain")),
        ]
        r = requests.post(f"{API}/studio/courses/import", headers=coach_headers, files=files,
                           data={"course_title": "TEST_ Confirm Flow Course"})
        assert r.status_code == 201
        return r.json()

    def test_confirm_creates_course_with_lessons(self, coach_headers, import_session):
        import_id = import_session["id"]
        plan = import_session["plan"]
        r = requests.post(f"{API}/studio/courses/import/{import_id}/confirm", headers=coach_headers, json=plan)
        assert r.status_code == 201, r.text
        created = r.json()
        assert "id" in created and created["id"].startswith("crs_")
        course_id = created["id"]

        # Verify via GET course detail endpoint
        r2 = requests.get(f"{API}/studio/courses/{course_id}", headers=coach_headers)
        assert r2.status_code == 200, r2.text
        detail = r2.json()
        assert detail["title"] == plan["course_title"]

        # cleanup marker used later
        self.__class__._created_course_id = course_id
        self.__class__._import_id = import_id

    def test_confirm_twice_fails_400(self, coach_headers, import_session):
        import_id = import_session["id"]
        plan = import_session["plan"]
        r1 = requests.post(f"{API}/studio/courses/import/{import_id}/confirm", headers=coach_headers, json=plan)
        assert r1.status_code == 201, r1.text
        r2 = requests.post(f"{API}/studio/courses/import/{import_id}/confirm", headers=coach_headers, json=plan)
        assert r2.status_code == 400, r2.text
        assert "already created a course" in r2.json()["detail"].lower()

    def test_confirm_empty_modules_400(self, coach_headers, import_session):
        import_id = import_session["id"]
        plan = dict(import_session["plan"])
        plan["modules"] = []
        r = requests.post(f"{API}/studio/courses/import/{import_id}/confirm", headers=coach_headers, json=plan)
        assert r.status_code == 400, r.text
        assert "at least one lesson" in r.json()["detail"].lower()

    def test_confirm_maps_file_kinds_to_lesson_fields(self, coach_headers, import_session):
        import_id = import_session["id"]
        plan = import_session["plan"]
        r = requests.post(f"{API}/studio/courses/import/{import_id}/confirm", headers=coach_headers, json=plan)
        assert r.status_code == 201, r.text
        course_id = r.json()["id"]
        r2 = requests.get(f"{API}/studio/courses/{course_id}", headers=coach_headers)
        assert r2.status_code == 200, r2.text
        detail = r2.json()
        all_lessons = [l for sec in detail["sections"] for l in sec["lessons"]]
        assert len(all_lessons) == sum(len(m["lessons"]) for m in plan["modules"])
        for lesson in all_lessons:
            if lesson.get("video_file_id"):
                assert lesson["attachments"] == []
            elif lesson.get("attachments"):
                assert lesson["video_file_id"] is None
        print("COURSE DETAIL:", detail)
