"""Modular platform layer: per-coach feature flags + server-enforced ownership guards.

Every new module (courses, community, crm, landing, memberships, assistant, files)
routes through here so it can be switched on/off per coach without touching the
existing core app (programs, sessions, chat, logs, payments).
"""
from fastapi import HTTPException

from db import db

# key -> (label, description, default_enabled)
MODULES: dict[str, tuple[str, str, bool]] = {
    "courses": ("Courses & Cohorts", "Courses, lessons, drip release schedules and cohorts", False),
    "coaching": ("Coaching Plans", "Milestones, goals, action plans, assignments and session notes", False),
    "community": ("Community", "Program feeds, announcements and events", False),
    "crm": ("Contacts & Leads", "Lead capture, lifecycle statuses and audience segments", False),
    "landing": ("Landing Pages", "Public shareable program pages", False),
    "memberships": ("Memberships", "Recurring access with grace-period rules", False),
    "assistant": ("Coach Assistant", "Consent-based drafting of agendas and summaries", False),
    "files": ("Private Library", "Worksheets, recordings and PDFs in private storage", False),
    "automations": ("Automations", "Rule-based workflows that react to lessons, check-ins and memberships", False),
}

DEFAULT_FLAGS = {k: v[2] for k, v in MODULES.items()}


def require_coach(user: dict) -> None:
    if user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Coach access required")


def require_client(user: dict) -> None:
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client access required")


async def get_flags(coach_id: str) -> dict[str, bool]:
    doc = await db.feature_flags.find_one({"coach_id": coach_id}, {"_id": 0})
    saved = (doc or {}).get("flags") or {}
    return {k: bool(saved.get(k, default)) for k, default in DEFAULT_FLAGS.items()}


async def set_flags(coach_id: str, flags: dict) -> dict[str, bool]:
    current = await get_flags(coach_id)
    for k, v in flags.items():
        if k in DEFAULT_FLAGS:
            current[k] = bool(v)
    await db.feature_flags.update_one(
        {"coach_id": coach_id}, {"$set": {"coach_id": coach_id, "flags": current}}, upsert=True
    )
    return current


def workspace_coach_id(user: dict) -> str:
    """The coach whose workspace this user belongs to (coach = self, client = their coach)."""
    if user.get("role") == "coach":
        return user["user_id"]
    coach_id = user.get("coach_id")
    if not coach_id:
        raise HTTPException(status_code=403, detail="You are not connected to a coach yet")
    return coach_id


async def require_module(user: dict, key: str) -> str:
    """Ensure the module is enabled in the user's workspace. Returns the coach_id."""
    coach_id = workspace_coach_id(user)
    flags = await get_flags(coach_id)
    if not flags.get(key):
        label = MODULES.get(key, (key,))[0]
        raise HTTPException(status_code=403, detail=f"{label} is not enabled")
    return coach_id


async def owned(collection, doc_id: str, coach_id: str, what: str = "Item") -> dict:
    """Fetch a doc that must belong to this coach, else 404 (never leak existence)."""
    doc = await collection.find_one({"id": doc_id, "coach_id": coach_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return doc


async def require_own_client(coach_id: str, client_id: str) -> dict:
    client = await db.users.find_one({"user_id": client_id, "coach_id": coach_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


async def course_enrollment(user_id: str, course_id: str) -> dict | None:
    return await db.course_enrollments.find_one(
        {"course_id": course_id, "user_id": user_id}, {"_id": 0}
    )


async def require_course_access(user: dict, course_id: str) -> tuple[dict, dict | None]:
    """Coach owner gets full access; client needs an active (non-revoked) enrollment."""
    course = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.get("coach_id") == user["user_id"]:
        return course, None
    enrollment = await course_enrollment(user["user_id"], course_id)
    if not enrollment or enrollment.get("access") == "revoked":
        raise HTTPException(status_code=403, detail="You don't have access to this course")
    if enrollment.get("access") == "paused":
        raise HTTPException(status_code=402, detail="Access paused — payment required")
    return course, enrollment
