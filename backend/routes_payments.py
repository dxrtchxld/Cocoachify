import os
from datetime import datetime, timezone

from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    CheckoutStatusResponse,
    StripeCheckout,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db

router = APIRouter(tags=["payments"])

stripe_checkout = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"])

# Server-side price map — never trust amounts from the client
PRICES = {
    "subscription": 9.99,  # Premium unlock
    "program": 19.99,  # One-time program purchase
}


class CheckoutRequest(BaseModel):
    purchase_type: str = Field(pattern="^(subscription|program|course|membership)$")
    program_id: str | None = None
    course_id: str | None = None
    plan_id: str | None = None
    origin_url: str = Field(min_length=1)


@router.post("/checkout/session")
async def create_checkout_session(body: CheckoutRequest, user: dict = Depends(get_current_user)):
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/checkout/cancelled"

    program = None
    if body.purchase_type == "program":
        if not body.program_id:
            raise HTTPException(status_code=400, detail="program_id required")
        program = await db.programs.find_one({"id": body.program_id}, {"_id": 0})
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")

    course = None
    plan = None
    amount = PRICES.get(body.purchase_type, 0)
    coach_id = None
    if body.purchase_type == "course":
        if not body.course_id:
            raise HTTPException(status_code=400, detail="course_id required")
        course = await db.courses.find_one({"id": body.course_id}, {"_id": 0})
        if not course or course.get("status") != "published":
            raise HTTPException(status_code=404, detail="Course not found")
        if course.get("pricing_type") != "one_time" or not course.get("price"):
            raise HTTPException(status_code=400, detail="This course isn't sold as a one-time purchase")
        amount = float(course["price"])
        coach_id = course["coach_id"]
    elif body.purchase_type == "membership":
        if not body.plan_id:
            raise HTTPException(status_code=400, detail="plan_id required")
        plan = await db.membership_plans.find_one({"id": body.plan_id, "active": True}, {"_id": 0})
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        amount = float(plan["price"])
        coach_id = plan["coach_id"]
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing to pay for")

    metadata = {"user_id": user["user_id"], "purchase_type": body.purchase_type}
    if program:
        metadata["program_id"] = program["id"]
    if course:
        metadata["course_id"] = course["id"]
    if plan:
        metadata["plan_id"] = plan["id"]

    try:
        session = await stripe_checkout.create_checkout_session(
            CheckoutSessionRequest(
                amount=amount,
                currency="usd",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
            )
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to start checkout")

    await db.purchases.update_one(
        {"checkout_session_id": session.session_id},
        {"$setOnInsert": {
            "checkout_session_id": session.session_id,
            "user_id": user["user_id"],
            "coach_id": coach_id,
            "purchase_type": body.purchase_type,
            "program_id": program["id"] if program else None,
            "course_id": course["id"] if course else None,
            "plan_id": plan["id"] if plan else None,
            "amount": amount,
            "currency": "usd",
            "payment_status": "pending",
            "active": False,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"checkout_url": session.url, "session_id": session.session_id}


async def _fulfill(session_id: str, payment_status: str) -> None:
    """Idempotent fulfillment for a paid checkout session."""
    if payment_status != "paid":
        return
    purchase = await db.purchases.find_one({"checkout_session_id": session_id}, {"_id": 0})
    if not purchase or purchase.get("active"):
        return
    await db.purchases.update_one(
        {"checkout_session_id": session_id},
        {"$set": {
            "payment_status": "paid",
            "active": True,
            "fulfilled_at": datetime.now(timezone.utc),
        }},
    )
    kind = purchase["purchase_type"]
    if kind == "subscription":
        await db.users.update_one(
            {"user_id": purchase["user_id"]}, {"$set": {"is_premium": True}}
        )
    elif kind == "course" and purchase.get("course_id"):
        course = await db.courses.find_one({"id": purchase["course_id"]}, {"_id": 0})
        if course:
            from routes_courses import enroll_client

            await enroll_client(course["coach_id"], course["id"], purchase["user_id"], source="purchase")
    elif kind == "membership" and purchase.get("plan_id"):
        from memberships import activate_subscription

        await activate_subscription(purchase["user_id"], purchase["plan_id"], session_id)


@router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    purchase = await db.purchases.find_one({"checkout_session_id": session_id}, {"_id": 0})
    if not purchase or purchase["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Checkout session not found")
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to verify payment")
    await _fulfill(session_id, status.payment_status)
    updated = await db.purchases.find_one({"checkout_session_id": session_id}, {"_id": 0})
    return {
        "session_id": session_id,
        "payment_status": status.payment_status,
        "status": status.status,
        "purchase": updated,
    }


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        event = await stripe_checkout.handle_webhook(payload, signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook")

    # Idempotency: record every event id once; replays are ignored.
    event_id = getattr(event, "event_id", None) or getattr(event, "id", None)
    if event_id:
        existing = await db.webhook_events.find_one({"event_id": event_id}, {"_id": 0, "event_id": 1})
        if existing:
            return {"received": True, "duplicate": True}
        await db.webhook_events.insert_one({
            "event_id": event_id,
            "session_id": getattr(event, "session_id", None),
            "type": getattr(event, "event_type", None),
            "received_at": datetime.now(timezone.utc),
        })

    if event.session_id and event.payment_status:
        await _fulfill(event.session_id, event.payment_status)
        if event.payment_status in ("unpaid", "failed", "expired"):
            purchase = await db.purchases.find_one(
                {"checkout_session_id": event.session_id}, {"_id": 0}
            )
            if purchase and purchase.get("purchase_type") == "membership":
                from memberships import refresh_access

                await refresh_access(purchase["user_id"])
    return {"received": True}
