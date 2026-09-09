"""Lesson quizzes: manual builder + AI-assisted question generation.

Quizzes live on their own endpoints (not the general LessonBody PUT) so a
routine lesson-content edit can never accidentally wipe out a quiz. Grading is
fully deterministic (exact match on the correct option / exact-ish text match
for short answer) — no AI involved in scoring, so results are always
reproducible and free.
"""
import json
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db
from modules import owned, require_coach, require_course_access, require_module

load_dotenv()

router = APIRouter(tags=["quizzes"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
QUESTION_TYPES = {"multiple_choice", "true_false", "short_answer"}


class QuizQuestionBody(BaseModel):
    id: str = Field(default_factory=lambda: f"q_{uuid.uuid4().hex[:10]}")
    type: str
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(default_factory=list)
    correct_index: int | None = None
    correct_text: str | None = Field(default=None, max_length=200)
    explanation: str = Field(default="", max_length=400)


class QuizBody(BaseModel):
    questions: list[QuizQuestionBody] = Field(default_factory=list)


def _validate_questions(questions: list[QuizQuestionBody]) -> list[dict]:
    if len(questions) > 30:
        raise HTTPException(status_code=400, detail="A quiz can have at most 30 questions")
    out = []
    for q in questions:
        if q.type not in QUESTION_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown question type: {q.type}")
        if q.type == "true_false":
            options = ["True", "False"]
            if q.correct_index not in (0, 1):
                raise HTTPException(status_code=400, detail="True/False questions need a correct answer")
            correct_text = None
        elif q.type == "multiple_choice":
            options = [o.strip() for o in q.options if o.strip()][:6]
            if len(options) < 2:
                raise HTTPException(status_code=400, detail="Multiple choice questions need at least 2 options")
            if q.correct_index is None or not (0 <= q.correct_index < len(options)):
                raise HTTPException(status_code=400, detail="Pick a correct option for each multiple choice question")
            correct_text = None
        else:  # short_answer
            options = []
            correct_text = (q.correct_text or "").strip()
            if not correct_text:
                raise HTTPException(status_code=400, detail="Short answer questions need a correct answer")
        out.append({
            "id": q.id,
            "type": q.type,
            "question": q.question.strip(),
            "options": options,
            "correct_index": q.correct_index if q.type != "short_answer" else None,
            "correct_text": correct_text,
            "explanation": q.explanation.strip(),
        })
    return out


async def _coach_lesson(lesson_id: str, user: dict):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    lesson = await owned(db.lessons, lesson_id, coach_id, "Lesson")
    return coach_id, lesson


@router.get("/studio/lessons/{lesson_id}/quiz")
async def get_quiz_for_edit(lesson_id: str, user: dict = Depends(get_current_user)):
    _, lesson = await _coach_lesson(lesson_id, user)
    return {"questions": lesson.get("quiz_questions") or []}


@router.put("/studio/lessons/{lesson_id}/quiz")
async def save_quiz(lesson_id: str, body: QuizBody, user: dict = Depends(get_current_user)):
    await _coach_lesson(lesson_id, user)
    questions = _validate_questions(body.questions)
    await db.lessons.update_one({"id": lesson_id}, {"$set": {"quiz_questions": questions}})
    return {"questions": questions}


@router.delete("/studio/lessons/{lesson_id}/quiz")
async def delete_quiz(lesson_id: str, user: dict = Depends(get_current_user)):
    await _coach_lesson(lesson_id, user)
    await db.lessons.update_one({"id": lesson_id}, {"$set": {"quiz_questions": []}})
    return {"ok": True}


class GenerateBody(BaseModel):
    count: int = Field(default=5, ge=1, le=15)
    types: list[str] = Field(default_factory=lambda: ["multiple_choice", "true_false"])


@router.post("/studio/lessons/{lesson_id}/quiz/generate")
async def generate_quiz(lesson_id: str, body: GenerateBody, user: dict = Depends(get_current_user)):
    """AI drafts questions from the lesson's own text — returned for the coach
    to review/edit in the builder UI. Nothing is saved until PUT is called."""
    _, lesson = await _coach_lesson(lesson_id, user)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI quiz generation is not configured")

    types = [t for t in body.types if t in QUESTION_TYPES] or ["multiple_choice"]
    source_text = "\n\n".join(
        filter(None, [lesson.get("title"), lesson.get("summary"), (lesson.get("content") or "")[:4000]])
    )
    if len(source_text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="This lesson doesn't have enough written content yet for AI to write a quiz — add a summary or content first.",
        )

    system = (
        "You write short comprehension quizzes for an online fitness coaching platform. "
        "Given a lesson's title/summary/content, write clear, fair questions that test whether "
        "someone actually understood the material. Never use the word 'practitioner'. "
        f"Only use these question types: {', '.join(types)}. "
        "Respond with STRICT JSON only, no markdown fences, matching exactly: "
        '{"questions": [{"type": "multiple_choice", "question": "...", "options": ["...","...","..."], '
        '"correct_index": 0, "explanation": "..."}, {"type": "true_false", "question": "...", '
        '"correct_index": 0, "explanation": "..."}, {"type": "short_answer", "question": "...", '
        '"correct_text": "...", "explanation": "..."}]} '
        "For true_false, correct_index 0 means True and 1 means False."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"quiz_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        raw = await chat.send_message(
            UserMessage(text=f"Write {body.count} questions.\n\nLesson content:\n{source_text[:4000]}")
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI quiz generation unavailable: {str(exc)[:120]}")

    text = (raw if isinstance(raw, str) else str(raw)).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        parsed = json.loads(text)
        drafted = []
        for q in (parsed.get("questions") or [])[: body.count]:
            qtype = q.get("type")
            if qtype not in types:
                continue
            drafted.append({
                "id": f"q_{uuid.uuid4().hex[:10]}",
                "type": qtype,
                "question": str(q.get("question") or "")[:500],
                "options": (["True", "False"] if qtype == "true_false"
                            else [str(o)[:140] for o in (q.get("options") or [])][:6]),
                "correct_index": q.get("correct_index") if qtype != "short_answer" else None,
                "correct_text": str(q.get("correct_text") or "")[:200] if qtype == "short_answer" else None,
                "explanation": str(q.get("explanation") or "")[:400],
            })
        if not drafted:
            raise ValueError("no usable questions")
        return {"questions": drafted}
    except (json.JSONDecodeError, ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=502, detail="AI couldn't draft a quiz for this lesson — try again or build it manually")


# ---------------- client-facing: take & submit ----------------

@router.get("/lessons/{lesson_id}/quiz/take")
async def get_quiz_to_take(lesson_id: str, user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await require_course_access(user, lesson["course_id"])
    questions = lesson.get("quiz_questions") or []
    safe_questions = [
        {"id": q["id"], "type": q["type"], "question": q["question"], "options": q.get("options") or []}
        for q in questions
    ]
    last = await db.quiz_submissions.find_one(
        {"lesson_id": lesson_id, "user_id": user["user_id"]}, {"_id": 0}, sort=[("submitted_at", -1)]
    )
    return {
        "lesson_title": lesson.get("title"),
        "questions": safe_questions,
        "last_score": last.get("score") if last else None,
        "last_total": last.get("total") if last else None,
    }


def _grade(question: dict, answer) -> bool:
    if question["type"] in ("multiple_choice", "true_false"):
        try:
            return int(answer) == question.get("correct_index")
        except (TypeError, ValueError):
            return False
    correct = (question.get("correct_text") or "").strip().lower()
    given = str(answer if answer is not None else "").strip().lower()
    return bool(correct) and given == correct


class SubmitAnswer(BaseModel):
    question_id: str
    answer: object = None


class SubmitBody(BaseModel):
    answers: list[SubmitAnswer] = Field(default_factory=list)


@router.post("/lessons/{lesson_id}/quiz/submit")
async def submit_quiz(lesson_id: str, body: SubmitBody, user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    course, _ = await require_course_access(user, lesson["course_id"])
    questions = lesson.get("quiz_questions") or []
    if not questions:
        raise HTTPException(status_code=400, detail="This lesson has no quiz")

    given_by_id = {a.question_id: a.answer for a in body.answers}
    results = []
    correct_count = 0
    for q in questions:
        given = given_by_id.get(q["id"])
        is_correct = _grade(q, given)
        if is_correct:
            correct_count += 1
        results.append({
            "question_id": q["id"],
            "correct": is_correct,
            "correct_index": q.get("correct_index"),
            "correct_text": q.get("correct_text"),
            "explanation": q.get("explanation") or "",
        })

    submission = {
        "id": f"qs_{uuid.uuid4().hex[:12]}",
        "lesson_id": lesson_id,
        "course_id": lesson["course_id"],
        "coach_id": course["coach_id"],
        "user_id": user["user_id"],
        "answers": [a.model_dump() for a in body.answers],
        "score": correct_count,
        "total": len(questions),
        "submitted_at": datetime.now(timezone.utc),
    }
    await db.quiz_submissions.insert_one(dict(submission))

    return {"score": correct_count, "total": len(questions), "results": results}
