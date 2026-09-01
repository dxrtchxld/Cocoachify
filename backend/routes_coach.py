import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, user_public
from db import db

router = APIRouter(prefix="/coach", tags=["coach"])


def require_coach(user: dict) -> None:
    if user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Coach access required")


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _checkin_stats(logs: list[dict]) -> dict:
    """Streak + activity summary from a client's workout logs."""
    workouts = [l for l in logs if l.get("log_type") == "workout"]
    days = {_aware(l["date"]).date() for l in workouts}
    now = datetime.now(timezone.utc)
    streak = 0
    cursor = now.date()
    if cursor not in days:
        cursor = cursor - timedelta(days=1)
    while cursor in days:
        streak += 1
        cursor = cursor - timedelta(days=1)
    week_start = now - timedelta(days=7)
    week = [l for l in workouts if _aware(l["date"]) >= week_start]
    last = max((_aware(l["date"]) for l in workouts), default=None)
    return {
        "streak": streak,
        "total_checkins": len(workouts),
        "week_checkins": len(week),
        "last_active": last.isoformat() if last else None,
    }


async def _client_status(client: dict) -> dict:
    """Compute status + active program info for a client."""
    enrollment = await db.user_programs.find_one(
        {"user_id": client["user_id"], "active": True}, {"_id": 0}
    )
    program = None
    if enrollment:
        program = await db.programs.find_one(
            {"id": enrollment["program_id"]}, {"_id": 0, "name": 1, "total_days": 1}
        )
    last_log = await db.client_logs.find_one(
        {"user_id": client["user_id"], "log_type": "workout"},
        {"_id": 0, "date": 1},
        sort=[("date", -1)],
    )
    now = datetime.now(timezone.utc)
    last_checkin = _aware(last_log["date"]) if last_log else None

    if not enrollment or not program:
        status = "no_program"
    else:
        started = _aware(enrollment["started_at"])
        recent_cutoff = now - timedelta(days=3)
        if (last_checkin and last_checkin >= recent_cutoff) or started >= recent_cutoff:
            status = "on_track"
        else:
            status = "behind"

    return {
        "status": status,
        "program_name": program["name"] if program else None,
        "program_id": enrollment["program_id"] if enrollment else None,
        "current_day": enrollment["current_day"] if enrollment else None,
        "total_days": program["total_days"] if program else None,
        "last_checkin": last_checkin.isoformat() if last_checkin else None,
    }


@router.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    require_coach(user)
    clients = await db.users.find({"coach_id": user["user_id"]}, {"_id": 0}).to_list(200)
    out = []
    for c in clients:
        info = await _client_status(c)
        out.append({**user_public(c), **info})
    order = {"behind": 0, "no_program": 1, "on_track": 2}
    out.sort(key=lambda c: (order.get(c["status"], 3), (c["name"] or "").lower()))
    return out


@router.get("/clients/{client_id}")
async def client_detail(client_id: str, user: dict = Depends(get_current_user)):
    require_coach(user)
    client = await db.users.find_one(
        {"user_id": client_id, "coach_id": user["user_id"]}, {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    info = await _client_status(client)
    logs = (
        await db.client_logs.find({"user_id": client_id}, {"_id": 0})
        .sort("date", -1)
        .to_list(365)
    )
    stats = _checkin_stats(logs)
    logs = logs[:30]
    for l in logs:
        l["date"] = _aware(l["date"]).isoformat()
    return {**user_public(client), **info, **stats, "logs": logs}


class AssignRequest(BaseModel):
    client_id: str = Field(min_length=1)
    program_id: str = Field(min_length=1)


@router.delete("/clients/{client_id}")
async def remove_client(client_id: str, user: dict = Depends(get_current_user)):
    require_coach(user)
    client = await db.users.find_one(
        {"user_id": client_id, "coach_id": user["user_id"]}, {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    # Disconnect: keep their history, but unlink from this coach and end active programs.
    await db.users.update_one({"user_id": client_id}, {"$set": {"coach_id": None}})
    await db.user_programs.update_many(
        {"user_id": client_id, "active": True}, {"$set": {"active": False}}
    )
    return {"ok": True}


@router.post("/assign")
async def assign_program(body: AssignRequest, user: dict = Depends(get_current_user)):
    require_coach(user)
    client = await db.users.find_one(
        {"user_id": body.client_id, "coach_id": user["user_id"]}, {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    program = await db.programs.find_one({"id": body.program_id}, {"_id": 0})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if not program.get("is_template") and program.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only assign your own programs or templates")

    await db.user_programs.update_many(
        {"user_id": body.client_id, "active": True}, {"$set": {"active": False}}
    )
    import uuid

    enrollment = {
        "id": f"enr_{uuid.uuid4().hex[:12]}",
        "user_id": body.client_id,
        "program_id": body.program_id,
        "assigned_by": user["user_id"],
        "started_at": datetime.now(timezone.utc),
        "current_day": 1,
        "active": True,
    }
    await db.user_programs.insert_one(dict(enrollment))
    enrollment.pop("_id", None)
    return enrollment


@router.get("/activity")
async def recent_activity(user: dict = Depends(get_current_user)):
    require_coach(user)
    clients = await db.users.find(
        {"coach_id": user["user_id"]}, {"_id": 0, "user_id": 1, "name": 1}
    ).to_list(200)
    name_map = {c["user_id"]: c.get("name") for c in clients}
    if not name_map:
        return []
    logs = (
        await db.client_logs.find(
            {"user_id": {"$in": list(name_map.keys())}}, {"_id": 0}
        )
        .sort("date", -1)
        .to_list(20)
    )
    for l in logs:
        l["client_name"] = name_map.get(l["user_id"])
        l["date"] = _aware(l["date"]).isoformat()
    return logs


@router.get("/inbox")
async def inbox(user: dict = Depends(get_current_user)):
    require_coach(user)
    clients = await db.users.find(
        {"coach_id": user["user_id"]}, {"_id": 0, "user_id": 1, "name": 1}
    ).to_list(200)
    name_map = {c["user_id"]: c.get("name") for c in clients}
    if not name_map:
        return []
    logs = (
        await db.client_logs.find(
            {"user_id": {"$in": list(name_map.keys())}, "log_type": "workout"}, {"_id": 0}
        )
        .sort("date", -1)
        .to_list(100)
    )
    urgent_words = ("pain", "injur", "hurt", "dizzy", "sick", "sharp")
    out = []
    for l in logs:
        notes = (l.get("notes") or "").lower()
        rpe = l.get("rpe") or 0
        if rpe >= 9 or any(w in notes for w in urgent_words):
            urgency = "urgent"
        elif rpe >= 8:
            urgency = "watch"
        else:
            urgency = "normal"
        out.append({
            **l,
            "date": _aware(l["date"]).isoformat(),
            "client_name": name_map.get(l["user_id"]),
            "urgency": urgency,
            "reviewed": l.get("reviewed", False),
        })
    return out


@router.post("/inbox/{log_id}/review")
async def review_checkin(log_id: str, user: dict = Depends(get_current_user)):
    require_coach(user)
    log = await db.client_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Check-in not found")
    client = await db.users.find_one(
        {"user_id": log["user_id"], "coach_id": user["user_id"]}, {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=403, detail="Not your client")
    await db.client_logs.update_one({"id": log_id}, {"$set": {"reviewed": True}})
    return {"ok": True}


class ReplyBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/inbox/{log_id}/reply", status_code=201)
async def reply_checkin(log_id: str, body: ReplyBody, user: dict = Depends(get_current_user)):
    """Reply to a check-in from the Inbox: sends the client a message and marks it reviewed."""
    require_coach(user)
    log = await db.client_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Check-in not found")
    client = await db.users.find_one(
        {"user_id": log["user_id"], "coach_id": user["user_id"]}, {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=403, detail="Not your client")
    now = datetime.now(timezone.utc)
    message = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "sender_id": user["user_id"],
        "recipient_id": log["user_id"],
        "text": body.text.strip(),
        "created_at": now,
    }
    await db.messages.insert_one(dict(message))
    await db.client_logs.update_one(
        {"id": log_id}, {"$set": {"reviewed": True, "coach_reply": body.text.strip()}}
    )
    return {"ok": True}


# ---------- Exercise Library ----------

class ExerciseBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=500)


@router.get("/exercise-library")
async def exercise_library(user: dict = Depends(get_current_user)):
    require_coach(user)
    # Auto-fill: distinct exercises used across the coach's sessions
    sessions = await db.coaching_sessions.find(
        {"owner_id": user["user_id"]}, {"_id": 0, "exercises": 1}
    ).to_list(1000)
    agg: dict[str, dict] = {}
    for s in sessions:
        for ex in s.get("exercises", []):
            name = (ex.get("name") or "").strip()
            if not name:
                continue
            key = name.lower()
            entry = agg.setdefault(key, {
                "id": None, "name": name, "note": ex.get("form_note") or "",
                "sets": ex.get("sets"), "reps": ex.get("reps"),
                "usage_count": 0, "source": "program",
            })
            entry["usage_count"] += 1
            if not entry["note"] and ex.get("form_note"):
                entry["note"] = ex["form_note"]

    # Manual additions override/augment by name
    manual = await db.exercise_library.find({"coach_id": user["user_id"]}, {"_id": 0}).to_list(500)
    for m in manual:
        key = m["name"].lower()
        agg[key] = {
            "id": m["id"], "name": m["name"], "note": m.get("note") or "",
            "sets": agg.get(key, {}).get("sets"), "reps": agg.get(key, {}).get("reps"),
            "usage_count": agg.get(key, {}).get("usage_count", 0), "source": "manual",
        }

    out = list(agg.values())
    out.sort(key=lambda e: (-e["usage_count"], e["name"].lower()))
    return out


@router.post("/exercise-library", status_code=201)
async def add_exercise(body: ExerciseBody, user: dict = Depends(get_current_user)):
    require_coach(user)
    existing = await db.exercise_library.find_one(
        {"coach_id": user["user_id"], "name": body.name.strip()}, {"_id": 0}
    )
    if existing:
        await db.exercise_library.update_one(
            {"id": existing["id"]}, {"$set": {"note": body.note.strip()}}
        )
        return {"ok": True, "id": existing["id"]}
    ex = {
        "id": f"lib_{uuid.uuid4().hex[:12]}",
        "coach_id": user["user_id"],
        "name": body.name.strip(),
        "note": body.note.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    await db.exercise_library.insert_one(dict(ex))
    return {"ok": True, "id": ex["id"]}


@router.delete("/exercise-library/{ex_id}")
async def delete_exercise(ex_id: str, user: dict = Depends(get_current_user)):
    require_coach(user)
    await db.exercise_library.delete_one({"id": ex_id, "coach_id": user["user_id"]})
    return {"ok": True}


@router.get("/stats")
async def coach_stats(user: dict = Depends(get_current_user)):
    require_coach(user)
    client_ids = [
        c["user_id"]
        for c in await db.users.find(
            {"coach_id": user["user_id"]}, {"_id": 0, "user_id": 1}
        ).to_list(500)
    ]
    programs_count = await db.programs.count_documents({"owner_id": user["user_id"]})
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    active_ids = set()
    if client_ids:
        recent = await db.client_logs.find(
            {"user_id": {"$in": client_ids}, "date": {"$gte": week_ago}},
            {"_id": 0, "user_id": 1},
        ).to_list(1000)
        active_ids = {r["user_id"] for r in recent}
    total = len(client_ids)
    return {
        "clients": total,
        "programs": programs_count,
        "active_pct": round(len(active_ids) / total * 100) if total else 0,
    }
