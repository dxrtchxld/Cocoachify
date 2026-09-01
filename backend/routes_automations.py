"""Automations: coach-defined "when X happens, do Y" rules. Deterministic — no LLM."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from automations import ACTION_TYPES, TRIGGER_TYPES
from db import db
from modules import owned, require_coach, require_module

router = APIRouter(prefix="/studio/automations", tags=["automations"])
MODULE = "automations"


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


class TriggerBody(BaseModel):
    type: str
    course_id: str | None = None
    plan_id: str | None = None


class ActionBody(BaseModel):
    type: str
    tag: str | None = Field(default=None, max_length=40)
    stage: str | None = Field(default=None, max_length=20)
    program_id: str | None = None
    course_id: str | None = None
    message: str = Field(default="", max_length=2000)
    subject: str = Field(default="", max_length=140)
    title: str = Field(default="", max_length=140)


class RuleBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    trigger: TriggerBody
    actions: list[ActionBody] = Field(min_length=1, max_length=10)
    enabled: bool = True


def _validate(body: RuleBody) -> None:
    if body.trigger.type not in TRIGGER_TYPES:
        raise HTTPException(status_code=422, detail="Unknown trigger type")
    for a in body.actions:
        if a.type not in ACTION_TYPES:
            raise HTTPException(status_code=422, detail="Unknown action type")
        if a.type in ("add_tag", "remove_tag") and not a.tag:
            raise HTTPException(status_code=422, detail="Tag actions need a tag")
        if a.type == "move_stage" and not a.stage:
            raise HTTPException(status_code=422, detail="Move-stage action needs a stage")
        if a.type == "assign_program" and not a.program_id:
            raise HTTPException(status_code=422, detail="Assign-program action needs a program")
        if a.type == "enroll_course" and not a.course_id:
            raise HTTPException(status_code=422, detail="Enroll-course action needs a course")
        if a.type in ("send_chat", "send_email", "post_announcement") and not a.message.strip():
            raise HTTPException(status_code=422, detail="This action needs a message")


def _rule_public(r: dict) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "trigger": r["trigger"],
        "actions": r["actions"],
        "enabled": r.get("enabled", True),
        "created_at": _iso(r.get("created_at")),
    }


@router.get("")
async def list_rules(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    docs = await db.automation_rules.find({"coach_id": coach_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_rule_public(r) for r in docs]


@router.get("/meta")
async def automation_meta(user: dict = Depends(get_current_user)):
    """Option lists the Studio rule builder needs (courses/programs/plans + catalog)."""
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    courses = await db.courses.find({"coach_id": coach_id}, {"_id": 0, "id": 1, "title": 1}).to_list(200)
    programs = await db.programs.find({"owner_id": coach_id}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    plans = await db.membership_plans.find({"coach_id": coach_id}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    return {
        "triggers": list(TRIGGER_TYPES),
        "actions": list(ACTION_TYPES),
        "courses": courses,
        "programs": programs,
        "plans": plans,
    }


@router.post("", status_code=201)
async def create_rule(body: RuleBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    _validate(body)
    doc = {
        "id": f"auto_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "name": body.name.strip(),
        "trigger": body.trigger.model_dump(),
        "actions": [a.model_dump() for a in body.actions],
        "enabled": body.enabled,
        "created_at": datetime.now(timezone.utc),
    }
    await db.automation_rules.insert_one(dict(doc))
    return _rule_public(doc)


@router.put("/{rule_id}")
async def update_rule(rule_id: str, body: RuleBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    _validate(body)
    await owned(db.automation_rules, rule_id, coach_id, "Automation")
    update = {
        "name": body.name.strip(),
        "trigger": body.trigger.model_dump(),
        "actions": [a.model_dump() for a in body.actions],
        "enabled": body.enabled,
    }
    await db.automation_rules.update_one({"id": rule_id}, {"$set": update})
    return _rule_public(await db.automation_rules.find_one({"id": rule_id}, {"_id": 0}))


@router.put("/{rule_id}/toggle")
async def toggle_rule(rule_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    rule = await owned(db.automation_rules, rule_id, coach_id, "Automation")
    new_state = not rule.get("enabled", True)
    await db.automation_rules.update_one({"id": rule_id}, {"$set": {"enabled": new_state}})
    return {"ok": True, "enabled": new_state}


@router.delete("/{rule_id}")
async def delete_rule(rule_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.automation_rules, rule_id, coach_id, "Automation")
    await db.automation_rules.delete_one({"id": rule_id})
    return {"ok": True}
