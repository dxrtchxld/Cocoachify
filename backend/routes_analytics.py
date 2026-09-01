"""Coach dashboard metrics + program/course performance analytics."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user
from db import db
from modules import owned, require_coach

router = APIRouter(prefix="/studio/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(user: dict = Depends(get_current_user)):
    require_coach(user)
    coach_id = user["user_id"]
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    client_ids = [
        c["user_id"]
        for c in await db.users.find({"coach_id": coach_id}, {"_id": 0, "user_id": 1}).to_list(1000)
    ]
    active_ids: set[str] = set()
    if client_ids:
        recent = await db.client_logs.find(
            {"user_id": {"$in": client_ids}, "date": {"$gte": week_ago}}, {"_id": 0, "user_id": 1}
        ).to_list(2000)
        active_ids = {r["user_id"] for r in recent}
        recent_lessons = await db.lesson_completions.find(
            {"coach_id": coach_id, "completed_at": {"$gte": week_ago}}, {"_id": 0, "user_id": 1}
        ).to_list(2000)
        active_ids |= {r["user_id"] for r in recent_lessons}

    enrollments = await db.course_enrollments.find({"coach_id": coach_id}, {"_id": 0}).to_list(2000)
    lesson_counts: dict[str, int] = {}
    for c in await db.courses.find({"coach_id": coach_id}, {"_id": 0, "id": 1}).to_list(500):
        lesson_counts[c["id"]] = await db.lessons.count_documents({"course_id": c["id"]})
    progresses = []
    for e in enrollments:
        total = lesson_counts.get(e["course_id"], 0)
        if total:
            progresses.append(len(e.get("completed_lesson_ids") or []) / total * 100)

    purchases = await db.purchases.find(
        {"coach_id": coach_id, "active": True}, {"_id": 0, "amount": 1, "fulfilled_at": 1}
    ).to_list(2000)
    revenue_all = round(sum(p.get("amount") or 0 for p in purchases), 2)
    revenue_30 = round(
        sum(
            p.get("amount") or 0
            for p in purchases
            if isinstance(p.get("fulfilled_at"), datetime)
            and (p["fulfilled_at"].replace(tzinfo=timezone.utc) if p["fulfilled_at"].tzinfo is None else p["fulfilled_at"]) >= now - timedelta(days=30)
        ),
        2,
    )

    return {
        "clients": len(client_ids),
        "active_clients_7d": len(active_ids),
        "active_pct": round(len(active_ids) / len(client_ids) * 100) if client_ids else 0,
        "programs": await db.programs.count_documents({"owner_id": coach_id}),
        "courses": await db.courses.count_documents({"coach_id": coach_id}),
        "published_courses": await db.courses.count_documents({"coach_id": coach_id, "status": "published"}),
        "course_enrollments": len(enrollments),
        "avg_course_progress": round(sum(progresses) / len(progresses)) if progresses else 0,
        "lessons_completed_7d": await db.lesson_completions.count_documents(
            {"coach_id": coach_id, "completed_at": {"$gte": week_ago}}
        ),
        "leads": await db.contacts.count_documents({"coach_id": coach_id, "lifecycle": "lead"}),
        "contacts": await db.contacts.count_documents({"coach_id": coach_id}),
        "checkins_pending": await db.checkin_responses.count_documents(
            {"coach_id": coach_id, "reviewed": False}
        ),
        "assignments_awaiting_review": await db.assignments.count_documents(
            {"coach_id": coach_id, "status": "submitted"}
        ),
        "revenue_total": revenue_all,
        "revenue_30d": revenue_30,
    }


class _Empty(BaseModel):
    pass


@router.get("/courses/{course_id}")
async def course_performance(course_id: str, user: dict = Depends(get_current_user)):
    require_coach(user)
    coach_id = user["user_id"]
    course = await owned(db.courses, course_id, coach_id, "Course")
    lessons = await db.lessons.find({"course_id": course_id}, {"_id": 0}).sort("order", 1).to_list(500)
    enrollments = await db.course_enrollments.find({"course_id": course_id}, {"_id": 0}).to_list(2000)
    total_lessons = len(lessons)
    n = len(enrollments)

    per_lesson = []
    drop_off = None
    for l in lessons:
        done = sum(1 for e in enrollments if l["id"] in (e.get("completed_lesson_ids") or []))
        pct = round(done / n * 100) if n else 0
        per_lesson.append({"lesson_id": l["id"], "title": l["title"], "completed": done, "pct": pct})
        if drop_off is None and n and pct < 50:
            drop_off = {"lesson_id": l["id"], "title": l["title"], "pct": pct}

    progresses = [
        (len(e.get("completed_lesson_ids") or []) / total_lessons * 100) if total_lessons else 0
        for e in enrollments
    ]
    completed = sum(1 for p in progresses if p >= 100)
    return {
        "course": {"id": course["id"], "title": course["title"], "status": course.get("status")},
        "enrollments": n,
        "active": sum(1 for e in enrollments if e.get("access") == "active"),
        "paused": sum(1 for e in enrollments if e.get("access") == "paused"),
        "lesson_count": total_lessons,
        "avg_progress": round(sum(progresses) / n) if n else 0,
        "completion_rate": round(completed / n * 100) if n else 0,
        "per_lesson": per_lesson,
        "drop_off": drop_off,
    }
