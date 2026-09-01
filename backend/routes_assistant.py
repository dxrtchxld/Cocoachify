"""Consent-based coaching assistant.

Guardrails (hard requirements):
  * Module is OFF by default (see modules.MODULES).
  * A draft can only be generated for a client who has EXPLICITLY granted consent.
  * Output is a DRAFT for coach review — the assistant never messages a client.
  * Only the coach's own data for that one client is ever sent to the model.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db
from modules import owned, require_coach, require_module, require_own_client, workspace_coach_id

load_dotenv()

router = APIRouter(prefix="/studio/assistant", tags=["assistant"])
MODULE = "assistant"

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

MODELS = {
    "claude-sonnet-4-6": ("anthropic", "Claude Sonnet 4.6"),
    "gpt-5.5": ("openai", "GPT-5.5"),
    "gemini-3.1-pro-preview": ("gemini", "Gemini 3.1 Pro"),
}
DEFAULT_MODEL = "claude-sonnet-4-6"

KINDS = {
    "agenda": "a focused agenda for the next 1:1 coaching session",
    "checkin_summary": "a concise summary of the client's recent check-ins and trends",
    "followup": "3-5 specific follow-up suggestions the coach could act on",
}

SYSTEM = (
    "You are a coaching operations assistant for a private fitness & wellness coach. "
    "You produce short, practical DRAFTS for the coach to review and edit. "
    "Never address the client directly, never invent data, never give medical advice. "
    "If information is missing, say what to ask. Use plain text with short headings and bullets. "
    "Never use the word 'practitioner'."
)


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


# ---------------- Consent ----------------

class ConsentBody(BaseModel):
    granted: bool


@router.get("/consent")
async def list_consents(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    docs = await db.assistant_consents.find({"coach_id": coach_id}, {"_id": 0}).to_list(500)
    return [
        {"client_id": d["client_id"], "granted": d.get("granted", False),
         "granted_at": _iso(d.get("granted_at")), "revoked_at": _iso(d.get("revoked_at"))}
        for d in docs
    ]


@router.get("/my-consent")
async def my_consent(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    doc = await db.assistant_consents.find_one(
        {"coach_id": coach_id, "client_id": user["user_id"]}, {"_id": 0}
    )
    return {
        "granted": bool(doc and doc.get("granted")),
        "granted_at": _iso((doc or {}).get("granted_at")),
    }


@router.put("/my-consent")
async def set_my_consent(body: ConsentBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    now = datetime.now(timezone.utc)
    await db.assistant_consents.update_one(
        {"coach_id": coach_id, "client_id": user["user_id"]},
        {"$set": {"granted": body.granted,
                  "granted_at": now if body.granted else None,
                  "revoked_at": None if body.granted else now}},
        upsert=True,
    )
    return {"granted": body.granted}


# ---------------- Drafts ----------------

class DraftBody(BaseModel):
    client_id: str = Field(min_length=1)
    kind: str = Field(pattern="^(agenda|checkin_summary|followup)$")
    model: str = Field(default=DEFAULT_MODEL)
    coach_prompt: str = Field(default="", max_length=1000)


async def _client_context(coach_id: str, client_id: str) -> str:
    since = datetime.now(timezone.utc) - timedelta(days=45)
    client = await db.users.find_one({"user_id": client_id}, {"_id": 0})
    logs = await db.client_logs.find(
        {"user_id": client_id, "date": {"$gte": since}}, {"_id": 0}
    ).sort("date", -1).to_list(30)
    responses = await db.checkin_responses.find(
        {"coach_id": coach_id, "client_id": client_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    goals = await db.goals.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).to_list(20)
    milestones = await db.milestones.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).to_list(20)
    assignments = await db.assignments.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).to_list(20)

    lines = [f"CLIENT: {client.get('name') if client else client_id}"]
    ob = (client or {}).get("onboarding") or {}
    if ob:
        lines.append(f"INTAKE: goal={ob.get('goal')}, experience={ob.get('experience')}, "
                     f"days/week={ob.get('days_per_week')}, focus={ob.get('focus')}, notes={ob.get('notes')}")
    if logs:
        lines.append("RECENT CHECK-INS (newest first):")
        for l in logs[:12]:
            lines.append(f"- {_iso(l.get('date'))[:10]} type={l.get('log_type')} "
                         f"rpe={l.get('rpe')} minutes={l.get('duration_minutes')} notes={(l.get('notes') or '')[:180]}")
    if responses:
        lines.append("FORM CHECK-INS:")
        for r in responses:
            answers = "; ".join(f"{k}={v}" for k, v in (r.get("answers") or {}).items())
            lines.append(f"- {_iso(r.get('created_at'))[:10]} {r.get('template_title')}: {answers[:400]}")
    if goals:
        lines.append("GOALS: " + "; ".join(
            f"{g['title']} ({g.get('current_value')}/{g.get('target_value')} {g.get('unit','')} - {g.get('status')})"
            for g in goals))
    if milestones:
        lines.append("MILESTONES: " + "; ".join(f"{m['title']} [{m.get('status')}]" for m in milestones))
    if assignments:
        lines.append("ASSIGNMENTS: " + "; ".join(f"{a['title']} [{a.get('status')}]" for a in assignments))
    return "\n".join(lines)


@router.post("/drafts", status_code=201)
async def create_draft(body: DraftBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await require_own_client(coach_id, body.client_id)
    if body.model not in MODELS:
        raise HTTPException(status_code=400, detail="Unsupported model")
    consent = await db.assistant_consents.find_one(
        {"coach_id": coach_id, "client_id": body.client_id}, {"_id": 0}
    )
    if not consent or not consent.get("granted"):
        raise HTTPException(status_code=403, detail="This client hasn't given assistant consent yet")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="Assistant key not configured")

    context = await _client_context(coach_id, body.client_id)
    provider, label = MODELS[body.model]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"assist_{coach_id}_{body.client_id}_{uuid.uuid4().hex[:6]}",
        system_message=SYSTEM,
    ).with_model(provider, body.model)

    prompt = (
        f"Write {KINDS[body.kind]}.\n\n"
        f"COACH REQUEST: {body.coach_prompt.strip() or 'None'}\n\n"
        f"CLIENT DATA:\n{context}\n\n"
        "Keep it under 250 words. This is a draft for the coach only."
    )
    try:
        content = await chat.send_message(UserMessage(text=prompt))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Assistant unavailable: {str(exc)[:120]}")

    draft = {
        "id": f"draft_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": body.client_id,
        "kind": body.kind,
        "model": body.model,
        "model_label": label,
        "content": content if isinstance(content, str) else str(content),
        "status": "draft",
        "created_at": datetime.now(timezone.utc),
    }
    await db.assistant_drafts.insert_one(dict(draft))
    return {**draft, "created_at": _iso(draft["created_at"])}


@router.get("/drafts")
async def list_drafts(client_id: str | None = None, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    q: dict = {"coach_id": coach_id}
    if client_id:
        q["client_id"] = client_id
    docs = await db.assistant_drafts.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [{**d, "created_at": _iso(d.get("created_at"))} for d in docs]


class StatusBody(BaseModel):
    status: str = Field(pattern="^(draft|used|discarded)$")


@router.put("/drafts/{draft_id}")
async def set_draft_status(draft_id: str, body: StatusBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.assistant_drafts, draft_id, coach_id, "Draft")
    await db.assistant_drafts.update_one({"id": draft_id}, {"$set": {"status": body.status}})
    return {"ok": True}


@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.assistant_drafts, draft_id, coach_id, "Draft")
    await db.assistant_drafts.delete_one({"id": draft_id})
    return {"ok": True}


@router.get("/models")
async def list_models(user: dict = Depends(get_current_user)):
    await require_module(user, MODULE)
    workspace_coach_id(user)
    return [{"id": k, "label": v[1], "provider": v[0], "default": k == DEFAULT_MODEL}
            for k, v in MODELS.items()]
