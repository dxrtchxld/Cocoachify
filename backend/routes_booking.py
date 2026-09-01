"""Coach booking / scheduling links.

A coach publishes a booking link (/book/{slug}); clients and prospects pick a
free slot from the coach's weekly availability. Requests land as `pending` and
the coach approves or declines. Approved bookings show on both sides.
"""
import re
import uuid
from datetime import date as date_cls
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db import db
from modules import get_flags, require_coach, require_module, workspace_coach_id

router = APIRouter(tags=["booking"])

TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


def _aware(dt):
    if not isinstance(dt, datetime):
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _tz(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return ZoneInfo("UTC")


def _slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return s[:40] or f"coach-{uuid.uuid4().hex[:6]}"


# ---------------- Models ----------------

class SessionType(BaseModel):
    id: str = Field(default="")
    name: str = Field(min_length=1, max_length=80)
    duration_minutes: int = Field(default=45, ge=10, le=480)
    description: str = Field(default="", max_length=400)
    location: str = Field(default="", max_length=140)


class Window(BaseModel):
    weekday: int = Field(ge=0, le=6)  # 0 = Monday
    start: str = Field(default="09:00")
    end: str = Field(default="17:00")


class SettingsBody(BaseModel):
    enabled: bool = False
    slug: str = Field(default="", max_length=40)
    headline: str = Field(default="", max_length=140)
    intro: str = Field(default="", max_length=600)
    timezone: str = Field(default="UTC", max_length=60)
    session_types: list[SessionType] = Field(default_factory=list)
    availability: list[Window] = Field(default_factory=list)
    slot_interval_minutes: int = Field(default=30, ge=10, le=120)
    buffer_minutes: int = Field(default=0, ge=0, le=120)
    lead_time_hours: int = Field(default=12, ge=0, le=336)
    max_days_ahead: int = Field(default=30, ge=1, le=180)


DEFAULTS = {
    "enabled": False,
    "slug": "",
    "headline": "Book a session",
    "intro": "Pick a time that works for you and I'll confirm it.",
    "timezone": "UTC",
    "session_types": [
        {"id": "st_intro", "name": "Intro call", "duration_minutes": 30, "description": "", "location": ""},
        {"id": "st_session", "name": "Coaching session", "duration_minutes": 60, "description": "", "location": ""},
    ],
    "availability": [{"weekday": d, "start": "09:00", "end": "17:00"} for d in range(0, 5)],
    "slot_interval_minutes": 30,
    "buffer_minutes": 0,
    "lead_time_hours": 12,
    "max_days_ahead": 30,
}


async def _settings_for(coach_id: str) -> dict:
    doc = await db.booking_settings.find_one({"coach_id": coach_id}, {"_id": 0})
    if not doc:
        return {**DEFAULTS, "coach_id": coach_id}
    return {**DEFAULTS, **doc}


# ---------------- Coach config ----------------

@router.get("/studio/booking/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "coaching")
    s = await _settings_for(coach_id)
    s.pop("coach_id", None)
    return {**s, "public_path": f"/book/{s['slug']}" if s.get("slug") else None}


@router.put("/studio/booking/settings")
async def put_settings(body: SettingsBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "coaching")
    require_coach(user)

    for w in body.availability:
        if not TIME_RE.match(w.start) or not TIME_RE.match(w.end):
            raise HTTPException(status_code=400, detail="Times must look like 09:00")
        if w.start >= w.end:
            raise HTTPException(status_code=400, detail="A window must end after it starts")

    slug = _slugify(body.slug or (user.get("name") or "coach"))
    clash = await db.booking_settings.find_one({"slug": slug, "coach_id": {"$ne": coach_id}}, {"_id": 0, "slug": 1})
    if clash:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    types = []
    for t in body.session_types[:10]:
        types.append({**t.model_dump(), "id": t.id or f"st_{uuid.uuid4().hex[:8]}"})

    doc = {
        **body.model_dump(exclude={"session_types", "slug", "availability"}),
        "slug": slug,
        "session_types": types,
        "availability": [w.model_dump() for w in body.availability[:21]],
        "coach_id": coach_id,
        "updated_at": datetime.now(timezone.utc),
    }
    await db.booking_settings.update_one({"coach_id": coach_id}, {"$set": doc}, upsert=True)
    out = await _settings_for(coach_id)
    out.pop("coach_id", None)
    return {**out, "public_path": f"/book/{slug}"}


# ---------------- Slot computation ----------------

def _type_for(settings: dict, type_id: str | None) -> dict:
    types = settings.get("session_types") or []
    if not types:
        raise HTTPException(status_code=400, detail="This coach has no session types set up")
    if type_id:
        for t in types:
            if t["id"] == type_id:
                return t
        raise HTTPException(status_code=404, detail="Session type not found")
    return types[0]


async def _busy(coach_id: str, day_start: datetime, day_end: datetime) -> list[tuple[datetime, datetime]]:
    rows = await db.bookings.find(
        {"coach_id": coach_id, "status": {"$in": ["pending", "confirmed"]},
         "starts_at": {"$lt": day_end}, "ends_at": {"$gt": day_start}},
        {"_id": 0, "starts_at": 1, "ends_at": 1},
    ).to_list(500)
    return [(_aware(r["starts_at"]), _aware(r["ends_at"])) for r in rows]


async def _slots(settings: dict, coach_id: str, day: date_cls, session_type: dict) -> list[str]:
    tz = _tz(settings.get("timezone") or "UTC")
    windows = [w for w in (settings.get("availability") or []) if w["weekday"] == day.weekday()]
    if not windows:
        return []
    duration = timedelta(minutes=session_type["duration_minutes"])
    buffer = timedelta(minutes=settings.get("buffer_minutes", 0))
    step = timedelta(minutes=settings.get("slot_interval_minutes", 30))
    now = datetime.now(timezone.utc)
    earliest = now + timedelta(hours=settings.get("lead_time_hours", 0))
    latest = now + timedelta(days=settings.get("max_days_ahead", 30))

    day_start = datetime.combine(day, time(0, 0), tzinfo=tz).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    busy = await _busy(coach_id, day_start - duration, day_end + duration)

    out: list[str] = []
    for w in windows:
        sh, sm = (int(x) for x in w["start"].split(":"))
        eh, em = (int(x) for x in w["end"].split(":"))
        cursor = datetime.combine(day, time(sh, sm), tzinfo=tz)
        window_end = datetime.combine(day, time(eh, em), tzinfo=tz)
        while cursor + duration <= window_end:
            start_utc = cursor.astimezone(timezone.utc)
            end_utc = start_utc + duration
            if start_utc >= earliest and start_utc <= latest:
                overlap = any(
                    start_utc < b_end + buffer and end_utc + buffer > b_start for b_start, b_end in busy
                )
                if not overlap:
                    out.append(start_utc.isoformat())
            cursor += step
    return sorted(set(out))


# ---------------- Public booking page ----------------

@router.get("/public/book/{slug}")
async def public_booking_page(slug: str):
    s = await db.booking_settings.find_one({"slug": slug}, {"_id": 0})
    if not s or not s.get("enabled"):
        raise HTTPException(status_code=404, detail="Booking page not found")
    flags = await get_flags(s["coach_id"])
    if not flags.get("coaching"):
        raise HTTPException(status_code=404, detail="Booking page not found")
    coach = await db.users.find_one({"user_id": s["coach_id"]}, {"_id": 0}) or {}
    settings = {**DEFAULTS, **s}
    return {
        "slug": slug,
        "headline": settings.get("headline"),
        "intro": settings.get("intro"),
        "timezone": settings.get("timezone"),
        "session_types": settings.get("session_types"),
        "max_days_ahead": settings.get("max_days_ahead"),
        "coach": {
            "name": coach.get("name"),
            "brand_logo": coach.get("brand_logo"),
            "specialty": coach.get("coach_specialty"),
            "picture": coach.get("picture"),
        },
    }


@router.get("/public/book/{slug}/slots")
async def public_slots(slug: str, date: str, session_type_id: str | None = None):
    s = await db.booking_settings.find_one({"slug": slug}, {"_id": 0})
    if not s or not s.get("enabled"):
        raise HTTPException(status_code=404, detail="Booking page not found")
    settings = {**DEFAULTS, **s}
    try:
        day = date_cls.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    st = _type_for(settings, session_type_id)
    slots = await _slots(settings, s["coach_id"], day, st)
    return {"date": date, "session_type": st, "timezone": settings["timezone"], "slots": slots}


class BookBody(BaseModel):
    session_type_id: str | None = None
    starts_at: datetime
    name: str = Field(default="", max_length=80)
    email: EmailStr | None = None
    notes: str = Field(default="", max_length=800)


@router.post("/public/book/{slug}", status_code=201)
async def create_booking(slug: str, body: BookBody, request: Request):
    s = await db.booking_settings.find_one({"slug": slug}, {"_id": 0})
    if not s or not s.get("enabled"):
        raise HTTPException(status_code=404, detail="Booking page not found")
    settings = {**DEFAULTS, **s}
    coach_id = s["coach_id"]
    st = _type_for(settings, body.session_type_id)

    starts = _aware(body.starts_at)
    if not starts:
        raise HTTPException(status_code=400, detail="starts_at required")
    ends = starts + timedelta(minutes=st["duration_minutes"])

    # The slot must still be one the coach actually offers, and still free.
    tz = _tz(settings["timezone"])
    local_day = starts.astimezone(tz).date()
    free = await _slots(settings, coach_id, local_day, st)
    if starts.isoformat() not in free:
        raise HTTPException(status_code=409, detail="That time is no longer available")

    # Signed-in clients get the booking linked to their account.
    user = None
    if request.headers.get("authorization"):
        try:
            user = await get_current_user(request)
        except HTTPException:
            user = None

    name = (user or {}).get("name") if user else body.name.strip()
    email = (user or {}).get("email") if user else (body.email or None)
    if not name:
        raise HTTPException(status_code=400, detail="Please add your name")
    if not email:
        raise HTTPException(status_code=400, detail="Please add your email")

    doc = {
        "id": f"bk_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": (user or {}).get("user_id") if user else None,
        "name": name,
        "email": str(email),
        "notes": body.notes.strip(),
        "session_type_id": st["id"],
        "session_type_name": st["name"],
        "duration_minutes": st["duration_minutes"],
        "location": st.get("location", ""),
        "starts_at": starts,
        "ends_at": ends,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    }
    await db.bookings.insert_one(dict(doc))

    # Prospects become CRM leads so nothing falls through the cracks.
    if not doc["client_id"]:
        existing = await db.contacts.find_one({"coach_id": coach_id, "email": doc["email"]}, {"_id": 0, "id": 1})
        if not existing:
            await db.contacts.insert_one({
                "id": f"ct_{uuid.uuid4().hex[:12]}",
                "coach_id": coach_id,
                "name": name,
                "email": doc["email"],
                "phone": "",
                "stage": "lead",
                "source": "booking",
                "notes": f"Requested {st['name']} on {starts.date().isoformat()}",
                "tags": [],
                "user_id": None,
                "created_at": datetime.now(timezone.utc),
            })

    return _booking_public(doc)


# ---------------- Both-side calendar ----------------

def _booking_public(b: dict) -> dict:
    return {
        "id": b["id"],
        "name": b.get("name"),
        "email": b.get("email"),
        "notes": b.get("notes", ""),
        "session_type_name": b.get("session_type_name"),
        "duration_minutes": b.get("duration_minutes"),
        "location": b.get("location", ""),
        "starts_at": _iso(b.get("starts_at")),
        "ends_at": _iso(b.get("ends_at")),
        "status": b.get("status"),
        "client_id": b.get("client_id"),
    }


@router.get("/studio/booking/requests")
async def list_bookings(status: str | None = None, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "coaching")
    query: dict = {"coach_id": coach_id}
    if user.get("role") != "coach":
        query["client_id"] = user["user_id"]
    if status:
        query["status"] = status
    docs = await db.bookings.find(query, {"_id": 0}).sort("starts_at", 1).to_list(400)
    return [_booking_public(d) for d in docs]


class DecisionBody(BaseModel):
    action: str = Field(pattern="^(confirm|decline|cancel)$")
    message: str = Field(default="", max_length=500)


@router.post("/studio/booking/requests/{booking_id}/decision")
async def decide_booking(booking_id: str, body: DecisionBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "coaching")
    b = await db.bookings.find_one({"id": booking_id, "coach_id": coach_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    is_coach = user.get("role") == "coach"
    if not is_coach:
        if b.get("client_id") != user["user_id"] or body.action != "cancel":
            raise HTTPException(status_code=403, detail="Not authorized")

    status = {"confirm": "confirmed", "decline": "declined", "cancel": "cancelled"}[body.action]
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": status, "decided_at": datetime.now(timezone.utc),
                  "decision_message": body.message.strip()}},
    )

    # Confirmed sessions land in the client's chat so it shows up where they look.
    if status == "confirmed" and b.get("client_id"):
        when = _aware(b["starts_at"]).isoformat()
        text = (
            f"Your {b.get('session_type_name')} is confirmed for {when}."
            + (f"\n\n{body.message.strip()}" if body.message.strip() else "")
        )
        await db.messages.insert_one({
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "sender_id": coach_id,
            "recipient_id": b["client_id"],
            "text": text,
            "created_at": datetime.now(timezone.utc),
        })

    return {"ok": True, "status": status}


@router.get("/studio/booking/link")
async def my_booking_link(user: dict = Depends(get_current_user)):
    """Client-side helper: where do I book with my coach?"""
    coach_id = workspace_coach_id(user)
    s = await db.booking_settings.find_one({"coach_id": coach_id}, {"_id": 0, "slug": 1, "enabled": 1})
    if not s or not s.get("enabled"):
        return {"available": False, "slug": None}
    return {"available": True, "slug": s["slug"], "path": f"/book/{s['slug']}"}
