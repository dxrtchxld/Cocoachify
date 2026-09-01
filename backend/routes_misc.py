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
    specialty: str | None = Field(default=None, pattern="^(fitness|breathwork|yoga|mobility|mindfulness)$")


@router.post("/me/role")
async def set_role(body: RoleBody, user: dict = Depends(get_current_user)):
    update: dict = {"role": body.role}
    if body.role == "coach" and body.specialty:
        update["coach_specialty"] = body.specialty
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(updated)


class ThemeBody(BaseModel):
    theme_color: str = Field(pattern="^#[0-9A-Fa-f]{6}$")
    font_pack: str | None = Field(default=None, max_length=30)


DASHBOARD_SECTIONS = ["stats", "quick_actions", "needs_attention", "inbox_preview", "recent_activity"]


def _default_layout() -> list[dict]:
    return [{"key": k, "visible": True} for k in DASHBOARD_SECTIONS]


class DashboardLayoutBody(BaseModel):
    sections: list[dict] = Field(default_factory=list)


@router.get("/me/dashboard-layout")
async def get_dashboard_layout(user: dict = Depends(get_current_user)):
    saved = user.get("dashboard_layout")
    if not saved:
        return {"sections": _default_layout()}
    # ensure any newly-added sections appear (appended, visible)
    known = {s["key"] for s in saved if s.get("key") in DASHBOARD_SECTIONS}
    merged = [s for s in saved if s.get("key") in DASHBOARD_SECTIONS]
    for k in DASHBOARD_SECTIONS:
        if k not in known:
            merged.append({"key": k, "visible": True})
    return {"sections": merged}


@router.put("/me/dashboard-layout")
async def set_dashboard_layout(body: DashboardLayoutBody, user: dict = Depends(get_current_user)):
    clean, seen = [], set()
    for s in body.sections:
        key = s.get("key")
        if key in DASHBOARD_SECTIONS and key not in seen:
            seen.add(key)
            clean.append({"key": key, "visible": bool(s.get("visible", True))})
    for k in DASHBOARD_SECTIONS:
        if k not in seen:
            clean.append({"key": k, "visible": True})
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"dashboard_layout": clean}}
    )
    return {"sections": clean}


@router.put("/me/theme")
async def set_theme(body: ThemeBody, user: dict = Depends(get_current_user)):
    from branding import accent_allowed, font_pack_allowed

    is_premium = user.get("is_premium", False)
    if not accent_allowed(body.theme_color.upper(), is_premium):
        raise HTTPException(status_code=403, detail="That color is a premium unlock")
    update = {"theme_color": body.theme_color.upper()}
    if body.font_pack:
        if not font_pack_allowed(body.font_pack, is_premium):
            raise HTTPException(status_code=403, detail="That font pack is a premium unlock")
        update["font_pack"] = body.font_pack
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(updated)


class BrandBody(BaseModel):
    logo_url: str | None = Field(default=None, max_length=500)
    banner_url: str | None = Field(default=None, max_length=500)
    tagline: str | None = Field(default=None, max_length=60)


@router.put("/me/brand")
async def set_brand(body: BrandBody, user: dict = Depends(get_current_user)):
    update = {}
    if "logo_url" in body.model_fields_set:
        update["brand_logo"] = body.logo_url
    if "banner_url" in body.model_fields_set:
        update["brand_banner"] = body.banner_url
    if "tagline" in body.model_fields_set:
        update["brand_tagline"] = (body.tagline or "").strip()[:60] or None
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(updated)


AFFIRMATIONS = [
    "Consistency beats intensity. Show up today.",
    "Your body achieves what your mind believes.",
    "Small daily wins build unstoppable momentum.",
    "Strong is built one rep at a time.",
    "Discipline is choosing what you want most over what you want now.",
    "Rest is part of the work. Recover with intention.",
    "You don't have to be extreme, just consistent.",
    "Progress, not perfection.",
    "Energy flows where attention goes. Focus on today.",
    "You are one workout away from a better mood.",
    "Trust the process. Your coach sees the path.",
    "Breathe deep. Move well. Live strong.",
    "Every check-in is a promise kept to yourself.",
    "Champions are made when nobody is watching.",
    "Your future self is watching. Make them proud.",
    "Hydrate, move, sleep, repeat.",
    "Motivation gets you started. Habit keeps you going.",
    "Today's effort is tomorrow's strength.",
    "Be stronger than your strongest excuse.",
    "The best project you'll ever work on is you.",
    "Don't count the days. Make the days count.",
    "Fall in love with the process and results will follow.",
    "One day or day one. You decide.",
    "Slow progress is still progress.",
    "Your only competition is who you were yesterday.",
    "Move your body, clear your mind.",
]


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class HabitsBody(BaseModel):
    water_count: int | None = Field(default=None, ge=0, le=30)
    affirmation_done: bool | None = None


@router.get("/habits/today")
async def get_habits(user: dict = Depends(get_current_user)):
    key = _today_key()
    doc = await db.daily_habits.find_one(
        {"user_id": user["user_id"], "date": key}, {"_id": 0}
    )
    day_of_year = datetime.now(timezone.utc).timetuple().tm_yday
    return {
        "date": key,
        "water_count": doc.get("water_count", 0) if doc else 0,
        "water_goal": 8,
        "affirmation_done": doc.get("affirmation_done", False) if doc else False,
        "affirmation_text": AFFIRMATIONS[day_of_year % len(AFFIRMATIONS)],
    }


@router.put("/habits/today")
async def update_habits(body: HabitsBody, user: dict = Depends(get_current_user)):
    key = _today_key()
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.daily_habits.update_one(
            {"user_id": user["user_id"], "date": key},
            {"$set": update, "$setOnInsert": {"user_id": user["user_id"], "date": key}},
            upsert=True,
        )
    return await get_habits(user)


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

    from automations import run_automations

    await run_automations(coach["user_id"], "client_connected", user["user_id"], {})

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

@router.post("/me/welcomed")
async def mark_welcomed(user: dict = Depends(get_current_user)):
    """One-time branded welcome has been seen."""
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"welcomed": True}})
    return {"ok": True}
