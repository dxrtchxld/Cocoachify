import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from auth import (
    create_jwt,
    get_current_user,
    hash_password,
    new_reset_token,
    new_user_id,
    reset_token_digest,
    user_public,
    verify_password,
)
from db import db
from rate_limit import check_rate_limit, check_rate_limit_failures_only, client_ip, record_failed_attempt

router = APIRouter(prefix="/auth", tags=["auth"])

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
GENERIC_RESET_MESSAGE = {"message": "If that email is registered, a reset link will be sent."}


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
async def login(body: Credentials, request: Request):
    email = body.email.lower()
    ip_key = f"login:ip:{client_ip(request)}"
    email_key = f"login:email:{email}"
    # Only failed attempts count against the quota — legitimate repeat logins
    # (multiple devices, session refresh, etc.) never get an innocent user locked out.
    await check_rate_limit_failures_only(ip_key, max_attempts=40, window_seconds=600)
    await check_rate_limit_failures_only(email_key, max_attempts=15, window_seconds=600)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        await record_failed_attempt(ip_key)
        await record_failed_attempt(email_key)
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


# ---------------- Password reset / change (email+password accounts only) ----------------

class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/forgot-password", status_code=202)
async def forgot_password(body: ForgotBody, request: Request):
    """Always returns the same generic response — never reveals whether an email exists."""
    email = body.email.lower().strip()
    await check_rate_limit(f"forgot:ip:{client_ip(request)}", max_attempts=8, window_seconds=3600)
    await check_rate_limit(f"forgot:email:{email}", max_attempts=3, window_seconds=3600)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user and user.get("password_hash"):
        raw, digest = new_reset_token()
        await db.password_reset_tokens.delete_many({"user_id": user["user_id"]})
        await db.password_reset_tokens.insert_one({
            "user_id": user["user_id"],
            "token_hash": digest,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        })
        base = os.environ.get("APP_BASE_URL", "").rstrip("/")
        link = f"{base}/reset-password?token={raw}"
        try:
            from email_service import EMAIL_FROM_NAME, send_email

            html = (
                '<table role="presentation" width="100%"><tr><td style="padding:24px;'
                'font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6">'
                f'<p style="margin:0 0 16px">Hi {user.get("name") or "there"},</p>'
                '<p style="margin:0 0 16px">We got a request to reset your password. '
                'This link expires in 30 minutes and works once:</p>'
                f'<p style="margin:0 0 16px"><a href="{link}" style="color:#8B5CF6">Reset your password</a></p>'
                '<p style="margin:0 0 16px">If you didn\'t ask for this, you can ignore this email.</p>'
                f'<p style="font-size:12px;color:#888;margin:24px 0 0">Sent by {EMAIL_FROM_NAME}.</p>'
                "</td></tr></table>"
            )
            await send_email(to=email, subject="Reset your password", html=html)
        except Exception:
            pass
    return GENERIC_RESET_MESSAGE


@router.post("/reset-password")
async def reset_password(body: ResetBody, request: Request):
    await check_rate_limit(f"reset:ip:{client_ip(request)}", max_attempts=15, window_seconds=3600)
    digest = reset_token_digest(body.token)
    record = await db.password_reset_tokens.find_one_and_delete(
        {"token_hash": digest, "expires_at": {"$gt": datetime.now(timezone.utc)}}
    )
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    now = datetime.now(timezone.utc)
    result = await db.users.update_one(
        {"user_id": record["user_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": now}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=400, detail="Unable to reset password")
    await db.user_sessions.delete_many({"user_id": record["user_id"]})
    return {"message": "Password reset successfully — please sign in."}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=422, detail="New password must be different")
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": now}},
    )
    return {"message": "Password changed successfully"}


# ---------------- Profile, export & account deletion ----------------

class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@router.put("/me/profile")
async def update_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": body.name.strip()}})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return user_public(updated)


@router.get("/me/export")
async def export_my_data(user: dict = Depends(get_current_user)):
    """Self-serve data export: everything owned by (or about) this account."""
    uid = user["user_id"]
    data: dict = {"profile": user_public(user), "exported_at": datetime.now(timezone.utc).isoformat()}
    if user.get("role") == "coach":
        data["programs"] = await db.programs.find({"owner_id": uid}, {"_id": 0}).to_list(500)
        data["courses"] = await db.courses.find({"coach_id": uid}, {"_id": 0}).to_list(500)
        data["contacts"] = await db.contacts.find({"coach_id": uid}, {"_id": 0}).to_list(2000)
    else:
        data["logs"] = await db.client_logs.find({"user_id": uid}, {"_id": 0}).to_list(2000)
        data["goals"] = await db.goals.find({"client_id": uid}, {"_id": 0}).to_list(500)
        data["milestones"] = await db.milestones.find({"client_id": uid}, {"_id": 0}).to_list(500)
        data["checkin_responses"] = await db.checkin_responses.find({"client_id": uid}, {"_id": 0}).to_list(500)
        data["course_enrollments"] = await db.course_enrollments.find({"user_id": uid}, {"_id": 0}).to_list(500)
        data["certificates"] = await db.certificates.find({"user_id": uid}, {"_id": 0}).to_list(200)

    def _fix(obj):
        if isinstance(obj, dict):
            return {k: _fix(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_fix(v) for v in obj]
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj

    return _fix(data)


@router.post("/me/delete")
async def delete_my_account(user: dict = Depends(get_current_user)):
    """Self-serve account closure: deactivates the account and revokes sessions.

    We anonymize the profile rather than cascading a hard delete across every
    collection (courses, client history, messages) — that would risk destroying
    other people's data (e.g. a coach's clients still need their own records).
    """
    uid = user["user_id"]
    await db.users.update_one(
        {"user_id": uid},
        {"$set": {
            "email": f"deleted-{uid}@cocoachify.local",
            "name": "Deleted user",
            "picture": None,
            "password_hash": None,
            "deleted_at": datetime.now(timezone.utc),
        }},
    )
    await db.user_sessions.delete_many({"user_id": uid})
    await db.password_reset_tokens.delete_many({"user_id": uid})
    return {"ok": True}
