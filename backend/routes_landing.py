"""Public (no-auth) program landing pages + lead capture, and their coach-side config."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db import db
from modules import get_flags, owned, require_coach, require_module

router = APIRouter(tags=["landing"])


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


# ---------------- Coach-side landing config ----------------

class Testimonial(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=600)


class LandingBody(BaseModel):
    headline: str = Field(default="", max_length=160)
    subheadline: str = Field(default="", max_length=300)
    hero_image: str | None = Field(default=None, max_length=500)
    highlights: list[str] = Field(default_factory=list)
    testimonials: list[Testimonial] = Field(default_factory=list)
    cta_label: str = Field(default="Apply now", max_length=40)
    lead_form_id: str | None = None
    published: bool = False


@router.put("/studio/courses/{course_id}/landing")
async def set_landing(course_id: str, body: LandingBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "landing")
    require_coach(user)
    course = await owned(db.courses, course_id, coach_id, "Course")
    if body.lead_form_id:
        await owned(db.lead_forms, body.lead_form_id, coach_id, "Lead form")
    landing = body.model_dump()
    landing["highlights"] = [h[:140] for h in body.highlights[:8]]
    await db.courses.update_one({"id": course_id}, {"$set": {"landing": landing}})
    return {"ok": True, "landing": landing, "slug": course.get("slug"),
            "public_path": f"/p/{course.get('slug')}"}


@router.get("/studio/courses/{course_id}/landing")
async def get_landing(course_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "landing")
    require_coach(user)
    course = await owned(db.courses, course_id, coach_id, "Course")
    return {
        "landing": course.get("landing") or LandingBody().model_dump(),
        "slug": course.get("slug"),
        "public_path": f"/p/{course.get('slug')}",
    }


# ---------------- Public page ----------------

@router.get("/public/courses/{slug}")
async def public_course(slug: str):
    course = await db.courses.find_one({"slug": slug}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Page not found")
    flags = await get_flags(course["coach_id"])
    landing = course.get("landing") or {}
    if not flags.get("landing") or not landing.get("published"):
        raise HTTPException(status_code=404, detail="Page not found")

    coach = await db.users.find_one({"user_id": course["coach_id"]}, {"_id": 0})
    sections = await db.course_modules.find({"course_id": course["id"]}, {"_id": 0}).sort("order", 1).to_list(100)
    lessons = await db.lessons.find(
        {"course_id": course["id"]}, {"_id": 0, "id": 1, "title": 1, "module_id": 1, "order": 1, "duration_minutes": 1}
    ).sort("order", 1).to_list(500)
    outline = [
        {"title": s["title"],
         "lessons": [{"title": l["title"], "duration_minutes": l.get("duration_minutes", 0)}
                     for l in lessons if l.get("module_id") == s["id"]]}
        for s in sections
    ]
    loose = [l for l in lessons if not l.get("module_id")]
    if loose:
        outline.append({"title": "Lessons", "lessons": [
            {"title": l["title"], "duration_minutes": l.get("duration_minutes", 0)} for l in loose]})

    form = None
    if landing.get("lead_form_id"):
        f = await db.lead_forms.find_one(
            {"id": landing["lead_form_id"], "active": True}, {"_id": 0}
        )
        if f:
            form = {"id": f["id"], "title": f["title"], "intro": f.get("intro", ""),
                    "fields": f.get("fields") or [], "success_message": f.get("success_message")}

    return {
        "course": {
            "id": course["id"], "slug": course["slug"], "title": course["title"],
            "subtitle": course.get("subtitle", ""), "description": course.get("description", ""),
            "category": course.get("category"), "cover_image": course.get("cover_image"),
            "pricing_type": course.get("pricing_type", "free"), "price": course.get("price", 0),
            "lesson_count": len(lessons),
        },
        "coach": {
            "name": coach.get("name") if coach else None,
            "brand_logo": coach.get("brand_logo") if coach else None,
            "theme_color": coach.get("theme_color") if coach else None,
            "specialty": coach.get("coach_specialty") if coach else None,
        },
        "landing": landing,
        "outline": outline,
        "lead_form": form,
    }


class LeadBody(BaseModel):
    form_id: str = Field(min_length=1)
    name: str = Field(default="", max_length=120)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    answers: dict[str, str] = Field(default_factory=dict)


@router.post("/public/leads", status_code=201)
async def submit_lead(body: LeadBody):
    form = await db.lead_forms.find_one({"id": body.form_id, "active": True}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    flags = await get_flags(form["coach_id"])
    if not flags.get("crm"):
        raise HTTPException(status_code=404, detail="Form not found")
    valid_keys = {f["key"] for f in form.get("fields") or []}
    answers = {k: str(v)[:1000] for k, v in body.answers.items() if k in valid_keys}
    email = body.email.lower()
    now = datetime.now(timezone.utc)
    existing = await db.contacts.find_one({"coach_id": form["coach_id"], "email": email}, {"_id": 0})
    if existing:
        await db.contacts.update_one(
            {"id": existing["id"]},
            {"$set": {"answers": {**(existing.get("answers") or {}), **answers},
                      "name": body.name.strip() or existing.get("name"),
                      "phone": body.phone.strip() or existing.get("phone"),
                      "updated_at": now}},
        )
    else:
        await db.contacts.insert_one({
            "id": f"con_{uuid.uuid4().hex[:12]}",
            "coach_id": form["coach_id"],
            "name": body.name.strip() or email.split("@")[0],
            "email": email,
            "phone": body.phone.strip(),
            "source": f"form:{form['title']}"[:60],
            "lifecycle": "lead",
            "tags": [],
            "notes": "",
            "interest": form.get("course_id"),
            "answers": answers,
            "user_id": None,
            "created_at": now,
            "updated_at": now,
        })
    await db.lead_forms.update_one({"id": form["id"]}, {"$inc": {"submissions": 1}})
    return {"ok": True, "message": form.get("success_message") or "Thanks — we'll be in touch soon."}
