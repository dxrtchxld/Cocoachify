import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db

router = APIRouter(tags=["programs"])

CATEGORIES = {"fitness", "breathwork", "yoga", "mobility", "mindfulness"}
LENGTHS = {7, 14, 21, 28, 42, 56, 84}


def _program_summary(p: dict) -> dict:
    schedule = p.get("schedule", [])
    return {
        "id": p["id"],
        "name": p["name"],
        "description": p.get("description", ""),
        "category": p.get("category", "fitness"),
        "total_days": p["total_days"],
        "days_per_week": p.get("days_per_week", 0),
        "difficulty": p.get("difficulty", "beginner"),
        "spotify_url": p.get("spotify_url"),
        "owner_id": p.get("owner_id"),
        "session_count": len([s for s in schedule if s]),
        "created_at": p["created_at"].isoformat() if isinstance(p.get("created_at"), datetime) else p.get("created_at"),
    }


async def _expand_schedule(program: dict) -> list[dict]:
    session_ids = [s for s in program.get("schedule", []) if s]
    sessions = await db.coaching_sessions.find(
        {"id": {"$in": list(set(session_ids))}}, {"_id": 0}
    ).to_list(200)
    session_map = {s["id"]: s for s in sessions}
    out = []
    for i, sid in enumerate(program.get("schedule", [])):
        if sid and sid in session_map:
            s = session_map[sid]
            out.append({
                "day": i + 1,
                "session_id": sid,
                "session_name": s["name"],
                "session_type": s.get("session_type", "workout"),
                "target_minutes": s.get("target_minutes", 0),
            })
        else:
            out.append({
                "day": i + 1,
                "session_id": None,
                "session_name": "Rest Day",
                "session_type": "rest",
                "target_minutes": 0,
            })
    return out


@router.get("/programs")
async def list_programs(user: dict = Depends(get_current_user)):
    if user.get("role") == "coach":
        cursor = db.programs.find({"owner_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
        return [_program_summary(p) for p in await cursor.to_list(500)]
    # Client: programs they are (or were) enrolled in
    enrollments = await db.user_programs.find(
        {"user_id": user["user_id"]}, {"_id": 0, "program_id": 1}
    ).to_list(100)
    ids = list({e["program_id"] for e in enrollments})
    programs = await db.programs.find({"id": {"$in": ids}}, {"_id": 0}).to_list(100)
    return [_program_summary(p) for p in programs]


async def _can_view_program(user: dict, program: dict) -> bool:
    if program.get("owner_id") == user["user_id"]:
        return True
    enrollment = await db.user_programs.find_one(
        {"user_id": user["user_id"], "program_id": program["id"]}, {"_id": 0}
    )
    return enrollment is not None


@router.get("/programs/{program_id}")
async def get_program(program_id: str, user: dict = Depends(get_current_user)):
    program = await db.programs.find_one({"id": program_id}, {"_id": 0})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if not await _can_view_program(user, program):
        raise HTTPException(status_code=403, detail="Not authorized to view this program")
    result = _program_summary(program)
    result["schedule"] = await _expand_schedule(program)
    result["enrollment"] = await db.user_programs.find_one(
        {"user_id": user["user_id"], "program_id": program_id, "active": True},
        {"_id": 0},
    )
    return result


class ProgramBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="fitness")
    difficulty: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")
    total_days: int = Field(default=28)
    days_per_week: int = Field(default=3, ge=1, le=7)
    spotify_url: str | None = Field(default=None, max_length=500)
    schedule: list[str | None] | None = None


def _validate_program(body: ProgramBody) -> None:
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of {sorted(CATEGORIES)}")
    if body.total_days not in LENGTHS:
        raise HTTPException(status_code=400, detail=f"Length must be one of {sorted(LENGTHS)} days")
    if body.schedule is not None and len(body.schedule) != body.total_days:
        raise HTTPException(status_code=400, detail="Schedule length must equal total_days")


async def _validate_schedule_sessions(schedule: list, coach_id: str) -> None:
    ids = list({s for s in schedule if s})
    if not ids:
        return
    count = await db.coaching_sessions.count_documents({"id": {"$in": ids}, "owner_id": coach_id})
    if count != len(ids):
        raise HTTPException(status_code=400, detail="Schedule contains unknown sessions")


def _require_coach(user: dict) -> None:
    if user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Coach access required")


@router.post("/programs", status_code=201)
async def create_program(body: ProgramBody, user: dict = Depends(get_current_user)):
    _require_coach(user)
    _validate_program(body)
    schedule = body.schedule if body.schedule is not None else [None] * body.total_days
    await _validate_schedule_sessions(schedule, user["user_id"])
    program = {
        "id": f"prog_{uuid.uuid4().hex[:12]}",
        "name": body.name.strip(),
        "description": body.description.strip(),
        "category": body.category,
        "difficulty": body.difficulty,
        "total_days": body.total_days,
        "days_per_week": body.days_per_week,
        "spotify_url": body.spotify_url,
        "schedule": schedule,
        "owner_id": user["user_id"],
        "created_at": datetime.now(timezone.utc),
    }
    await db.programs.insert_one(dict(program))
    program.pop("_id", None)
    program["created_at"] = program["created_at"].isoformat()
    return program


@router.put("/programs/{program_id}")
async def update_program(program_id: str, body: ProgramBody, user: dict = Depends(get_current_user)):
    program = await db.programs.find_one({"id": program_id}, {"_id": 0})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if program.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own programs")
    _validate_program(body)
    schedule = body.schedule
    if schedule is None:
        # Keep existing schedule, resized to the new length
        old = program.get("schedule", [])
        schedule = (old + [None] * body.total_days)[: body.total_days]
    await _validate_schedule_sessions(schedule, user["user_id"])
    update = {
        "name": body.name.strip(),
        "description": body.description.strip(),
        "category": body.category,
        "difficulty": body.difficulty,
        "total_days": body.total_days,
        "days_per_week": body.days_per_week,
        "spotify_url": body.spotify_url,
        "schedule": schedule,
    }
    await db.programs.update_one({"id": program_id}, {"$set": update})
    updated = await db.programs.find_one({"id": program_id}, {"_id": 0})
    result = _program_summary(updated)
    result["schedule"] = await _expand_schedule(updated)
    return result


@router.delete("/programs/{program_id}")
async def delete_program(program_id: str, user: dict = Depends(get_current_user)):
    program = await db.programs.find_one({"id": program_id}, {"_id": 0})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if program.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own programs")
    await db.programs.delete_one({"id": program_id})
    await db.user_programs.update_many(
        {"program_id": program_id, "active": True}, {"$set": {"active": False}}
    )
    return {"ok": True}


# ---------- Sessions (coach-authored, block-based) ----------

class SessionExercise(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    block_label: str = Field(default="", max_length=60)
    sets: int | None = Field(default=None, ge=1, le=20)
    reps: str | None = Field(default=None, max_length=40)
    duration_seconds: int | None = Field(default=None, ge=1, le=7200)
    rest_seconds: int | None = Field(default=None, ge=0, le=900)
    form_note: str | None = Field(default=None, max_length=500)
    purpose_note: str | None = Field(default=None, max_length=500)


class SessionBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    session_type: str = Field(default="workout", max_length=30)
    target_minutes: int = Field(default=45, ge=0, le=300)
    warmup_notes: str = Field(default="", max_length=1000)
    finisher_notes: str = Field(default="", max_length=1000)
    coach_notes: str = Field(default="", max_length=1000)
    exercises: list[SessionExercise] = Field(default_factory=list)


@router.get("/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    sessions = await db.coaching_sessions.find(
        {"owner_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "session_type": s.get("session_type", "workout"),
            "target_minutes": s.get("target_minutes", 0),
            "exercise_count": len(s.get("exercises", [])),
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.coaching_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/sessions", status_code=201)
async def create_session(body: SessionBody, user: dict = Depends(get_current_user)):
    _require_coach(user)
    session = {
        "id": f"ses_{uuid.uuid4().hex[:12]}",
        **body.model_dump(),
        "owner_id": user["user_id"],
        "created_at": datetime.now(timezone.utc),
    }
    await db.coaching_sessions.insert_one(dict(session))
    session.pop("_id", None)
    session["created_at"] = session["created_at"].isoformat()
    return session


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, body: SessionBody, user: dict = Depends(get_current_user)):
    session = await db.coaching_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own sessions")
    await db.coaching_sessions.update_one({"id": session_id}, {"$set": body.model_dump()})
    return await db.coaching_sessions.find_one({"id": session_id}, {"_id": 0})


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.coaching_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own sessions")
    await db.coaching_sessions.delete_one({"id": session_id})
    # Clear this session from any program schedules
    programs = await db.programs.find(
        {"owner_id": user["user_id"], "schedule": session_id}, {"_id": 0, "id": 1, "schedule": 1}
    ).to_list(500)
    for p in programs:
        new_schedule = [None if s == session_id else s for s in p["schedule"]]
        await db.programs.update_one({"id": p["id"]}, {"$set": {"schedule": new_schedule}})
    return {"ok": True}
