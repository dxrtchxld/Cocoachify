import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db

router = APIRouter(tags=["logs"])


class LogCreate(BaseModel):
    log_type: str = Field(default="workout", pattern="^(workout|body)$")
    session_id: str | None = None
    program_id: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=600)
    rpe: int | None = Field(default=None, ge=1, le=10)
    weight: float | None = Field(default=None, ge=0, le=1000)
    notes: str | None = Field(default=None, max_length=1000)


@router.post("/logs", status_code=201)
async def create_log(body: LogCreate, user: dict = Depends(get_current_user)):
    if body.log_type == "workout" and not body.session_id:
        raise HTTPException(status_code=400, detail="session_id required for workout logs")
    if body.log_type == "body" and body.weight is None:
        raise HTTPException(status_code=400, detail="weight required for body logs")

    session_name = None
    if body.session_id:
        session = await db.coaching_sessions.find_one({"id": body.session_id}, {"_id": 0, "name": 1})
        session_name = session["name"] if session else None

    log = {
        "id": f"log_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "log_type": body.log_type,
        "session_id": body.session_id,
        "session_name": session_name,
        "program_id": body.program_id,
        "duration_minutes": body.duration_minutes,
        "rpe": body.rpe,
        "weight": body.weight,
        "notes": body.notes,
        "date": datetime.now(timezone.utc),
    }
    await db.client_logs.insert_one(dict(log))

    # Advance active enrollment if this workout belongs to it
    if body.log_type == "workout" and body.program_id:
        enrollment = await db.user_programs.find_one(
            {"user_id": user["user_id"], "program_id": body.program_id, "active": True},
            {"_id": 0},
        )
        if enrollment:
            program = await db.programs.find_one({"id": body.program_id}, {"_id": 0, "total_days": 1})
            total = program["total_days"] if program else 999
            new_day = min(enrollment["current_day"] + 1, total)
            await db.user_programs.update_one(
                {"id": enrollment["id"]}, {"$set": {"current_day": new_day}}
            )

    log.pop("_id", None)
    return log


@router.get("/logs")
async def list_logs(log_type: str | None = None, user: dict = Depends(get_current_user)):
    query: dict = {"user_id": user["user_id"]}
    if log_type in ("workout", "body"):
        query["log_type"] = log_type
    logs = await db.client_logs.find(query, {"_id": 0}).sort("date", -1).to_list(200)
    return logs


@router.get("/progress/summary")
async def progress_summary(user: dict = Depends(get_current_user)):
    logs = (
        await db.client_logs.find({"user_id": user["user_id"]}, {"_id": 0})
        .sort("date", 1)
        .to_list(500)
    )
    weight_series = [
        {"date": l["date"].isoformat(), "value": l["weight"]}
        for l in logs
        if l["log_type"] == "body" and l.get("weight") is not None
    ]
    duration_series = [
        {"date": l["date"].isoformat(), "value": l["duration_minutes"], "label": l.get("session_name")}
        for l in logs
        if l["log_type"] == "workout" and l.get("duration_minutes")
    ]
    rpe_series = [
        {"date": l["date"].isoformat(), "value": l["rpe"]}
        for l in logs
        if l["log_type"] == "workout" and l.get("rpe")
    ]

    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    workouts = [l for l in logs if l["log_type"] == "workout"]
    week_workouts = [l for l in workouts if _aware(l["date"]) >= week_start]

    return {
        "weight_series": weight_series[-30:],
        "duration_series": duration_series[-30:],
        "rpe_series": rpe_series[-30:],
        "totals": {
            "total_workouts": len(workouts),
            "total_minutes": sum(l.get("duration_minutes") or 0 for l in workouts),
            "week_workouts": len(week_workouts),
            "week_minutes": sum(l.get("duration_minutes") or 0 for l in week_workouts),
        },
    }


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
