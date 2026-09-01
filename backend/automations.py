"""Automations: rule-based workflows triggered by app events.

Deterministic and simple on purpose (no LLM): a rule is one trigger + a list of
actions. A failing action is logged and skipped — it never blocks the feature
that fired the trigger (e.g. completing a lesson must always succeed even if a
broken automation exists).
"""
import logging
import uuid
from datetime import datetime, timezone

from db import db

logger = logging.getLogger(__name__)

TRIGGER_TYPES = (
    "lesson_completed",
    "course_completed",
    "checkin_submitted",
    "client_connected",
    "membership_started",
    "membership_cancelled",
    "goal_completed",
    "milestone_completed",
)

ACTION_TYPES = (
    "add_tag",
    "remove_tag",
    "move_stage",
    "assign_program",
    "enroll_course",
    "send_chat",
    "send_email",
    "post_announcement",
)


def render(template: str, ctx: dict) -> str:
    out = template or ""
    for k, v in ctx.items():
        out = out.replace("{{" + k + "}}", str(v if v is not None else ""))
    return out


async def _ensure_contact(coach_id: str, client: dict) -> None:
    email = (client.get("email") or "").lower()
    if not email:
        return
    existing = await db.contacts.find_one({"coach_id": coach_id, "email": email}, {"_id": 0, "id": 1})
    if existing:
        return
    await db.contacts.insert_one({
        "id": f"con_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "name": client.get("name") or email,
        "email": email,
        "phone": "",
        "source": "automation",
        "lifecycle": "active",
        "tags": [],
        "notes": "",
        "interest": None,
        "answers": {},
        "user_id": client.get("user_id"),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })


async def _execute_action(coach_id: str, client: dict, action: dict, ctx: dict) -> None:
    kind = action.get("type")
    email = (client.get("email") or "").lower()

    if kind == "add_tag" and action.get("tag"):
        await _ensure_contact(coach_id, client)
        await db.contacts.update_one(
            {"coach_id": coach_id, "email": email},
            {"$addToSet": {"tags": action["tag"]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )

    elif kind == "remove_tag" and action.get("tag"):
        await db.contacts.update_one({"coach_id": coach_id, "email": email}, {"$pull": {"tags": action["tag"]}})

    elif kind == "move_stage" and action.get("stage"):
        await _ensure_contact(coach_id, client)
        await db.contacts.update_one(
            {"coach_id": coach_id, "email": email},
            {"$set": {"lifecycle": action["stage"], "updated_at": datetime.now(timezone.utc)}},
        )

    elif kind == "assign_program" and action.get("program_id"):
        program = await db.programs.find_one({"id": action["program_id"]}, {"_id": 0, "id": 1})
        if program:
            await db.user_programs.update_many(
                {"user_id": client["user_id"], "active": True}, {"$set": {"active": False}}
            )
            await db.user_programs.insert_one({
                "id": f"enr_{uuid.uuid4().hex[:12]}",
                "user_id": client["user_id"],
                "program_id": action["program_id"],
                "assigned_by": coach_id,
                "started_at": datetime.now(timezone.utc),
                "current_day": 1,
                "active": True,
            })

    elif kind == "enroll_course" and action.get("course_id"):
        from routes_courses import enroll_client

        await enroll_client(coach_id, action["course_id"], client["user_id"], source="automation")

    elif kind == "send_chat":
        text = render(action.get("message") or "", ctx).strip()
        if text:
            await db.messages.insert_one({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "sender_id": coach_id,
                "recipient_id": client["user_id"],
                "text": text,
                "created_at": datetime.now(timezone.utc),
            })

    elif kind == "send_email" and email:
        from html import escape

        from email_service import EMAIL_FROM_NAME, send_email

        subject = render(action.get("subject") or "A message from your coach", ctx).strip()[:140]
        body_text = render(action.get("message") or "", ctx).strip()
        if body_text:
            html = (
                '<table role="presentation" width="100%"><tr><td style="padding:24px;'
                'font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6">'
                f'<p style="white-space:pre-wrap;margin:0 0 16px">{escape(body_text)}</p>'
                f'<p style="font-size:12px;color:#888;margin:24px 0 0">Sent by {escape(EMAIL_FROM_NAME)}.</p>'
                "</td></tr></table>"
            )
            await send_email(to=email, subject=subject, html=html)

    elif kind == "post_announcement":
        body_text = render(action.get("message") or "", ctx).strip()
        if body_text:
            await db.community_posts.insert_one({
                "id": f"cp_{uuid.uuid4().hex[:12]}",
                "coach_id": coach_id,
                "author_id": coach_id,
                "kind": "announcement",
                "title": render(action.get("title") or "", ctx).strip()[:160],
                "body": body_text[:6000],
                "course_id": None,
                "image_file_id": None,
                "event": None,
                "pinned": False,
                "created_at": datetime.now(timezone.utc),
            })


async def run_automations(coach_id: str, trigger_type: str, client_id: str, context: dict | None = None) -> None:
    context = context or {}
    rules = await db.automation_rules.find(
        {"coach_id": coach_id, "enabled": True, "trigger.type": trigger_type}, {"_id": 0}
    ).to_list(200)
    if not rules:
        return
    client = await db.users.find_one({"user_id": client_id}, {"_id": 0})
    if not client:
        return
    coach = await db.users.find_one({"user_id": coach_id}, {"_id": 0, "name": 1}) or {}
    ctx = {
        "client_name": (client.get("name") or "there").split(" ")[0],
        "coach_name": coach.get("name") or "your coach",
        "course_title": context.get("course_title", ""),
    }
    for rule in rules:
        trig = rule.get("trigger") or {}
        if trig.get("course_id") and trig.get("course_id") != context.get("course_id"):
            continue
        if trig.get("plan_id") and trig.get("plan_id") != context.get("plan_id"):
            continue
        for action in rule.get("actions") or []:
            try:
                await _execute_action(coach_id, client, action, ctx)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Automation %r action %r failed: %s", rule.get("name"), action.get("type"), exc
                )
