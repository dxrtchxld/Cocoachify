import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from auth import (
    create_jwt,
    get_current_user,
    hash_password,
    new_user_id,
    user_public,
    verify_password,
)
from db import db

router = APIRouter(prefix="/auth", tags=["auth"])

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = None


class SessionExchange(BaseModel):
    session_id: str = Field(min_length=1)


@router.post("/register", status_code=201)
async def register(body: Credentials):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {
        "user_id": new_user_id(),
        "email": email,
        "name": body.name or email.split("@")[0],
        "picture": None,
        "password_hash": hash_password(body.password),
        "role": None,
        "onboarding_completed": False,
        "is_premium": False,
        "coach_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        await db.users.insert_one(dict(user))
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Email already registered")
        raise
    return {"access_token": create_jwt(user["user_id"], email), "user": user_public(user)}


@router.post("/login")
async def login(body: Credentials):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"access_token": create_jwt(user["user_id"], email), "user": user_public(user)}


@router.post("/session")
async def exchange_session(body: SessionExchange):
    """Exchange Emergent Google Auth session_id for a 7-day session_token."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    data = resp.json()

    email = data["email"].lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user = existing
        update = {}
        if not user.get("picture") and data.get("picture"):
            update["picture"] = data["picture"]
        if not user.get("name") and data.get("name"):
            update["name"] = data["name"]
        if update:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
            user.update(update)
    else:
        user = {
            "user_id": new_user_id(),
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "password_hash": None,
            "role": None,
            "onboarding_completed": False,
            "is_premium": False,
            "coach_id": None,
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(user))

    session_token = data["session_token"]
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one(
        {
            "session_id": str(uuid.uuid4()),
            "session_token": session_token,
            "user_id": user["user_id"],
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        }
    )
    return {"session_token": session_token, "user": user_public(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public(user)


@router.post("/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    token = request.headers.get("Authorization", "")[7:].strip()
    await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}
