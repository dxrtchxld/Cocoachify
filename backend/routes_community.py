"""Community: posts, comments, reactions, announcements and events (RSVP).

Scope: a coach's workspace. Optionally narrowed to one course (only enrolled
clients + the owning coach can see or post there).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db
from modules import course_enrollment, require_module, workspace_coach_id

router = APIRouter(prefix="/studio/community", tags=["community"])
MODULE = "community"


def _iso(dt):
    if isinstance(dt, datetime):
        return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()
    return dt


async def _require_course_member(user: dict, course_id: str, coach_id: str) -> None:
    course = await db.courses.find_one({"id": course_id, "coach_id": coach_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course["coach_id"] == user["user_id"]:
        return
    enr = await course_enrollment(user["user_id"], course_id)
    if not enr or enr.get("access") != "active":
        raise HTTPException(status_code=403, detail="You don't have access to this community")


class EventInfo(BaseModel):
    starts_at: datetime
    location: str = Field(default="", max_length=200)
    url: str | None = Field(default=None, max_length=400)


class PostBody(BaseModel):
    kind: str = Field(default="post", pattern="^(post|announcement|event)$")
    title: str = Field(default="", max_length=160)
    body: str = Field(min_length=1, max_length=6000)
    course_id: str | None = None
    image_file_id: str | None = None
    event: EventInfo | None = None
    pinned: bool = False


async def _shape_post(p: dict, user: dict, authors: dict) -> dict:
    author = authors.get(p["author_id"]) or {}
    reactions = await db.community_reactions.find({"post_id": p["id"]}, {"_id": 0}).to_list(500)
    counts: dict[str, int] = {}
    mine = None
    for r in reactions:
        counts[r["emoji"]] = counts.get(r["emoji"], 0) + 1
        if r["user_id"] == user["user_id"]:
            mine = r["emoji"]
    out = {
        "id": p["id"],
        "kind": p.get("kind", "post"),
        "title": p.get("title", ""),
        "body": p.get("body", ""),
        "course_id": p.get("course_id"),
        "image_file_id": p.get("image_file_id"),
        "pinned": p.get("pinned", False),
        "created_at": _iso(p.get("created_at")),
        "author": {
            "user_id": p["author_id"],
            "name": author.get("name") or "Member",
            "picture": author.get("picture"),
            "is_coach": author.get("role") == "coach",
        },
        "comment_count": await db.community_comments.count_documents({"post_id": p["id"]}),
        "reactions": counts,
        "my_reaction": mine,
        "can_delete": p["author_id"] == user["user_id"] or user.get("role") == "coach",
    }
    if p.get("event"):
        rsvps = await db.community_rsvps.find({"post_id": p["id"]}, {"_id": 0}).to_list(500)
        out["event"] = {**p["event"], "starts_at": _iso(p["event"].get("starts_at"))}
        out["rsvp_count"] = sum(1 for r in rsvps if r.get("status") == "going")
        out["my_rsvp"] = next((r["status"] for r in rsvps if r["user_id"] == user["user_id"]), None)
    return out


@router.get("/feed")
async def feed(course_id: str | None = None, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    query: dict = {"coach_id": coach_id}
    if course_id:
        await _require_course_member(user, course_id, coach_id)
        query["course_id"] = course_id
    elif user.get("role") != "coach":
        # Clients see workspace-wide posts + posts for courses they're enrolled in
        enrs = await db.course_enrollments.find(
            {"user_id": user["user_id"], "access": "active"}, {"_id": 0, "course_id": 1}
        ).to_list(200)
        ids = [e["course_id"] for e in enrs]
        query["$or"] = [{"course_id": None}, {"course_id": {"$in": ids}}]
    posts = await db.community_posts.find(query, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(200)
    author_ids = list({p["author_id"] for p in posts})
    users = await db.users.find({"user_id": {"$in": author_ids}}, {"_id": 0}).to_list(300)
    authors = {u["user_id"]: u for u in users}
    return [await _shape_post(p, user, authors) for p in posts]


@router.post("/posts", status_code=201)
async def create_post(body: PostBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    is_coach = user.get("role") == "coach"
    if body.kind in ("announcement", "event") and not is_coach:
        raise HTTPException(status_code=403, detail="Only the coach can post announcements and events")
    if body.kind == "event" and not body.event:
        raise HTTPException(status_code=400, detail="Event details required")
    if body.course_id:
        await _require_course_member(user, body.course_id, coach_id)
    if body.image_file_id:
        f = await db.private_files.find_one(
            {"id": body.image_file_id, "coach_id": coach_id}, {"_id": 0, "id": 1}
        )
        if not f:
            raise HTTPException(status_code=404, detail="Image not found")
    post = {
        "id": f"cp_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "author_id": user["user_id"],
        "kind": body.kind,
        "title": body.title.strip(),
        "body": body.body.strip(),
        "course_id": body.course_id,
        "image_file_id": body.image_file_id,
        "event": body.event.model_dump() if body.event else None,
        "pinned": bool(body.pinned) and is_coach,
        "created_at": datetime.now(timezone.utc),
    }
    await db.community_posts.insert_one(dict(post))
    return await _shape_post(post, user, {user["user_id"]: user})


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    post = await db.community_posts.find_one({"id": post_id, "coach_id": coach_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post["author_id"] != user["user_id"] and user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.community_posts.delete_one({"id": post_id})
    await db.community_comments.delete_many({"post_id": post_id})
    await db.community_reactions.delete_many({"post_id": post_id})
    await db.community_rsvps.delete_many({"post_id": post_id})
    return {"ok": True}


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


async def _post_for_member(post_id: str, user: dict, coach_id: str) -> dict:
    post = await db.community_posts.find_one({"id": post_id, "coach_id": coach_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.get("course_id"):
        await _require_course_member(user, post["course_id"], coach_id)
    return post


@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    await _post_for_member(post_id, user, coach_id)
    comments = await db.community_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    ids = list({c["author_id"] for c in comments})
    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0}).to_list(300)
    amap = {u["user_id"]: u for u in users}
    return [
        {
            "id": c["id"],
            "body": c["body"],
            "created_at": _iso(c.get("created_at")),
            "author": {
                "user_id": c["author_id"],
                "name": (amap.get(c["author_id"]) or {}).get("name") or "Member",
                "picture": (amap.get(c["author_id"]) or {}).get("picture"),
                "is_coach": (amap.get(c["author_id"]) or {}).get("role") == "coach",
            },
            "can_delete": c["author_id"] == user["user_id"] or user.get("role") == "coach",
        }
        for c in comments
    ]


@router.post("/posts/{post_id}/comments", status_code=201)
async def add_comment(post_id: str, body: CommentBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    await _post_for_member(post_id, user, coach_id)
    comment = {
        "id": f"cc_{uuid.uuid4().hex[:12]}",
        "post_id": post_id,
        "coach_id": coach_id,
        "author_id": user["user_id"],
        "body": body.body.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    await db.community_comments.insert_one(dict(comment))
    return {**comment, "created_at": _iso(comment["created_at"]),
            "author": {"user_id": user["user_id"], "name": user.get("name"),
                       "picture": user.get("picture"), "is_coach": user.get("role") == "coach"},
            "can_delete": True}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    c = await db.community_comments.find_one({"id": comment_id, "coach_id": coach_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c["author_id"] != user["user_id"] and user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.community_comments.delete_one({"id": comment_id})
    return {"ok": True}


class ReactBody(BaseModel):
    emoji: str = Field(default="❤️", max_length=8)


@router.post("/posts/{post_id}/react")
async def react(post_id: str, body: ReactBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    await _post_for_member(post_id, user, coach_id)
    existing = await db.community_reactions.find_one(
        {"post_id": post_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if existing and existing["emoji"] == body.emoji:
        await db.community_reactions.delete_one({"post_id": post_id, "user_id": user["user_id"]})
        return {"ok": True, "my_reaction": None}
    await db.community_reactions.update_one(
        {"post_id": post_id, "user_id": user["user_id"]},
        {"$set": {"emoji": body.emoji, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True, "my_reaction": body.emoji}


class RsvpBody(BaseModel):
    status: str = Field(pattern="^(going|maybe|no)$")


@router.post("/posts/{post_id}/rsvp")
async def rsvp(post_id: str, body: RsvpBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    post = await _post_for_member(post_id, user, coach_id)
    if post.get("kind") != "event":
        raise HTTPException(status_code=400, detail="Not an event")
    await db.community_rsvps.update_one(
        {"post_id": post_id, "user_id": user["user_id"]},
        {"$set": {"status": body.status, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    going = await db.community_rsvps.count_documents({"post_id": post_id, "status": "going"})
    return {"ok": True, "my_rsvp": body.status, "rsvp_count": going}


@router.get("/events")
async def upcoming_events(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    workspace_coach_id(user)
    now = datetime.now(timezone.utc)
    posts = await db.community_posts.find(
        {"coach_id": coach_id, "kind": "event"}, {"_id": 0}
    ).to_list(200)
    upcoming = []
    for p in posts:
        starts = (p.get("event") or {}).get("starts_at")
        if isinstance(starts, datetime):
            starts = starts.replace(tzinfo=timezone.utc) if starts.tzinfo is None else starts
            if starts >= now.replace(hour=0, minute=0, second=0, microsecond=0):
                upcoming.append(p)
    author_ids = list({p["author_id"] for p in upcoming})
    users = await db.users.find({"user_id": {"$in": author_ids}}, {"_id": 0}).to_list(100)
    authors = {u["user_id"]: u for u in users}
    shaped = [await _shape_post(p, user, authors) for p in upcoming]
    shaped.sort(key=lambda p: p.get("event", {}).get("starts_at") or "")
    return shaped
