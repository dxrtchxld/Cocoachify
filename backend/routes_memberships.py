"""Membership plans + subscriptions (recurring access with grace-period rules)."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, user_public
from db import db
from memberships import GRACE_DEFAULT_DAYS, refresh_access
from modules import owned, require_coach, require_module

router = APIRouter(prefix="/studio/memberships", tags=["memberships"])
MODULE = "memberships"


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


class PlanBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    price: float = Field(ge=0, le=100000)
    interval: str = Field(default="month", pattern="^(month|year)$")
    course_ids: list[str] = Field(default_factory=list)
    grace_days: int = Field(default=GRACE_DEFAULT_DAYS, ge=0, le=60)
    active: bool = True


def _plan(p: dict, extra: dict | None = None) -> dict:
    out = {
        "id": p["id"], "name": p["name"], "description": p.get("description", ""),
        "price": p.get("price", 0), "interval": p.get("interval", "month"),
        "course_ids": p.get("course_ids") or [], "grace_days": p.get("grace_days", GRACE_DEFAULT_DAYS),
        "active": p.get("active", True), "created_at": _iso(p.get("created_at")),
    }
    if extra:
        out.update(extra)
    return out


@router.get("/plans")
async def list_plans(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    query: dict = {"coach_id": coach_id}
    if user.get("role") != "coach":
        query["active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = []
    for p in plans:
        subs = await db.subscriptions.count_documents({"plan_id": p["id"], "status": {"$in": ["active", "past_due"]}})
        out.append(_plan(p, {"active_members": subs}))
    return out


@router.post("/plans", status_code=201)
async def create_plan(body: PlanBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    valid = await db.courses.find(
        {"id": {"$in": body.course_ids}, "coach_id": coach_id}, {"_id": 0, "id": 1}
    ).to_list(100)
    plan = {
        "id": f"plan_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        **body.model_dump(exclude={"course_ids"}),
        "course_ids": [c["id"] for c in valid],
        "created_at": datetime.now(timezone.utc),
    }
    await db.membership_plans.insert_one(dict(plan))
    return _plan(plan, {"active_members": 0})


@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.membership_plans, plan_id, coach_id, "Plan")
    valid = await db.courses.find(
        {"id": {"$in": body.course_ids}, "coach_id": coach_id}, {"_id": 0, "id": 1}
    ).to_list(100)
    update = {**body.model_dump(exclude={"course_ids"}), "course_ids": [c["id"] for c in valid]}
    await db.membership_plans.update_one({"id": plan_id}, {"$set": update})
    return _plan(await db.membership_plans.find_one({"id": plan_id}, {"_id": 0}))


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.membership_plans, plan_id, coach_id, "Plan")
    active = await db.subscriptions.count_documents({"plan_id": plan_id, "status": "active"})
    if active:
        raise HTTPException(status_code=400, detail="Deactivate members before deleting this plan")
    await db.membership_plans.delete_one({"id": plan_id})
    return {"ok": True}


@router.get("/subscriptions")
async def list_subscriptions(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    subs = await db.subscriptions.find({"coach_id": coach_id}, {"_id": 0}).to_list(1000)
    for s in subs:
        await refresh_access(s["user_id"])
    subs = await db.subscriptions.find({"coach_id": coach_id}, {"_id": 0}).to_list(1000)
    ids = list({s["user_id"] for s in subs})
    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0}).to_list(1000)
    umap = {u["user_id"]: u for u in users}
    plans = await db.membership_plans.find({"coach_id": coach_id}, {"_id": 0}).to_list(100)
    pmap = {p["id"]: p["name"] for p in plans}
    return [
        {
            "id": s["id"],
            "plan_id": s["plan_id"],
            "plan_name": pmap.get(s["plan_id"], "Plan"),
            "member": user_public(umap[s["user_id"]]) if s["user_id"] in umap else {"user_id": s["user_id"], "name": "Member"},
            "status": s.get("status"),
            "current_period_end": _iso(s.get("current_period_end")),
            "grace_until": _iso(s.get("grace_until")),
            "last_payment_at": _iso(s.get("last_payment_at")),
        }
        for s in subs
    ]


class StatusBody(BaseModel):
    status: str = Field(pattern="^(active|paused|cancelled)$")


@router.put("/subscriptions/{sub_id}/status")
async def set_status(sub_id: str, body: StatusBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    sub = await owned(db.subscriptions, sub_id, coach_id, "Subscription")
    plan = await db.membership_plans.find_one({"id": sub["plan_id"]}, {"_id": 0}) or {}
    course_ids = plan.get("course_ids") or []
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"status": body.status}})
    if course_ids:
        access = "active" if body.status == "active" else "paused"
        await db.course_enrollments.update_many(
            {"user_id": sub["user_id"], "course_id": {"$in": course_ids}}, {"$set": {"access": access}}
        )
    return {"ok": True, "status": body.status}


@router.get("/my")
async def my_membership(user: dict = Depends(get_current_user)):
    await require_module(user, MODULE)
    await refresh_access(user["user_id"])
    subs = await db.subscriptions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(20)
    out = []
    for s in subs:
        plan = await db.membership_plans.find_one({"id": s["plan_id"]}, {"_id": 0}) or {}
        out.append({
            "id": s["id"],
            "plan_name": plan.get("name", "Membership"),
            "price": plan.get("price", 0),
            "interval": plan.get("interval", "month"),
            "status": s.get("status"),
            "current_period_end": _iso(s.get("current_period_end")),
            "grace_until": _iso(s.get("grace_until")),
            "grace_days": plan.get("grace_days", GRACE_DEFAULT_DAYS),
        })
    return out
