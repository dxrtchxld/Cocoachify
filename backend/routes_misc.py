import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, user_public
from db import db

router = APIRouter(tags=["misc"])


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


class RoleBody(BaseModel):
    role: str = Field(pattern="^(coach|client)$")


@router.post("/me/role")
async def set_role(body: RoleBody, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"role": body.role}}
    )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(updated)


class OnboardingBody(BaseModel):
    goal: str = Field(pattern="^(lose_weight|build_strength|cardio|flexibility|wellness)$")
    experience: str = Field(pattern="^(just_starting|some_experience|experienced)$")
    days_per_week: int = Field(ge=1, le=7)
    focus: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)


@router.put("/me/onboarding")
async def save_onboarding(body: OnboardingBody, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"onboarding": body.model_dump(), "onboarding_completed": True}},
    )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(updated)


@router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)

    # Active enrollment + today's session
    enrollment = await db.user_programs.find_one(
        {"user_id": user["user_id"], "active": True}, {"_id": 0}
    )
    today_session = None
    program_info = None
    if enrollment:
        program = await db.programs.find_one({"id": enrollment["program_id"]}, {"_id": 0})
        if program:
            day_index = min(enrollment["current_day"], program["total_days"]) - 1
            schedule = program.get("schedule", [])
            session_id = schedule[day_index] if day_index < len(schedule) else None
            if session_id:
                session = await db.coaching_sessions.find_one({"id": session_id}, {"_id": 0})
            else:
                session = None
            if session:
                today_session = {
                    "session_id": session["id"],
                    "name": session["name"],
                    "session_type": session.get("session_type", "workout"),
                    "target_minutes": session.get("target_minutes", 0),
                    "exercise_count": len(session.get("exercises", [])),
                    "coach_notes": session.get("coach_notes"),
                    "day": enrollment["current_day"],
                }
            else:
                today_session = {
                    "session_id": None,
                    "name": "Rest Day",
                    "session_type": "rest",
                    "target_minutes": 0,
                    "exercise_count": 0,
                    "coach_notes": "Recovery day. Walk, hydrate, sleep well.",
                    "day": enrollment["current_day"],
                }
            program_info = {
                "id": program["id"],
                "name": program["name"],
                "total_days": program["total_days"],
                "current_day": enrollment["current_day"],
                "cover_image": program.get("cover_image"),
            }

    # Streak: consecutive days (ending today or yesterday) with a workout log
    logs = (
        await db.client_logs.find(
            {"user_id": user["user_id"], "log_type": "workout"}, {"_id": 0, "date": 1}
        )
        .sort("date", -1)
        .to_list(365)
    )
    log_days = {_aware(l["date"]).date() for l in logs}
    streak = 0
    cursor_day = now.date()
    if cursor_day not in log_days:
        cursor_day = cursor_day - timedelta(days=1)
    while cursor_day in log_days:
        streak += 1
        cursor_day = cursor_day - timedelta(days=1)

    week_start = now - timedelta(days=7)
    week_logs = await db.client_logs.find(
        {"user_id": user["user_id"], "log_type": "workout", "date": {"$gte": week_start}},
        {"_id": 0},
    ).to_list(100)

    logged_today = now.date() in log_days

    return {
        "user": user_public(user),
        "streak": streak,
        "logged_today": logged_today,
        "week": {
            "workouts": len(week_logs),
            "minutes": sum(l.get("duration_minutes") or 0 for l in week_logs),
            "goal_workouts": 5,
            "goal_minutes": 150,
        },
        "today_session": today_session,
        "program": program_info,
    }


class InviteAccept(BaseModel):
    code: str | None = Field(default=None, min_length=4, max_length=12)
    coach_email: str | None = Field(default=None, max_length=200)


@router.post("/invites", status_code=201)
async def create_invite(user: dict = Depends(get_current_user)):
    if user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Only coaches can create invites")
    existing = await db.invites.find_one({"coach_id": user["user_id"]}, {"_id": 0})
    if existing:
        return existing
    code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    invite = {
        "id": f"inv_{uuid.uuid4().hex[:12]}",
        "coach_id": user["user_id"],
        "code": code,
        "created_at": datetime.now(timezone.utc),
    }
    await db.invites.insert_one(dict(invite))
    invite.pop("_id", None)
    return invite


@router.post("/invites/accept")
async def accept_invite(body: InviteAccept, user: dict = Depends(get_current_user)):
    coach = None
    if body.code:
        invite = await db.invites.find_one({"code": body.code.upper().strip()}, {"_id": 0})
        if not invite:
            raise HTTPException(status_code=404, detail="Invalid invite code")
        coach = await db.users.find_one({"user_id": invite["coach_id"]}, {"_id": 0})
    elif body.coach_email:
        coach = await db.users.find_one(
            {"email": body.coach_email.lower().strip(), "role": "coach"}, {"_id": 0}
        )
        if not coach:
            raise HTTPException(status_code=404, detail="No coach found with that email")
    else:
        raise HTTPException(status_code=400, detail="Provide an invite code or coach email")

    if not coach or coach.get("role") != "coach":
        raise HTTPException(status_code=404, detail="Coach not found")
    if coach["user_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="You can't connect to yourself")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"coach_id": coach["user_id"]}}
    )
    return {"ok": True, "coach": {"user_id": coach["user_id"], "name": coach.get("name"), "email": coach["email"]}}


@router.get("/invites/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    clients = await db.users.find(
        {"coach_id": user["user_id"]}, {"_id": 0}
    ).to_list(100)
    return [user_public(c) for c in clients]


@router.get("/coach")
async def my_coach(user: dict = Depends(get_current_user)):
    if not user.get("coach_id"):
        return {"coach": None}
    coach = await db.users.find_one({"user_id": user["coach_id"]}, {"_id": 0})
    return {"coach": user_public(coach) if coach else None}
