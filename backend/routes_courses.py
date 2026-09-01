"""Courses, modules, lessons, drip release schedules, cohorts and enrollments."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, user_public
from db import db
from modules import (
    owned,
    require_coach,
    require_course_access,
    require_module,
    require_own_client,
)

router = APIRouter(prefix="/studio", tags=["courses"])


def _aware(dt) -> datetime | None:
    if not isinstance(dt, datetime):
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _iso(dt):
    d = _aware(dt)
    return d.isoformat() if d else dt


# ---------------- Courses ----------------

class CourseBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    subtitle: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=5000)
    category: str = Field(default="fitness", max_length=40)
    cover_image: str | None = Field(default=None, max_length=500)
    pricing_type: str = Field(default="free", pattern="^(free|one_time|membership)$")
    price: float = Field(default=0, ge=0, le=100000)
    status: str = Field(default="draft", pattern="^(draft|published)$")
    slug: str | None = Field(default=None, max_length=80)


def _course_public(c: dict, extra: dict | None = None) -> dict:
    out = {
        "id": c["id"],
        "title": c["title"],
        "subtitle": c.get("subtitle", ""),
        "description": c.get("description", ""),
        "category": c.get("category", "fitness"),
        "cover_image": c.get("cover_image"),
        "pricing_type": c.get("pricing_type", "free"),
        "price": c.get("price", 0),
        "status": c.get("status", "draft"),
        "slug": c.get("slug"),
        "created_at": _iso(c.get("created_at")),
    }
    if extra:
        out.update(extra)
    return out


def _slugify(text: str) -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean[:60] or uuid.uuid4().hex[:8]


@router.get("/courses")
async def list_courses(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    if user.get("role") == "coach":
        courses = await db.courses.find({"coach_id": coach_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        out = []
        for c in courses:
            lessons = await db.lessons.count_documents({"course_id": c["id"]})
            enrolled = await db.course_enrollments.count_documents({"course_id": c["id"]})
            out.append(_course_public(c, {"lesson_count": lessons, "enrolled_count": enrolled}))
        return out
    # Client: courses they are enrolled in
    enrollments = await db.course_enrollments.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).to_list(200)
    by_course = {e["course_id"]: e for e in enrollments}
    courses = await db.courses.find({"id": {"$in": list(by_course)}}, {"_id": 0}).to_list(200)
    out = []
    for c in courses:
        e = by_course[c["id"]]
        total = await db.lessons.count_documents({"course_id": c["id"]})
        done = len(e.get("completed_lesson_ids") or [])
        out.append(_course_public(c, {
            "lesson_count": total,
            "completed_count": done,
            "progress_pct": round(done / total * 100) if total else 0,
            "access": e.get("access", "active"),
            "last_lesson_id": e.get("last_lesson_id"),
        }))
    return out


@router.post("/courses", status_code=201)
async def create_course(body: CourseBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    slug_base = _slugify(body.slug or body.title)
    slug = slug_base
    while await db.courses.find_one({"slug": slug}, {"_id": 0, "id": 1}):
        slug = f"{slug_base}-{uuid.uuid4().hex[:4]}"
    course = {
        "id": f"crs_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        **body.model_dump(exclude={"slug"}),
        "slug": slug,
        "created_at": datetime.now(timezone.utc),
    }
    await db.courses.insert_one(dict(course))
    return _course_public(course, {"lesson_count": 0, "enrolled_count": 0})


@router.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    course, enrollment = await require_course_access(user, course_id)
    mods = await db.course_modules.find({"course_id": course_id}, {"_id": 0}).sort("order", 1).to_list(100)
    lessons = await db.lessons.find({"course_id": course_id}, {"_id": 0}).sort("order", 1).to_list(500)
    is_coach = course["coach_id"] == user["user_id"]

    start = None
    if enrollment:
        start = _aware(enrollment.get("started_at"))
        if enrollment.get("cohort_id"):
            cohort = await db.cohorts.find_one({"id": enrollment["cohort_id"]}, {"_id": 0})
            if cohort and cohort.get("start_date"):
                start = _aware(cohort["start_date"]) or start
    done_ids = set((enrollment or {}).get("completed_lesson_ids") or [])

    shaped = []
    for l in lessons:
        item = _lesson_public(l, is_coach)
        if is_coach:
            item["unlocked"] = True
        else:
            item["unlocked"] = _is_unlocked(l, start)
            item["completed"] = l["id"] in done_ids
            if not item["unlocked"]:
                item.pop("content", None)
                item.pop("video_url", None)
                item.pop("video_file_id", None)
                item["attachments"] = []
        shaped.append(item)

    by_module: dict[str, list] = {}
    for item in shaped:
        by_module.setdefault(item.get("module_id") or "_none", []).append(item)

    sections = [
        {"id": m["id"], "title": m["title"], "order": m.get("order", 0), "lessons": by_module.get(m["id"], [])}
        for m in mods
    ]
    if by_module.get("_none"):
        sections.append({"id": None, "title": "Lessons", "order": 999, "lessons": by_module["_none"]})

    total = len(lessons)
    out = _course_public(course, {
        "sections": sections,
        "lesson_count": total,
        "is_owner": is_coach,
    })
    if enrollment:
        out["enrollment"] = {
            "id": enrollment["id"],
            "access": enrollment.get("access", "active"),
            "started_at": _iso(enrollment.get("started_at")),
            "last_lesson_id": enrollment.get("last_lesson_id"),
            "completed_count": len(done_ids),
            "progress_pct": round(len(done_ids) / total * 100) if total else 0,
            "grace_until": _iso(enrollment.get("grace_until")),
        }
    if is_coach:
        out["enrolled_count"] = await db.course_enrollments.count_documents({"course_id": course_id})
        out["cohorts"] = [
            {**c, "start_date": _iso(c.get("start_date")), "end_date": _iso(c.get("end_date"))}
            for c in await db.cohorts.find({"course_id": course_id}, {"_id": 0}).sort("start_date", 1).to_list(50)
        ]
    return out


@router.put("/courses/{course_id}")
async def update_course(course_id: str, body: CourseBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    update = body.model_dump(exclude={"slug"})
    if body.slug:
        slug = _slugify(body.slug)
        clash = await db.courses.find_one({"slug": slug, "id": {"$ne": course_id}}, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(status_code=400, detail="That link is already taken")
        update["slug"] = slug
    await db.courses.update_one({"id": course_id}, {"$set": update})
    return _course_public(await db.courses.find_one({"id": course_id}, {"_id": 0}))


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    await db.courses.delete_one({"id": course_id})
    await db.course_modules.delete_many({"course_id": course_id})
    await db.lessons.delete_many({"course_id": course_id})
    await db.cohorts.delete_many({"course_id": course_id})
    await db.course_enrollments.delete_many({"course_id": course_id})
    return {"ok": True}


# ---------------- Sections (course modules) ----------------

class SectionBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    order: int = Field(default=0, ge=0, le=999)


@router.post("/courses/{course_id}/sections", status_code=201)
async def create_section(course_id: str, body: SectionBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    count = await db.course_modules.count_documents({"course_id": course_id})
    section = {
        "id": f"sec_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "course_id": course_id,
        "title": body.title.strip(),
        "order": body.order or count,
        "created_at": datetime.now(timezone.utc),
    }
    await db.course_modules.insert_one(dict(section))
    return {"id": section["id"], "title": section["title"], "order": section["order"], "lessons": []}


@router.put("/sections/{section_id}")
async def update_section(section_id: str, body: SectionBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.course_modules, section_id, coach_id, "Section")
    await db.course_modules.update_one(
        {"id": section_id}, {"$set": {"title": body.title.strip(), "order": body.order}}
    )
    return {"ok": True}


@router.delete("/sections/{section_id}")
async def delete_section(section_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.course_modules, section_id, coach_id, "Section")
    await db.course_modules.delete_one({"id": section_id})
    await db.lessons.update_many({"module_id": section_id}, {"$set": {"module_id": None}})
    return {"ok": True}


# ---------------- Lessons ----------------

class ReleaseBody(BaseModel):
    type: str = Field(default="immediate", pattern="^(immediate|day_offset|date)$")
    day_offset: int = Field(default=0, ge=0, le=730)
    date: datetime | None = None


class LessonBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    summary: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=20000)
    video_url: str | None = Field(default=None, max_length=500)
    video_file_id: str | None = Field(default=None, max_length=64)
    duration_minutes: int = Field(default=0, ge=0, le=600)
    module_id: str | None = None
    order: int = Field(default=0, ge=0, le=999)
    attachments: list[str] = Field(default_factory=list)
    release: ReleaseBody = Field(default_factory=ReleaseBody)


def _lesson_public(l: dict, is_coach: bool) -> dict:
    out = {
        "id": l["id"],
        "course_id": l["course_id"],
        "module_id": l.get("module_id"),
        "title": l["title"],
        "summary": l.get("summary", ""),
        "content": l.get("content", ""),
        "video_url": l.get("video_url"),
        "video_file_id": l.get("video_file_id"),
        "duration_minutes": l.get("duration_minutes", 0),
        "order": l.get("order", 0),
        "attachments": l.get("attachments") or [],
        "release": l.get("release") or {"type": "immediate", "day_offset": 0, "date": None},
    }
    if out["release"].get("date"):
        out["release"] = {**out["release"], "date": _iso(out["release"]["date"])}
    if is_coach:
        out["coach_note"] = l.get("coach_note", "")
    return out


def _is_unlocked(lesson: dict, start: datetime | None) -> bool:
    rel = lesson.get("release") or {}
    kind = rel.get("type", "immediate")
    now = datetime.now(timezone.utc)
    if kind == "immediate":
        return True
    if kind == "date":
        d = _aware(rel.get("date"))
        return bool(d and d <= now)
    if kind == "day_offset":
        if not start:
            return False
        return now >= start + timedelta(days=int(rel.get("day_offset") or 0))
    return True


async def _valid_attachments(file_ids: list[str], coach_id: str) -> list[str]:
    if not file_ids:
        return []
    files = await db.private_files.find(
        {"id": {"$in": file_ids}, "coach_id": coach_id}, {"_id": 0, "id": 1}
    ).to_list(50)
    return [f["id"] for f in files]


@router.post("/courses/{course_id}/lessons", status_code=201)
async def create_lesson(course_id: str, body: LessonBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    count = await db.lessons.count_documents({"course_id": course_id})
    lesson = {
        "id": f"les_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "course_id": course_id,
        **body.model_dump(exclude={"attachments", "release"}),
        "attachments": await _valid_attachments(body.attachments, coach_id),
        "release": body.release.model_dump(),
        "order": body.order or count,
        "created_at": datetime.now(timezone.utc),
    }
    await db.lessons.insert_one(dict(lesson))
    return _lesson_public(lesson, True)


@router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    course, enrollment = await require_course_access(user, lesson["course_id"])
    is_coach = course["coach_id"] == user["user_id"]
    if not is_coach:
        start = _aware((enrollment or {}).get("started_at"))
        if enrollment and enrollment.get("cohort_id"):
            cohort = await db.cohorts.find_one({"id": enrollment["cohort_id"]}, {"_id": 0})
            if cohort and cohort.get("start_date"):
                start = _aware(cohort["start_date"]) or start
        if not _is_unlocked(lesson, start):
            raise HTTPException(status_code=403, detail="This lesson hasn't been released yet")
        await db.course_enrollments.update_one(
            {"id": enrollment["id"]},
            {"$set": {"last_lesson_id": lesson_id, "last_seen_at": datetime.now(timezone.utc)}},
        )
    out = _lesson_public(lesson, is_coach)
    files = await db.private_files.find(
        {"id": {"$in": out["attachments"]}}, {"_id": 0}
    ).to_list(50)
    out["attachment_files"] = [
        {"id": f["id"], "title": f.get("title"), "kind": f.get("kind"), "url": f"/api/files/private/{f['id']}"}
        for f in files
    ]
    out["course_title"] = course["title"]
    if enrollment:
        out["completed"] = lesson_id in (enrollment.get("completed_lesson_ids") or [])
    return out


@router.put("/lessons/{lesson_id}")
async def update_lesson(lesson_id: str, body: LessonBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.lessons, lesson_id, coach_id, "Lesson")
    update = {
        **body.model_dump(exclude={"attachments", "release"}),
        "attachments": await _valid_attachments(body.attachments, coach_id),
        "release": body.release.model_dump(),
    }
    await db.lessons.update_one({"id": lesson_id}, {"$set": update})
    return _lesson_public(await db.lessons.find_one({"id": lesson_id}, {"_id": 0}), True)


@router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.lessons, lesson_id, coach_id, "Lesson")
    await db.lessons.delete_one({"id": lesson_id})
    await db.course_enrollments.update_many(
        {"completed_lesson_ids": lesson_id}, {"$pull": {"completed_lesson_ids": lesson_id}}
    )
    return {"ok": True}


@router.post("/lessons/{lesson_id}/complete")
async def complete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    course, enrollment = await require_course_access(user, lesson["course_id"])
    if not enrollment:
        raise HTTPException(status_code=400, detail="Only enrolled clients can complete lessons")
    await db.course_enrollments.update_one(
        {"id": enrollment["id"]},
        {
            "$addToSet": {"completed_lesson_ids": lesson_id},
            "$set": {"last_lesson_id": lesson_id, "last_seen_at": datetime.now(timezone.utc)},
        },
    )
    await db.lesson_completions.update_one(
        {"user_id": user["user_id"], "lesson_id": lesson_id},
        {"$setOnInsert": {
            "id": f"lc_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "course_id": lesson["course_id"],
            "coach_id": course["coach_id"],
            "lesson_id": lesson_id,
            "completed_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    updated = await db.course_enrollments.find_one({"id": enrollment["id"]}, {"_id": 0})
    total = await db.lessons.count_documents({"course_id": lesson["course_id"]})
    done = len(updated.get("completed_lesson_ids") or [])

    from routes_growth import issue_certificate_if_complete

    certificate = await issue_certificate_if_complete(user["user_id"], lesson["course_id"])
    return {
        "ok": True,
        "completed_count": done,
        "progress_pct": round(done / total * 100) if total else 0,
        "certificate": {"id": certificate["id"], "code": certificate["code"],
                        "course_title": certificate.get("course_title")} if certificate else None,
    }


@router.post("/lessons/{lesson_id}/uncomplete")
async def uncomplete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    _, enrollment = await require_course_access(user, lesson["course_id"])
    if not enrollment:
        raise HTTPException(status_code=400, detail="Not enrolled")
    await db.course_enrollments.update_one(
        {"id": enrollment["id"]}, {"$pull": {"completed_lesson_ids": lesson_id}}
    )
    await db.lesson_completions.delete_one({"user_id": user["user_id"], "lesson_id": lesson_id})
    return {"ok": True}


# ---------------- Cohorts ----------------

class CohortBody(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    start_date: datetime
    end_date: datetime | None = None
    capacity: int = Field(default=0, ge=0, le=10000)


@router.post("/courses/{course_id}/cohorts", status_code=201)
async def create_cohort(course_id: str, body: CohortBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    cohort = {
        "id": f"coh_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "course_id": course_id,
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc),
    }
    await db.cohorts.insert_one(dict(cohort))
    return {**cohort, "start_date": _iso(cohort["start_date"]), "end_date": _iso(cohort.get("end_date")),
            "created_at": _iso(cohort["created_at"])}


@router.delete("/cohorts/{cohort_id}")
async def delete_cohort(cohort_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.cohorts, cohort_id, coach_id, "Cohort")
    await db.cohorts.delete_one({"id": cohort_id})
    await db.course_enrollments.update_many({"cohort_id": cohort_id}, {"$set": {"cohort_id": None}})
    return {"ok": True}


# ---------------- Enrollments ----------------

class EnrollBody(BaseModel):
    client_id: str = Field(min_length=1)
    cohort_id: str | None = None


async def enroll_client(coach_id: str, course_id: str, client_id: str,
                        cohort_id: str | None = None, source: str = "coach") -> dict:
    """Idempotent enrollment (re-activates a paused/revoked one instead of duplicating)."""
    existing = await db.course_enrollments.find_one(
        {"course_id": course_id, "user_id": client_id}, {"_id": 0}
    )
    if existing:
        await db.course_enrollments.update_one(
            {"id": existing["id"]},
            {"$set": {"access": "active", "cohort_id": cohort_id or existing.get("cohort_id"),
                      "grace_until": None}},
        )
        return await db.course_enrollments.find_one({"id": existing["id"]}, {"_id": 0})
    enrollment = {
        "id": f"cenr_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "course_id": course_id,
        "user_id": client_id,
        "cohort_id": cohort_id,
        "access": "active",
        "source": source,
        "started_at": datetime.now(timezone.utc),
        "completed_lesson_ids": [],
        "last_lesson_id": None,
        "grace_until": None,
    }
    await db.course_enrollments.insert_one(dict(enrollment))
    enrollment.pop("_id", None)
    return enrollment


@router.post("/courses/{course_id}/enroll", status_code=201)
async def enroll(course_id: str, body: EnrollBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    await require_own_client(coach_id, body.client_id)
    if body.cohort_id:
        await owned(db.cohorts, body.cohort_id, coach_id, "Cohort")
    enrollment = await enroll_client(coach_id, course_id, body.client_id, body.cohort_id)
    return {**enrollment, "started_at": _iso(enrollment.get("started_at"))}


@router.get("/courses/{course_id}/enrollments")
async def list_enrollments(course_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.courses, course_id, coach_id, "Course")
    enrollments = await db.course_enrollments.find({"course_id": course_id}, {"_id": 0}).to_list(500)
    total = await db.lessons.count_documents({"course_id": course_id})
    ids = [e["user_id"] for e in enrollments]
    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    umap = {u["user_id"]: u for u in users}
    out = []
    for e in enrollments:
        u = umap.get(e["user_id"])
        done = len(e.get("completed_lesson_ids") or [])
        out.append({
            "id": e["id"],
            "client": user_public(u) if u else {"user_id": e["user_id"], "name": "Unknown"},
            "access": e.get("access", "active"),
            "cohort_id": e.get("cohort_id"),
            "source": e.get("source"),
            "started_at": _iso(e.get("started_at")),
            "last_seen_at": _iso(e.get("last_seen_at")),
            "completed_count": done,
            "progress_pct": round(done / total * 100) if total else 0,
        })
    out.sort(key=lambda e: -(e["progress_pct"] or 0))
    return out


class AccessBody(BaseModel):
    access: str = Field(pattern="^(active|paused|revoked)$")


@router.put("/enrollments/{enrollment_id}/access")
async def set_access(enrollment_id: str, body: AccessBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.course_enrollments, enrollment_id, coach_id, "Enrollment")
    await db.course_enrollments.update_one(
        {"id": enrollment_id}, {"$set": {"access": body.access, "grace_until": None}}
    )
    return {"ok": True, "access": body.access}


@router.delete("/enrollments/{enrollment_id}")
async def remove_enrollment(enrollment_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    await owned(db.course_enrollments, enrollment_id, coach_id, "Enrollment")
    await db.course_enrollments.delete_one({"id": enrollment_id})
    return {"ok": True}


# ---------------- Client "continue where you left off" ----------------

@router.get("/continue")
async def continue_learning(user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    enrollments = await db.course_enrollments.find(
        {"user_id": user["user_id"], "access": "active"}, {"_id": 0}
    ).to_list(50)
    if not enrollments:
        return {"resume": None}
    enrollments.sort(key=lambda e: _aware(e.get("last_seen_at")) or _aware(e.get("started_at")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    for e in enrollments:
        course = await db.courses.find_one({"id": e["course_id"]}, {"_id": 0})
        if not course:
            continue
        lessons = await db.lessons.find({"course_id": e["course_id"]}, {"_id": 0}).sort("order", 1).to_list(500)
        if not lessons:
            continue
        start = _aware(e.get("started_at"))
        if e.get("cohort_id"):
            cohort = await db.cohorts.find_one({"id": e["cohort_id"]}, {"_id": 0})
            if cohort and cohort.get("start_date"):
                start = _aware(cohort["start_date"]) or start
        done = set(e.get("completed_lesson_ids") or [])
        nxt = next((l for l in lessons if l["id"] not in done and _is_unlocked(l, start)), None)
        total = len(lessons)
        return {
            "resume": {
                "course_id": course["id"],
                "course_title": course["title"],
                "cover_image": course.get("cover_image"),
                "category": course.get("category"),
                "lesson_id": nxt["id"] if nxt else None,
                "lesson_title": nxt["title"] if nxt else "All caught up",
                "duration_minutes": nxt.get("duration_minutes", 0) if nxt else 0,
                "completed_count": len(done),
                "lesson_count": total,
                "progress_pct": round(len(done) / total * 100) if total else 0,
            }
        }
    return {"resume": None}
