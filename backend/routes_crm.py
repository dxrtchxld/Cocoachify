"""Contacts, lead capture forms, lifecycle statuses, audience segments, enrollment history."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db import db
from modules import owned, require_coach, require_module

router = APIRouter(prefix="/studio", tags=["crm"])
MODULE = "crm"

LIFECYCLE = ("lead", "applied", "active", "paused", "churned")


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


def _contact(c: dict) -> dict:
    return {
        "id": c["id"],
        "name": c.get("name") or c.get("email"),
        "email": c.get("email"),
        "phone": c.get("phone"),
        "source": c.get("source", "manual"),
        "lifecycle": c.get("lifecycle", "lead"),
        "tags": c.get("tags") or [],
        "notes": c.get("notes", ""),
        "interest": c.get("interest"),
        "answers": c.get("answers") or {},
        "user_id": c.get("user_id"),
        "created_at": _iso(c.get("created_at")),
        "updated_at": _iso(c.get("updated_at")),
    }


class ContactBody(BaseModel):
    name: str = Field(default="", max_length=120)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    source: str = Field(default="manual", max_length=40)
    lifecycle: str = Field(default="lead")
    tags: list[str] = Field(default_factory=list)
    notes: str = Field(default="", max_length=2000)
    interest: str | None = Field(default=None, max_length=140)


@router.get("/contacts")
async def list_contacts(
    lifecycle: str | None = None, q: str | None = None, tag: str | None = None,
    user: dict = Depends(get_current_user),
):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    query: dict = {"coach_id": coach_id}
    if lifecycle:
        query["lifecycle"] = lifecycle
    if tag:
        query["tags"] = tag
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.contacts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [_contact(c) for c in docs]


@router.get("/contacts/stats")
async def contact_stats(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    out = {"total": await db.contacts.count_documents({"coach_id": coach_id})}
    for stage in LIFECYCLE:
        out[stage] = await db.contacts.count_documents({"coach_id": coach_id, "lifecycle": stage})
    return out


@router.post("/contacts", status_code=201)
async def create_contact(body: ContactBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    if body.lifecycle not in LIFECYCLE:
        raise HTTPException(status_code=400, detail="Invalid lifecycle status")
    email = body.email.lower()
    existing = await db.contacts.find_one({"coach_id": coach_id, "email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A contact with that email already exists")
    doc = {
        "id": f"con_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        **body.model_dump(),
        "email": email,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.contacts.insert_one(dict(doc))
    return _contact(doc)


class LifecycleBody(BaseModel):
    lifecycle: str
    notes: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None


@router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, body: LifecycleBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.contacts, contact_id, coach_id, "Contact")
    if body.lifecycle not in LIFECYCLE:
        raise HTTPException(status_code=400, detail="Invalid lifecycle status")
    update: dict = {"lifecycle": body.lifecycle, "updated_at": datetime.now(timezone.utc)}
    if body.notes is not None:
        update["notes"] = body.notes
    if body.tags is not None:
        update["tags"] = body.tags[:20]
    await db.contacts.update_one({"id": contact_id}, {"$set": update})
    return _contact(await db.contacts.find_one({"id": contact_id}, {"_id": 0}))


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.contacts, contact_id, coach_id, "Contact")
    await db.contacts.delete_one({"id": contact_id})
    return {"ok": True}


@router.get("/contacts/{contact_id}/history")
async def contact_history(contact_id: str, user: dict = Depends(get_current_user)):
    """Enrollment history — programs and courses, matched by linked account or email."""
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    contact = await owned(db.contacts, contact_id, coach_id, "Contact")
    account = None
    if contact.get("user_id"):
        account = await db.users.find_one({"user_id": contact["user_id"]}, {"_id": 0})
    if not account and contact.get("email"):
        account = await db.users.find_one({"email": contact["email"]}, {"_id": 0})
    history: list[dict] = []
    if account:
        for e in await db.user_programs.find({"user_id": account["user_id"]}, {"_id": 0}).to_list(200):
            p = await db.programs.find_one({"id": e["program_id"]}, {"_id": 0, "name": 1})
            history.append({
                "kind": "program",
                "title": p["name"] if p else "Program",
                "status": "active" if e.get("active") else "ended",
                "started_at": _iso(e.get("started_at")),
                "current_day": e.get("current_day"),
            })
        for e in await db.course_enrollments.find({"user_id": account["user_id"]}, {"_id": 0}).to_list(200):
            c = await db.courses.find_one({"id": e["course_id"]}, {"_id": 0, "title": 1})
            history.append({
                "kind": "course",
                "title": c["title"] if c else "Course",
                "status": e.get("access", "active"),
                "started_at": _iso(e.get("started_at")),
                "completed_count": len(e.get("completed_lesson_ids") or []),
            })
    history.sort(key=lambda h: h.get("started_at") or "", reverse=True)
    return {"linked_user_id": account["user_id"] if account else None, "history": history}


class ConvertBody(BaseModel):
    course_id: str | None = None


@router.post("/contacts/{contact_id}/link")
async def link_contact(contact_id: str, body: ConvertBody, user: dict = Depends(get_current_user)):
    """Link a contact to an existing app account with the same email and mark them active."""
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    contact = await owned(db.contacts, contact_id, coach_id, "Contact")
    account = await db.users.find_one({"email": contact["email"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="No app account with that email yet")
    await db.contacts.update_one(
        {"id": contact_id},
        {"$set": {"user_id": account["user_id"], "lifecycle": "active",
                  "updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "user_id": account["user_id"]}


# ---------------- Lead capture forms ----------------

class FormField(BaseModel):
    label: str = Field(min_length=1, max_length=140)
    type: str = Field(default="text", pattern="^(text|textarea|phone|select)$")
    required: bool = False
    options: list[str] = Field(default_factory=list)


class LeadFormBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    intro: str = Field(default="", max_length=1000)
    course_id: str | None = None
    fields: list[FormField] = Field(default_factory=list)
    success_message: str = Field(default="Thanks — we'll be in touch soon.", max_length=500)
    active: bool = True


def _form_public(f: dict) -> dict:
    return {
        "id": f["id"],
        "title": f["title"],
        "intro": f.get("intro", ""),
        "course_id": f.get("course_id"),
        "fields": f.get("fields") or [],
        "success_message": f.get("success_message"),
        "active": f.get("active", True),
        "submissions": f.get("submissions", 0),
        "created_at": _iso(f.get("created_at")),
    }


@router.get("/lead-forms")
async def list_forms(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    docs = await db.lead_forms.find({"coach_id": coach_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [_form_public(f) for f in docs]


@router.post("/lead-forms", status_code=201)
async def create_form(body: LeadFormBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    if body.course_id:
        await owned(db.courses, body.course_id, coach_id, "Course")
    doc = {
        "id": f"frm_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        **body.model_dump(),
        "fields": [{"key": f"f_{uuid.uuid4().hex[:6]}", **f.model_dump()} for f in body.fields],
        "submissions": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.lead_forms.insert_one(dict(doc))
    return _form_public(doc)


@router.delete("/lead-forms/{form_id}")
async def delete_form(form_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.lead_forms, form_id, coach_id, "Form")
    await db.lead_forms.delete_one({"id": form_id})
    return {"ok": True}


# ---------------- Audience segments (rule-based, evaluated live) ----------------

class SegmentBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    lifecycle: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


@router.get("/segments")
async def list_segments(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    docs = await db.segments.find({"coach_id": coach_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = []
    for s in docs:
        out.append({**{k: v for k, v in s.items() if k != "created_at"},
                    "created_at": _iso(s.get("created_at")),
                    "size": await db.contacts.count_documents(_segment_query(coach_id, s))})
    return out


def _segment_query(coach_id: str, seg: dict) -> dict:
    q: dict = {"coach_id": coach_id}
    if seg.get("lifecycle"):
        q["lifecycle"] = {"$in": seg["lifecycle"]}
    if seg.get("tags"):
        q["tags"] = {"$in": seg["tags"]}
    if seg.get("sources"):
        q["source"] = {"$in": seg["sources"]}
    return q


@router.post("/segments", status_code=201)
async def create_segment(body: SegmentBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    bad = [s for s in body.lifecycle if s not in LIFECYCLE]
    if bad:
        raise HTTPException(status_code=400, detail="Invalid lifecycle status")
    doc = {
        "id": f"seg_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc),
    }
    await db.segments.insert_one(dict(doc))
    return {**_segment_out(doc), "size": await db.contacts.count_documents(_segment_query(coach_id, doc))}


def _segment_out(s: dict) -> dict:
    return {
        "id": s["id"], "name": s["name"], "lifecycle": s.get("lifecycle") or [],
        "tags": s.get("tags") or [], "sources": s.get("sources") or [],
        "created_at": _iso(s.get("created_at")),
    }


@router.get("/segments/{segment_id}/contacts")
async def segment_contacts(segment_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    seg = await owned(db.segments, segment_id, coach_id, "Segment")
    docs = await db.contacts.find(_segment_query(coach_id, seg), {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [_contact(c) for c in docs]


@router.delete("/segments/{segment_id}")
async def delete_segment(segment_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.segments, segment_id, coach_id, "Segment")
    await db.segments.delete_one({"id": segment_id})
    return {"ok": True}
