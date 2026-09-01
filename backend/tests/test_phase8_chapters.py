"""Phase 8 backend tests — lesson video chapter markers."""
import os
import uuid

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://gemini-mobile-app-12.preview.emergentagent.com").rstrip("/") + "/api"
COACH = ("jcgfit@gmail.com", "Coach1234!")


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def coach_tok():
    return _login(*COACH)


@pytest.fixture(scope="module", autouse=True)
def _courses_on(coach_tok):
    requests.put(f"{BASE}/modules", json={"flags": {"courses": True}}, headers=_h(coach_tok), timeout=20)
    yield


@pytest.fixture()
def course(coach_tok):
    c = requests.post(f"{BASE}/studio/courses", headers=_h(coach_tok), timeout=20, json={
        "title": f"TEST_p8 Chapters Course {uuid.uuid4().hex[:6]}", "pricing_type": "free",
        "status": "draft", "category": "fitness",
    }).json()
    yield c
    requests.delete(f"{BASE}/studio/courses/{c['id']}", headers=_h(coach_tok), timeout=20)


class TestLessonChapters:
    def test_create_with_chapters_returns_sorted(self, coach_tok, course):
        body = {
            "title": "TEST_p8 Lesson", "content": "hi", "order": 0,
            "release": {"type": "immediate", "day_offset": 0},
            "chapters": [
                {"title": "Main set", "timestamp_seconds": 195},
                {"title": "Warm-up", "timestamp_seconds": 0},
                {"title": "Cool-down", "timestamp_seconds": 600},
            ],
        }
        r = requests.post(f"{BASE}/studio/courses/{course['id']}/lessons", headers=_h(coach_tok),
                          timeout=20, json=body)
        assert r.status_code == 201, r.text
        lesson = r.json()
        assert [c["title"] for c in lesson["chapters"]] == ["Warm-up", "Main set", "Cool-down"]
        assert [c["timestamp_seconds"] for c in lesson["chapters"]] == [0, 195, 600]

        fetched = requests.get(f"{BASE}/studio/lessons/{lesson['id']}", headers=_h(coach_tok), timeout=20).json()
        assert len(fetched["chapters"]) == 3

    def test_update_replaces_chapters(self, coach_tok, course):
        created = requests.post(f"{BASE}/studio/courses/{course['id']}/lessons", headers=_h(coach_tok),
                                timeout=20, json={
                                    "title": "TEST_p8 Lesson 2", "content": "hi", "order": 1,
                                    "release": {"type": "immediate", "day_offset": 0},
                                    "chapters": [{"title": "Intro", "timestamp_seconds": 5}],
                                }).json()
        r = requests.put(f"{BASE}/studio/lessons/{created['id']}", headers=_h(coach_tok), timeout=20, json={
            "title": "TEST_p8 Lesson 2", "content": "hi", "order": 1,
            "release": {"type": "immediate", "day_offset": 0},
            "chapters": [],
        })
        assert r.status_code == 200, r.text
        assert r.json()["chapters"] == []

    def test_chapters_default_to_empty(self, coach_tok, course):
        r = requests.post(f"{BASE}/studio/courses/{course['id']}/lessons", headers=_h(coach_tok),
                          timeout=20, json={
                              "title": "TEST_p8 Lesson 3", "content": "hi", "order": 2,
                              "release": {"type": "immediate", "day_offset": 0},
                          })
        assert r.status_code == 201, r.text
        assert r.json()["chapters"] == []

    def test_invalid_timestamp_rejected(self, coach_tok, course):
        r = requests.post(f"{BASE}/studio/courses/{course['id']}/lessons", headers=_h(coach_tok),
                          timeout=20, json={
                              "title": "TEST_p8 Bad", "content": "hi", "order": 3,
                              "release": {"type": "immediate", "day_offset": 0},
                              "chapters": [{"title": "Bad", "timestamp_seconds": -5}],
                          })
        assert r.status_code == 422
