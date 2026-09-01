"""Membership entitlements: explicit grace-period rule + lazy access enforcement.

Rule (explicit): when a billing period ends without a successful payment, access
stays ON for `grace_days` (plan setting, default 7). After the grace window the
subscription is paused and every enrollment granted by that plan is paused too.
A successful payment always restores access immediately.
"""
from datetime import datetime, timedelta, timezone

from db import db

GRACE_DEFAULT_DAYS = 7
INTERVAL_DAYS = {"month": 30, "year": 365}


def _aware(dt):
    if not isinstance(dt, datetime):
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


async def _set_enrollment_access(user_id: str, course_ids: list[str], access: str) -> None:
    if not course_ids:
        return
    await db.course_enrollments.update_many(
        {"user_id": user_id, "course_id": {"$in": course_ids}}, {"$set": {"access": access}}
    )


async def refresh_access(user_id: str) -> None:
    """Apply the grace-period rule for one user's subscriptions (cheap, idempotent)."""
    subs = await db.subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not subs:
        return
    now = datetime.now(timezone.utc)
    for s in subs:
        if s.get("status") in ("cancelled", "paused"):
            continue
        period_end = _aware(s.get("current_period_end"))
        if not period_end or period_end > now:
            continue
        plan = await db.membership_plans.find_one({"id": s["plan_id"]}, {"_id": 0}) or {}
        grace_days = int(plan.get("grace_days", GRACE_DEFAULT_DAYS))
        grace_until = period_end + timedelta(days=grace_days)
        course_ids = plan.get("course_ids") or []
        if now <= grace_until:
            if s.get("status") != "past_due":
                await db.subscriptions.update_one(
                    {"id": s["id"]}, {"$set": {"status": "past_due", "grace_until": grace_until}}
                )
        else:
            await db.subscriptions.update_one(
                {"id": s["id"]}, {"$set": {"status": "paused", "grace_until": grace_until}}
            )
            await _set_enrollment_access(user_id, course_ids, "paused")


async def activate_subscription(user_id: str, plan_id: str, checkout_session_id: str | None = None) -> dict:
    """Idempotent: called on paid checkout / renewal. Grants or restores access."""
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        return {}
    now = datetime.now(timezone.utc)
    days = INTERVAL_DAYS.get(plan.get("interval", "month"), 30)
    sub = await db.subscriptions.find_one({"user_id": user_id, "plan_id": plan_id}, {"_id": 0})
    period_end = now + timedelta(days=days)
    if sub:
        current = _aware(sub.get("current_period_end"))
        if current and current > now:
            period_end = current + timedelta(days=days)  # stack renewals
        await db.subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {"status": "active", "current_period_end": period_end, "grace_until": None,
                      "last_payment_at": now, "checkout_session_id": checkout_session_id or sub.get("checkout_session_id")}},
        )
        sub_id = sub["id"]
    else:
        import uuid
        sub_id = f"sub_{uuid.uuid4().hex[:12]}"
        await db.subscriptions.insert_one({
            "id": sub_id,
            "coach_id": plan["coach_id"],
            "plan_id": plan_id,
            "user_id": user_id,
            "status": "active",
            "started_at": now,
            "current_period_end": period_end,
            "grace_until": None,
            "last_payment_at": now,
            "checkout_session_id": checkout_session_id,
        })
        from automations import run_automations

        await run_automations(plan["coach_id"], "membership_started", user_id, {"plan_id": plan_id})

    # Grant the plan's courses (idempotent enroll / re-activate)
    from routes_courses import enroll_client

    for course_id in plan.get("course_ids") or []:
        await enroll_client(plan["coach_id"], course_id, user_id, source="membership")
    return {"id": sub_id, "current_period_end": period_end}
