"""Tests for Lesson Quizzes (manual builder + AI generation + client take/submit).

Covers: GET/PUT/DELETE /api/studio/lessons/{lessonId}/quiz,
POST /api/studio/lessons/{lessonId}/quiz/generate,
GET /api/lessons/{lessonId}/quiz/take, POST /api/lessons/{lessonId}/quiz/submit.
Also verifies server-side-only grading (no correct answers leaked in /take response).
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

COACH_EMAIL = "jcgfit@gmail.com"
COACH_PASSWORD = "Coach1234!"
CLIENT_EMAIL = "ilovejeremygillespie@gmail.com"
CLIENT_PASSWORD = "Client1234!"


@pytest.fixture(scope="module")
def coach_headers():
    r = requests.post(f"{API}/auth/login", json={"email": COACH_EMAIL, "password": COACH_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def client_headers():
    r = requests.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def test_course_and_lesson(coach_headers, client_headers):
    """Create a TEST_ course, module, lesson with content, enroll the client, teardown after."""
    course = requests.post(f"{API}/studio/courses", headers=coach_headers, json={
        "title": f"TEST_Quiz Course {uuid.uuid4().hex[:6]}",
        "subtitle": "quiz test",
        "category": "fitness",
        "pricing_type": "free",
        "price": 0,
    })
    assert course.status_code in (200, 201), course.text
    course_id = course.json()["id"]

    module = requests.post(f"{API}/studio/courses/{course_id}/sections", headers=coach_headers, json={"title": "TEST Module"})
    assert module.status_code in (200, 201), module.text
    module_id = module.json()["id"]

    lesson = requests.post(f"{API}/studio/courses/{course_id}/lessons", headers=coach_headers, json={
        "module_id": module_id,
        "title": "TEST Warm-up Lesson",
        "summary": "Dynamic stretching and mobility drills before lifting heavy weights.",
        "content": "This lesson covers hip openers, shoulder circles, ankle mobility work, and a 10 minute warm-up sequence to prepare the body for strength training safely and effectively.",
    })
    assert lesson.status_code in (200, 201), lesson.text
    lesson_id = lesson.json()["id"]

    # publish course so client can access it
    requests.put(f"{API}/studio/courses/{course_id}", headers=coach_headers, json={"status": "published", "title": course.json()["title"], "category": "fitness", "pricing_type": "free", "price": 0})

    # enroll client
    me_r = requests.get(f"{API}/auth/me", headers=client_headers)
    client_id = me_r.json()["user_id"] if me_r.status_code == 200 else None
    if client_id:
        enroll_r = requests.post(f"{API}/studio/courses/{course_id}/enroll", headers=coach_headers, json={"client_id": client_id})
        assert enroll_r.status_code == 201, enroll_r.text

    yield {"course_id": course_id, "lesson_id": lesson_id}

    requests.delete(f"{API}/studio/courses/{course_id}", headers=coach_headers)


class TestQuizBuilderAuth:
    def test_get_quiz_forbidden_for_client(self, client_headers, test_course_and_lesson):
        r = requests.get(f"{API}/studio/lessons/{test_course_and_lesson['lesson_id']}/quiz", headers=client_headers)
        assert r.status_code in (401, 403)


class TestQuizManualBuilder:
    def test_get_quiz_empty_initially(self, coach_headers, test_course_and_lesson):
        r = requests.get(f"{API}/studio/lessons/{test_course_and_lesson['lesson_id']}/quiz", headers=coach_headers)
        assert r.status_code == 200, r.text
        assert r.json()["questions"] == []

    def test_save_quiz_with_mixed_question_types(self, coach_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        payload = {
            "questions": [
                {
                    "type": "multiple_choice",
                    "question": "What should you do before lifting heavy?",
                    "options": ["Warm up", "Skip breakfast", "Sprint", "Nothing"],
                    "correct_index": 0,
                    "explanation": "Warming up reduces injury risk.",
                },
                {
                    "type": "true_false",
                    "question": "Ankle mobility work is part of the warm-up.",
                    "correct_index": 0,
                    "explanation": "Yes, ankle mobility is covered.",
                },
                {
                    "type": "short_answer",
                    "question": "Name one warm-up drill mentioned.",
                    "correct_text": "hip openers",
                    "explanation": "Hip openers were mentioned.",
                },
            ]
        }
        r = requests.put(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers, json=payload)
        assert r.status_code == 200, r.text
        saved = r.json()["questions"]
        assert len(saved) == 3
        assert saved[0]["type"] == "multiple_choice"
        assert saved[0]["correct_index"] == 0

        # GET verifies persistence
        get_r = requests.get(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers)
        assert get_r.status_code == 200
        assert len(get_r.json()["questions"]) == 3

    def test_mc_needs_at_least_2_options(self, coach_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        payload = {"questions": [{"type": "multiple_choice", "question": "Bad Q", "options": ["Only one"], "correct_index": 0}]}
        r = requests.put(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers, json=payload)
        assert r.status_code == 400

    def test_short_answer_needs_correct_text(self, coach_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        payload = {"questions": [{"type": "short_answer", "question": "Q?", "correct_text": ""}]}
        r = requests.put(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers, json=payload)
        assert r.status_code == 400


class TestQuizAIGenerate:
    def test_generate_questions_from_lesson_content(self, coach_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        r = requests.post(
            f"{API}/studio/lessons/{lesson_id}/quiz/generate",
            headers=coach_headers,
            json={"count": 3, "types": ["multiple_choice", "true_false"]},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "questions" in data
        assert len(data["questions"]) >= 1
        for q in data["questions"]:
            assert q["type"] in ("multiple_choice", "true_false")
            assert q["question"]


class TestQuizClientTakeSubmit:
    @pytest.fixture(scope="class", autouse=True)
    def ensure_quiz_saved(self, coach_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        payload = {
            "questions": [
                {
                    "type": "multiple_choice",
                    "question": "What should you do before lifting heavy?",
                    "options": ["Warm up", "Skip breakfast", "Sprint", "Nothing"],
                    "correct_index": 0,
                    "explanation": "Warming up reduces injury risk.",
                },
                {
                    "type": "short_answer",
                    "question": "Name one warm-up drill mentioned.",
                    "correct_text": "hip openers",
                    "explanation": "Hip openers were mentioned.",
                },
            ]
        }
        r = requests.put(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers, json=payload)
        assert r.status_code == 200

    def test_take_quiz_never_leaks_correct_answers(self, client_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        r = requests.get(f"{API}/lessons/{lesson_id}/quiz/take", headers=client_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["questions"]) == 2
        body_str = str(data)
        assert "correct_index" not in body_str
        assert "correct_text" not in body_str

    def test_submit_quiz_grades_correctly(self, client_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        take_r = requests.get(f"{API}/lessons/{lesson_id}/quiz/take", headers=client_headers)
        questions = take_r.json()["questions"]
        mc_q = next(q for q in questions if q["type"] == "multiple_choice")
        sa_q = next(q for q in questions if q["type"] == "short_answer")

        payload = {
            "answers": [
                {"question_id": mc_q["id"], "answer": 0},  # correct
                {"question_id": sa_q["id"], "answer": "wrong answer"},  # incorrect
            ]
        }
        r = requests.post(f"{API}/lessons/{lesson_id}/quiz/submit", headers=client_headers, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["score"] == 1
        assert data["total"] == 2
        wrong_result = next(x for x in data["results"] if x["question_id"] == sa_q["id"])
        assert wrong_result["correct"] is False
        assert wrong_result["correct_text"] == "hip openers"

    def test_submit_quiz_short_answer_case_insensitive_match(self, client_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        take_r = requests.get(f"{API}/lessons/{lesson_id}/quiz/take", headers=client_headers)
        questions = take_r.json()["questions"]
        sa_q = next(q for q in questions if q["type"] == "short_answer")
        payload = {"answers": [{"question_id": sa_q["id"], "answer": "HIP OPENERS"}]}
        r = requests.post(f"{API}/lessons/{lesson_id}/quiz/submit", headers=client_headers, json=payload)
        assert r.status_code == 200
        result = next(x for x in r.json()["results"] if x["question_id"] == sa_q["id"])
        assert result["correct"] is True

    def test_no_quiz_submit_returns_400(self, coach_headers, client_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        del_r = requests.delete(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers)
        assert del_r.status_code == 200
        r = requests.post(f"{API}/lessons/{lesson_id}/quiz/submit", headers=client_headers, json={"answers": []})
        assert r.status_code == 400


class TestQuizQuestionCountField:
    def test_lesson_public_includes_quiz_question_count(self, coach_headers, client_headers, test_course_and_lesson):
        lesson_id = test_course_and_lesson["lesson_id"]
        payload = {"questions": [{"type": "true_false", "question": "T/F?", "correct_index": 0}]}
        requests.put(f"{API}/studio/lessons/{lesson_id}/quiz", headers=coach_headers, json=payload)
        course_id = test_course_and_lesson["course_id"]
        r = requests.get(f"{API}/studio/courses/{course_id}", headers=coach_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        lessons = []
        for m in body.get("sections", []):
            lessons.extend(m.get("lessons", []))
        target = next((l for l in lessons if l["id"] == lesson_id), None)
        assert target is not None, "lesson not found in course response"
        assert target.get("quiz_question_count") == 1
