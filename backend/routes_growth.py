"""Growth extras: completion certificates, group challenges with leaderboards,
and broadcasts to a segment or a picked list of clients."""
import io
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

from auth import get_current_user
from db import db
from modules import owned, require_coach, require_module, workspace_coach_id

router = APIRouter(prefix="/studio", tags=["growth"])
public_router = APIRouter(prefix="/public", tags=["growth-public"])


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


def _aware(dt):
    if not isinstance(dt, datetime):
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


# ---------------- Certificates ----------------

async def issue_certificate_if_complete(user_id: str, course_id: str) -> tuple[dict | None, bool]:
    """Called after a lesson completion. Idempotent. Returns (certificate, is_newly_issued)."""
    total = await db.lessons.count_documents({"course_id": course_id})
    if not total:
        return None, False
    enr = await db.course_enrollments.find_one({"course_id": course_id, "user_id": user_id}, {"_id": 0})
    if not enr or len(enr.get("completed_lesson_ids") or []) < total:
        return None, False
    existing = await db.certificates.find_one({"course_id": course_id, "user_id": user_id}, {"_id": 0})
    if existing:
        return existing, False
    course = await db.courses.find_one({"id": course_id}, {"_id": 0}) or {}
    coach = await db.users.find_one({"user_id": course.get("coach_id")}, {"_id": 0}) or {}
    client = await db.users.find_one({"user_id": user_id}, {"_id": 0}) or {}
    cert = {
        "id": f"cert_{uuid.uuid4().hex[:12]}",
        "code": uuid.uuid4().hex[:8].upper(),
        "coach_id": course.get("coach_id"),
        "coach_name": coach.get("name"),
        "brand_logo": coach.get("brand_logo"),
        "user_id": user_id,
        "client_name": client.get("name"),
        "course_id": course_id,
        "course_title": course.get("title"),
        "lesson_count": total,
        "issued_at": datetime.now(timezone.utc),
    }
    await db.certificates.insert_one(dict(cert))
    cert.pop("_id", None)
    return cert, True


@router.get("/certificates")
async def list_certificates(user: dict = Depends(get_current_user)):
    await require_module(user, "courses")
    query = {"coach_id": user["user_id"]} if user.get("role") == "coach" else {"user_id": user["user_id"]}
    docs = await db.certificates.find(query, {"_id": 0}).sort("issued_at", -1).to_list(300)
    return [{**d, "issued_at": _iso(d.get("issued_at"))} for d in docs]


@public_router.get("/certificates/{code}")
async def verify_certificate(code: str):
    """Public verification — the certificate code is the shareable proof."""
    cert = await db.certificates.find_one({"code": code.upper()}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return {
        "code": cert["code"],
        "client_name": cert.get("client_name") or "Member",
        "course_title": cert.get("course_title") or "Course",
        "coach_name": cert.get("coach_name") or "Coach",
        "lesson_count": cert.get("lesson_count", 0),
        "issued_at": _iso(cert.get("issued_at")),
    }


@public_router.get("/certificates/{code}/pdf")
async def certificate_pdf(code: str):
    cert = await db.certificates.find_one({"code": code.upper()}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    buf = io.BytesIO()
    width, height = landscape(A4)
    c = canvas.Canvas(buf, pagesize=landscape(A4))

    # Luxe Dark certificate.
    c.setFillColorRGB(0.039, 0.039, 0.039)
    c.rect(0, 0, width, height, stroke=0, fill=1)
    c.setStrokeColorRGB(0.898, 0.816, 0.631)
    c.setLineWidth(2)
    c.rect(28, 28, width - 56, height - 56, stroke=1, fill=0)
    c.setLineWidth(0.5)
    c.rect(40, 40, width - 80, height - 80, stroke=1, fill=0)

    c.setFillColorRGB(0.898, 0.816, 0.631)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(width / 2, height - 108, "CERTIFICATE OF COMPLETION")

    c.setFillColorRGB(0.64, 0.64, 0.64)
    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2, height - 150, "This certifies that")

    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 34)
    c.drawCentredString(width / 2, height - 200, (cert.get("client_name") or "Member")[:48])

    c.setFillColorRGB(0.64, 0.64, 0.64)
    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2, height - 232, "has successfully completed")

    c.setFillColorRGB(0.898, 0.816, 0.631)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 272, (cert.get("course_title") or "Course")[:64])

    c.setFillColorRGB(0.64, 0.64, 0.64)
    c.setFont("Helvetica", 10)
    issued = _aware(cert.get("issued_at"))
    date_str = issued.strftime("%B %d, %Y") if issued else ""
    lessons = cert.get("lesson_count", 0)
    c.drawCentredString(
        width / 2, height - 302,
        f"{lessons} lesson{'' if lessons == 1 else 's'}  ·  Coached by {cert.get('coach_name') or 'Coach'}",
    )

    c.setStrokeColorRGB(0.20, 0.20, 0.20)
    c.setLineWidth(0.8)
    c.line(120, 130, width - 120, 130)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setFont("Helvetica", 9)
    c.drawString(120, 110, f"Issued {date_str}")
    c.drawRightString(width - 120, 110, f"Verification code  {cert.get('code')}")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0.898, 0.816, 0.631)
    c.drawCentredString(width / 2, 78, "CO-COACHIFY")

    c.showPage()
    c.save()
    pdf = buf.getvalue()
    safe = "".join(ch for ch in (cert.get("course_title") or "certificate") if ch.isalnum() or ch in " -_")[:40].strip()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe or "certificate"}.pdf"'},
    )


# ---------------- Challenges + leaderboard ----------------

METRICS = {
    "workouts": "Workouts logged",
    "minutes": "Active minutes",
    "checkins": "Check-ins sent",
    "lessons": "Lessons completed",
}


class ChallengeBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=1000)
    metric: str = Field(default="workouts", pattern="^(workouts|minutes|checkins|lessons)$")
    target: int = Field(default=0, ge=0, le=100000)
    starts_at: datetime | None = None
    days: int = Field(default=14, ge=1, le=180)


def _challenge_public(c: dict, extra: dict | None = None) -> dict:
    out = {
        "id": c["id"], "title": c["title"], "description": c.get("description", ""),
        "metric": c.get("metric"), "metric_label": METRICS.get(c.get("metric"), ""),
        "target": c.get("target", 0),
        "starts_at": _iso(c.get("starts_at")), "ends_at": _iso(c.get("ends_at")),
        "participants": c.get("participants") or [],
    }
    if extra:
        out.update(extra)
    return out


@router.get("/challenges")
async def list_challenges(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "community")
    docs = await db.challenges.find({"coach_id": coach_id}, {"_id": 0}).sort("starts_at", -1).to_list(100)
    now = datetime.now(timezone.utc)
    out = []
    for c in docs:
        ends = _aware(c.get("ends_at"))
        starts = _aware(c.get("starts_at"))
        status = "upcoming" if starts and starts > now else "ended" if ends and ends < now else "live"
        out.append(_challenge_public(c, {
            "status": status,
            "joined": user["user_id"] in (c.get("participants") or []),
            "participant_count": len(c.get("participants") or []),
        }))
    return out


@router.post("/challenges", status_code=201)
async def create_challenge(body: ChallengeBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "community")
    require_coach(user)
    starts = body.starts_at or datetime.now(timezone.utc)
    doc = {
        "id": f"chl_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "title": body.title.strip(),
        "description": body.description.strip(),
        "metric": body.metric,
        "target": body.target,
        "starts_at": starts,
        "ends_at": starts + timedelta(days=body.days),
        "participants": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.challenges.insert_one(dict(doc))
    return _challenge_public(doc, {"status": "live", "joined": False, "participant_count": 0})


@router.post("/challenges/{challenge_id}/join")
async def join_challenge(challenge_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "community")
    challenge = await db.challenges.find_one({"id": challenge_id, "coach_id": coach_id}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    joined = user["user_id"] in (challenge.get("participants") or [])
    await db.challenges.update_one(
        {"id": challenge_id},
        {"$pull": {"participants": user["user_id"]}} if joined
        else {"$addToSet": {"participants": user["user_id"]}},
    )
    return {"ok": True, "joined": not joined}


@router.delete("/challenges/{challenge_id}")
async def delete_challenge(challenge_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "community")
    require_coach(user)
    await owned(db.challenges, challenge_id, coach_id, "Challenge")
    await db.challenges.delete_one({"id": challenge_id})
    return {"ok": True}


@router.get("/challenges/{challenge_id}/leaderboard")
async def leaderboard(challenge_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "community")
    challenge = await db.challenges.find_one({"id": challenge_id, "coach_id": coach_id}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    ids = challenge.get("participants") or []
    if not ids:
        return {"challenge": _challenge_public(challenge), "rows": []}
    start, end = _aware(challenge.get("starts_at")), _aware(challenge.get("ends_at"))
    window = {"$gte": start, "$lte": end}
    metric = challenge.get("metric")
    scores: dict[str, float] = {i: 0 for i in ids}

    if metric in ("workouts", "minutes"):
        logs = await db.client_logs.find(
            {"user_id": {"$in": ids}, "log_type": "workout", "date": window},
            {"_id": 0, "user_id": 1, "duration_minutes": 1},
        ).to_list(5000)
        for l in logs:
            scores[l["user_id"]] = scores.get(l["user_id"], 0) + (
                1 if metric == "workouts" else (l.get("duration_minutes") or 0)
            )
    elif metric == "checkins":
        rows = await db.checkin_responses.find(
            {"client_id": {"$in": ids}, "created_at": window}, {"_id": 0, "client_id": 1}
        ).to_list(5000)
        for r in rows:
            scores[r["client_id"]] = scores.get(r["client_id"], 0) + 1
    else:
        rows = await db.lesson_completions.find(
            {"user_id": {"$in": ids}, "completed_at": window}, {"_id": 0, "user_id": 1}
        ).to_list(5000)
        for r in rows:
            scores[r["user_id"]] = scores.get(r["user_id"], 0) + 1

    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "picture": 1}).to_list(500)
    umap = {u["user_id"]: u for u in users}
    rows_out = [
        {
            "user_id": uid,
            "name": (umap.get(uid) or {}).get("name") or "Member",
            "picture": (umap.get(uid) or {}).get("picture"),
            "score": round(score, 1),
            "is_me": uid == user["user_id"],
        }
        for uid, score in scores.items()
    ]
    rows_out.sort(key=lambda r: -r["score"])
    for i, r in enumerate(rows_out):
        r["rank"] = i + 1
    return {"challenge": _challenge_public(challenge), "rows": rows_out}


# ---------------- Broadcasts ----------------

class BroadcastBody(BaseModel):
    title: str = Field(default="", max_length=140)
    message: str = Field(min_length=1, max_length=3000)
    segment_id: str | None = None
    client_ids: list[str] = Field(default_factory=list)
    send_as_message: bool = True
    post_to_community: bool = False


@router.post("/broadcasts", status_code=201)
async def send_broadcast(body: BroadcastBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "crm")
    require_coach(user)

    targets: set[str] = set()
    if body.segment_id:
        from routes_crm import _segment_query

        seg = await owned(db.segments, body.segment_id, coach_id, "Segment")
        contacts = await db.contacts.find(_segment_query(coach_id, seg), {"_id": 0, "email": 1, "user_id": 1}).to_list(2000)
        emails = [c["email"] for c in contacts if c.get("email")]
        linked = [c["user_id"] for c in contacts if c.get("user_id")]
        accounts = await db.users.find(
            {"coach_id": coach_id, "$or": [{"email": {"$in": emails}}, {"user_id": {"$in": linked}}]},
            {"_id": 0, "user_id": 1},
        ).to_list(2000)
        targets |= {a["user_id"] for a in accounts}
    if body.client_ids:
        picked = await db.users.find(
            {"user_id": {"$in": body.client_ids}, "coach_id": coach_id}, {"_id": 0, "user_id": 1}
        ).to_list(2000)
        targets |= {p["user_id"] for p in picked}

    now = datetime.now(timezone.utc)
    text = f"{body.title.strip()}\n\n{body.message.strip()}" if body.title.strip() else body.message.strip()
    sent = 0
    if body.send_as_message and targets:
        await db.messages.insert_many([
            {
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "sender_id": coach_id,
                "recipient_id": t,
                "text": text,
                "broadcast": True,
                "created_at": now,
            }
            for t in targets
        ])
        sent = len(targets)

    posted = False
    if body.post_to_community:
        flags_ok = await db.feature_flags.find_one({"coach_id": coach_id}, {"_id": 0, "flags": 1})
        if (flags_ok or {}).get("flags", {}).get("community"):
            await db.community_posts.insert_one({
                "id": f"cp_{uuid.uuid4().hex[:12]}",
                "coach_id": coach_id,
                "author_id": coach_id,
                "kind": "announcement",
                "title": body.title.strip(),
                "body": body.message.strip(),
                "course_id": None,
                "image_file_id": None,
                "event": None,
                "pinned": True,
                "created_at": now,
            })
            posted = True

    record = {
        "id": f"bc_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "title": body.title.strip(),
        "message": body.message.strip(),
        "segment_id": body.segment_id,
        "recipients": sorted(targets),
        "sent_count": sent,
        "posted_to_community": posted,
        "created_at": now,
    }
    await db.broadcasts.insert_one(dict(record))
    return {"sent_count": sent, "posted_to_community": posted, "id": record["id"]}


@router.get("/broadcasts")
async def list_broadcasts(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "crm")
    require_coach(user)
    docs = await db.broadcasts.find({"coach_id": coach_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [
        {"id": d["id"], "title": d.get("title"), "message": d.get("message"),
         "sent_count": d.get("sent_count", 0), "posted_to_community": d.get("posted_to_community", False),
         "created_at": _iso(d.get("created_at"))}
        for d in docs
    ]
