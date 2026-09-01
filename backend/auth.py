import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, Request

from db import db

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
TOKEN_DAYS = 7
RESET_TOKEN_TTL = timedelta(minutes=30)


def new_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except (ValueError, TypeError):
        return False


def new_reset_token() -> tuple[str, str]:
    """(raw token to email, sha256 digest to store) — never store the raw value."""
    raw = secrets.token_urlsafe(40)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def reset_token_digest(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_jwt(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "custom",
        "iat": now,
        "exp": now + timedelta(days=TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_public(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name") or user["email"].split("@")[0],
        "picture": user.get("picture"),
        "role": user.get("role"),
        "coach_specialty": user.get("coach_specialty"),
        "theme_color": user.get("theme_color"),
        "font_pack": user.get("font_pack"),
        "brand_logo": user.get("brand_logo"),
        "brand_banner": user.get("brand_banner"),
        "brand_tagline": user.get("brand_tagline"),
        "is_coach": user.get("role") == "coach",
        "is_premium": user.get("is_premium", False),
        "coach_id": user.get("coach_id"),
        "onboarding": user.get("onboarding"),
        "onboarding_completed": user.get("onboarding_completed", False),
        "welcomed": user.get("welcomed", False),
    }


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # 1) Try custom JWT (email/password auth)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "custom" and payload.get("sub"):
            user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user:
                if user.get("deleted_at"):
                    raise HTTPException(status_code=401, detail="This account has been deleted")
                changed_at = user.get("password_changed_at")
                if changed_at is not None:
                    if changed_at.tzinfo is None:
                        changed_at = changed_at.replace(tzinfo=timezone.utc)
                    if payload.get("iat", 0) < changed_at.timestamp():
                        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
                return user
    except jwt.InvalidTokenError:
        pass

    # 2) Try Emergent Google session token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if expires_at is not None:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > datetime.now(timezone.utc):
                user = await db.users.find_one(
                    {"user_id": session["user_id"]}, {"_id": 0}
                )
                if user:
                    return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")
