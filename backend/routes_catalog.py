"""Coaching modality catalog + the coach's practice profile and resource kits."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from catalog import (
    APPROACH_BY_KEY,
    APPROACHES,
    DELIVERY,
    DIRECTIVENESS,
    DOMAIN_BY_KEY,
    DOMAINS,
    GROUPS,
    MODEL_BY_KEY,
    SESSION_MODELS,
)
from db import db
from modules import get_flags, require_coach

router = APIRouter(tags=["catalog"])


def _summary(d: dict) -> dict:
    return {"key": d["key"], "label": d["label"], "group": d["group"], "offering": d["offering"]}


@router.get("/catalog")
async def catalog(user: dict = Depends(get_current_user)):
    groups = [
        {**g, "domains": [_summary(d) for d in DOMAINS if d["group"] == g["key"]]}
        for g in GROUPS
    ]
    return {
        "groups": groups,
        "approaches": APPROACHES,
        "session_models": SESSION_MODELS,
        "delivery": DELIVERY,
        "directiveness": DIRECTIVENESS,
    }


@router.get("/catalog/domains/{key}")
async def domain_kit(key: str, user: dict = Depends(get_current_user)):
    d = DOMAIN_BY_KEY.get(key)
    if not d:
        raise HTTPException(status_code=404, detail="Modality not found")
    group = next((g for g in GROUPS if g["key"] == d["group"]), {})
    installed = await db.practice_installs.find_one(
        {"coach_id": user["user_id"], "domain": key}, {"_id": 0}
    )
    return {
        **d,
        "group_label": group.get("label"),
        "group_safety": group.get("safety"),
        "approach_details": [APPROACH_BY_KEY[a] for a in d["approaches"] if a in APPROACH_BY_KEY],
        "model_details": [MODEL_BY_KEY[m] for m in d["models"] if m in MODEL_BY_KEY],
        "installed": bool(installed),
        "installed_at": installed.get("created_at").isoformat() if installed and isinstance(installed.get("created_at"), datetime) else None,
    }


class PracticeBody(BaseModel):
    domains: list[str] = Field(default_factory=list)
    approaches: list[str] = Field(default_factory=list)
    default_model: str | None = None
    directiveness: str = "permission_based"
    delivery: list[str] = Field(default_factory=list)
    do_not_do: list[str] = Field(default_factory=list)


def _practice_public(p: dict) -> dict:
    domains = p.get("domains") or []
    return {
        "domains": domains,
        "domain_labels": [DOMAIN_BY_KEY[d]["label"] for d in domains if d in DOMAIN_BY_KEY],
        "approaches": p.get("approaches") or [],
        "default_model": p.get("default_model"),
        "directiveness": p.get("directiveness", "permission_based"),
        "delivery": p.get("delivery") or [],
        "do_not_do": p.get("do_not_do") or [],
    }


@router.get("/me/practice")
async def get_practice(user: dict = Depends(get_current_user)):
    coach_id = user["user_id"] if user.get("role") == "coach" else user.get("coach_id")
    if not coach_id:
        return _practice_public({})
    doc = await db.practice_profiles.find_one({"coach_id": coach_id}, {"_id": 0})
    return _practice_public(doc or {})


@router.put("/me/practice")
async def set_practice(body: PracticeBody, user: dict = Depends(get_current_user)):
    require_coach(user)
    domains = [d for d in body.domains if d in DOMAIN_BY_KEY][:40]
    approaches = [a for a in body.approaches if a in APPROACH_BY_KEY][:15]
    model = body.default_model if body.default_model in MODEL_BY_KEY else None
    directive = body.directiveness if any(x["key"] == body.directiveness for x in DIRECTIVENESS) else "permission_based"
    delivery = [x for x in body.delivery if any(d["key"] == x for d in DELIVERY)]
    doc = {
        "coach_id": user["user_id"],
        "domains": domains,
        "approaches": approaches,
        "default_model": model,
        "directiveness": directive,
        "delivery": delivery,
        "do_not_do": [s.strip()[:160] for s in body.do_not_do if s.strip()][:20],
        "updated_at": datetime.now(timezone.utc),
    }
    await db.practice_profiles.update_one({"coach_id": user["user_id"]}, {"$set": doc}, upsert=True)
    return _practice_public(doc)


@router.post("/catalog/domains/{key}/install", status_code=201)
async def install_kit(key: str, user: dict = Depends(get_current_user)):
    """Turn a modality into working resources: a check-in form and an intake form."""
    require_coach(user)
    d = DOMAIN_BY_KEY.get(key)
    if not d:
        raise HTTPException(status_code=404, detail="Modality not found")
    coach_id = user["user_id"]
    flags = await get_flags(coach_id)
    created: list[str] = []
    skipped: list[str] = []
    now = datetime.now(timezone.utc)

    if flags.get("coaching"):
        title = f"{d['label']} check-in"
        exists = await db.checkin_templates.find_one({"coach_id": coach_id, "title": title}, {"_id": 0, "id": 1})
        if not exists:
            await db.checkin_templates.insert_one({
                "id": f"tpl_{uuid.uuid4().hex[:12]}",
                "coach_id": coach_id,
                "title": title,
                "cadence": "weekly",
                "questions": [
                    {"id": f"q_{uuid.uuid4().hex[:8]}", "label": q, "type": "text", "required": False}
                    for q in d["checkin"]
                ],
                "client_ids": [],
                "created_at": now,
            })
            created.append("Check-in form")
        else:
            skipped.append("Check-in form already exists")
    else:
        skipped.append("Enable Coaching Plans to install the check-in form")

    if flags.get("crm"):
        title = f"{d['label']} intake"
        exists = await db.lead_forms.find_one({"coach_id": coach_id, "title": title}, {"_id": 0, "id": 1})
        if not exists:
            await db.lead_forms.insert_one({
                "id": f"frm_{uuid.uuid4().hex[:12]}",
                "coach_id": coach_id,
                "title": title,
                "intro": d["offering"],
                "course_id": None,
                "fields": [
                    {"key": f"f_{uuid.uuid4().hex[:6]}", "label": q, "type": "textarea", "required": False, "options": []}
                    for q in d["intake"]
                ],
                "success_message": "Thanks — I'll be in touch shortly.",
                "active": True,
                "submissions": 0,
                "created_at": now,
            })
            created.append("Intake form")
        else:
            skipped.append("Intake form already exists")
    else:
        skipped.append("Enable Contacts & Leads to install the intake form")

    await db.practice_installs.update_one(
        {"coach_id": coach_id, "domain": key},
        {"$setOnInsert": {"coach_id": coach_id, "domain": key, "created_at": now}},
        upsert=True,
    )
    await db.practice_profiles.update_one(
        {"coach_id": coach_id},
        {"$addToSet": {"domains": key}, "$setOnInsert": {"coach_id": coach_id}},
        upsert=True,
    )
    return {"created": created, "skipped": skipped}
