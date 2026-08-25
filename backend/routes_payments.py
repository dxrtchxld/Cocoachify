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
    purchase_type: str = Field(pattern="^(subscription|program)$")
    program_id: str | None = None
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

    metadata = {"user_id": user["user_id"], "purchase_type": body.purchase_type}
    if program:
        metadata["program_id"] = program["id"]

    try:
        session = await stripe_checkout.create_checkout_session(
            CheckoutSessionRequest(
                amount=PRICES[body.purchase_type],
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
            "purchase_type": body.purchase_type,
            "program_id": program["id"] if program else None,
            "amount": PRICES[body.purchase_type],
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
    if purchase["purchase_type"] == "subscription":
        await db.users.update_one(
            {"user_id": purchase["user_id"]}, {"$set": {"is_premium": True}}
        )


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
    if event.session_id and event.payment_status:
        await _fulfill(event.session_id, event.payment_status)
    return {"received": True}
