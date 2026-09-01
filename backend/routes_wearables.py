"""Wearable sync — Strava (cloud OAuth, no native build required).

Apple Health / Google Health Connect need native modules and a real device
build; they are NOT included here. See PRD notes for that follow-up.

Flow: authenticated client asks us for a Strava authorize URL (state bound to
their user_id + an allow-listed return_to) -> browser round-trip -> Strava
calls our public callback with the code -> we exchange it, store tokens, and
redirect back into the app. All Strava secrets stay server-side.
"""
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from auth import get_current_user
from db import db

router = APIRouter(tags=["wearables"])
public_router = APIRouter(tags=["wearables-public"])

STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "")
STATE_TTL = timedelta(minutes=15)


def _configured() -> None:
    if not STRAVA_CLIENT_ID or not STRAVA_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="Strava isn't configured yet — ask your coach or admin to add the API keys.",
        )


def _allowed_return_to(url: str) -> bool:
    if not url:
        return False
    return url.startswith("frontend://") or (APP_BASE_URL and url.startswith(APP_BASE_URL))


def _callback_url(request_base: str) -> str:
    return f"{request_base}/api/wearables/strava/callback"


@router.get("/wearables/status")
async def wearables_status(user: dict = Depends(get_current_user)):
    conn = await db.wearable_connections.find_one(
        {"user_id": user["user_id"], "provider": "strava"}, {"_id": 0}
    )
    return {
        "strava": {
            "configured": bool(STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET),
            "connected": bool(conn),
            "athlete_id": conn.get("athlete_id") if conn else None,
            "last_synced_at": conn.get("last_synced_at").isoformat() if conn and conn.get("last_synced_at") else None,
        }
    }


@router.get("/wearables/strava/connect-url")
async def strava_connect_url(return_to: str, user: dict = Depends(get_current_user)):
    _configured()
    if not _allowed_return_to(return_to):
        raise HTTPException(status_code=400, detail="Invalid return address")
    if not APP_BASE_URL:
        raise HTTPException(status_code=500, detail="Server missing APP_BASE_URL")
    state = secrets.token_urlsafe(24)
    await db.strava_oauth_states.insert_one({
        "_id": state,
        "user_id": user["user_id"],
        "return_to": return_to,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + STATE_TTL,
    })
    params = {
        "client_id": STRAVA_CLIENT_ID,
        "redirect_uri": _callback_url(APP_BASE_URL),
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read",
        "state": state,
    }
    return {"url": "https://www.strava.com/oauth/authorize?" + urlencode(params)}


@public_router.get("/wearables/strava/callback")
async def strava_callback(
    code: str | None = None, state: str | None = None, error: str | None = None
):
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")
    record = await db.strava_oauth_states.find_one_and_delete({"_id": state})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    return_to = record["return_to"]
    if error or not code:
        return RedirectResponse(f"{return_to}?status=denied")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
    if resp.is_error:
        return RedirectResponse(f"{return_to}?status=error")
    token = resp.json()
    await db.wearable_connections.update_one(
        {"user_id": record["user_id"], "provider": "strava"},
        {"$set": {
            "user_id": record["user_id"],
            "provider": "strava",
            "athlete_id": token.get("athlete", {}).get("id"),
            "access_token": token["access_token"],
            "refresh_token": token["refresh_token"],
            "expires_at": token["expires_at"],
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return RedirectResponse(f"{return_to}?status=connected")


async def _valid_access_token(user_id: str) -> str:
    conn = await db.wearable_connections.find_one({"user_id": user_id, "provider": "strava"}, {"_id": 0})
    if not conn:
        raise HTTPException(status_code=400, detail="Connect Strava first")
    if conn["expires_at"] > int(datetime.now(timezone.utc).timestamp()) + 300:
        return conn["access_token"]
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": conn["refresh_token"],
            },
        )
    if resp.is_error:
        raise HTTPException(status_code=401, detail="Strava authorization expired — reconnect")
    t = resp.json()
    await db.wearable_connections.update_one(
        {"user_id": user_id, "provider": "strava"},
        {"$set": {
            "access_token": t["access_token"], "refresh_token": t["refresh_token"],
            "expires_at": t["expires_at"], "updated_at": datetime.now(timezone.utc),
        }},
    )
    return t["access_token"]


@router.post("/wearables/strava/sync")
async def strava_sync(user: dict = Depends(get_current_user)):
    _configured()
    token = await _valid_access_token(user["user_id"])
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            "https://www.strava.com/api/v3/athlete/activities",
            headers={"Authorization": f"Bearer {token}"},
            params={"page": 1, "per_page": 30},
        )
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Strava rejected the token — reconnect")
    resp.raise_for_status()
    imported = 0
    for a in resp.json():
        existing = await db.wearable_activities.find_one(
            {"user_id": user["user_id"], "provider": "strava", "external_id": str(a["id"])}, {"_id": 0, "id": 1}
        )
        if existing:
            continue
        minutes = round((a.get("moving_time") or 0) / 60)
        distance_km = round((a.get("distance") or 0) / 1000, 2)
        await db.wearable_activities.insert_one({
            "id": f"wact_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "provider": "strava",
            "external_id": str(a["id"]),
            "name": a.get("name"),
            "type": a.get("type"),
            "distance_km": distance_km,
            "moving_minutes": minutes,
            "start_date": a.get("start_date"),
            "created_at": datetime.now(timezone.utc),
        })
        await db.client_logs.insert_one({
            "id": f"log_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "log_type": "workout",
            "session_id": None,
            "session_name": a.get("name") or a.get("type") or "Strava activity",
            "program_id": None,
            "duration_minutes": minutes or None,
            "rpe": None,
            "weight": None,
            "notes": f"Synced from Strava — {a.get('type', 'Activity')}, {distance_km} km" if distance_km else f"Synced from Strava — {a.get('type', 'Activity')}",
            "date": a.get("start_date") or datetime.now(timezone.utc),
            "source": "strava",
            "external_id": str(a["id"]),
        })
        imported += 1
    await db.wearable_connections.update_one(
        {"user_id": user["user_id"], "provider": "strava"},
        {"$set": {"last_synced_at": datetime.now(timezone.utc)}},
    )
    return {"imported": imported}


@router.post("/wearables/strava/disconnect")
async def strava_disconnect(user: dict = Depends(get_current_user)):
    await db.wearable_connections.delete_one({"user_id": user["user_id"], "provider": "strava"})
    return {"ok": True}
