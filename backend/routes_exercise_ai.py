"""AI Exercise Guide: on-demand form guidance + safe video search links.

No personal client data is used here — this is general fitness knowledge only,
so it is available to every authenticated user (coach or client), unlike the
consent-gated coach assistant which touches real client data.

CRITICAL SAFETY RULE: video links are NEVER produced by the LLM. They are built
server-side from YouTube's and Google's own search endpoints so they can never
be a hallucinated or dead URL — only real, first-party search pages are returned.
The LLM's only job is short, general text guidance, which is cached per exercise
name so repeat lookups are instant and don't re-spend LLM credits.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote_plus

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from db import db
from rate_limit import check_rate_limit

load_dotenv()

router = APIRouter(prefix="/exercise-guide", tags=["exercise-ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MODEL_PROVIDER, MODEL_ID = "anthropic", "claude-sonnet-4-6"

SYSTEM = (
    "You are a careful fitness form-coach assistant. Given the name of an exercise, "
    "movement, pose or stance, produce SHORT, safe, general guidance. "
    "Never give medical advice, never diagnose, never invent scientific claims, "
    "never invent brand names or product links. "
    "If the input is not a real exercise/movement/pose, say so briefly in 'overview' "
    "and leave the other lists empty. Never use the word 'practitioner'. "
    "Respond with STRICT JSON only, no markdown fences, no commentary, matching exactly: "
    '{"overview": "1-2 sentence summary", "cues": ["short form cue", ...max 5], '
    '"mistakes": ["common mistake", ...max 4], "muscles": ["muscle name", ...max 6], '
    '"safety_note": "one short safety sentence"}'
)

_NAME_RE = re.compile(r"[^a-zA-Z0-9 /\-'()]")


def _clean_name(raw: str) -> str:
    name = _NAME_RE.sub("", raw or "").strip()
    name = re.sub(r"\s+", " ", name)
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Enter a valid exercise, movement or pose name")
    return name[:80]


def _search_urls(name: str) -> dict:
    yt_q = quote_plus(f"{name} proper form tutorial")
    g_q = quote_plus(f"{name} exercise proper form")
    return {
        "youtube_search_url": f"https://www.youtube.com/results?search_query={yt_q}",
        "google_search_url": f"https://www.google.com/search?q={g_q}",
    }


class GuideOut(BaseModel):
    name: str
    overview: str
    cues: list[str]
    mistakes: list[str]
    muscles: list[str]
    safety_note: str
    youtube_search_url: str
    google_search_url: str
    cached: bool


@router.get("", response_model=GuideOut)
async def get_guide(
    name: str = Query(..., min_length=2, max_length=80),
    user: dict = Depends(get_current_user),  # any authenticated coach or client
):
    clean = _clean_name(name)
    key = clean.lower()
    urls = _search_urls(clean)

    existing = await db.exercise_guides.find_one({"name_lower": key}, {"_id": 0})
    if existing:
        return {
            "name": existing.get("name", clean),
            "overview": existing.get("overview", ""),
            "cues": existing.get("cues", []),
            "mistakes": existing.get("mistakes", []),
            "muscles": existing.get("muscles", []),
            "safety_note": existing.get("safety_note", ""),
            **urls,
            "cached": True,
        }

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI guide is not configured")

    # Only fresh (uncached) generations hit the paid model, so rate-limit here —
    # cached lookups above stay unlimited and cheap.
    await check_rate_limit(f"exguide:{user['user_id']}", max_attempts=40, window_seconds=86400)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"exguide_{uuid.uuid4().hex[:8]}",
        system_message=SYSTEM,
    ).with_model(MODEL_PROVIDER, MODEL_ID)

    try:
        raw = await chat.send_message(UserMessage(text=f"Exercise/movement/pose: {clean}"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI guide unavailable: {str(exc)[:120]}")

    text = (raw if isinstance(raw, str) else str(raw)).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("not a dict")
    except (json.JSONDecodeError, ValueError):
        parsed = {"overview": text[:400], "cues": [], "mistakes": [], "muscles": [], "safety_note": ""}

    doc = {
        "id": f"exg_{uuid.uuid4().hex[:12]}",
        "name": clean,
        "name_lower": key,
        "overview": str(parsed.get("overview") or "")[:600],
        "cues": [str(c)[:140] for c in (parsed.get("cues") or []) if str(c).strip()][:5],
        "mistakes": [str(m)[:140] for m in (parsed.get("mistakes") or []) if str(m).strip()][:4],
        "muscles": [str(m)[:40] for m in (parsed.get("muscles") or []) if str(m).strip()][:6],
        "safety_note": str(parsed.get("safety_note") or "")[:200],
        "model": MODEL_ID,
        "created_at": datetime.now(timezone.utc),
    }
    await db.exercise_guides.update_one({"name_lower": key}, {"$set": doc}, upsert=True)
    return {
        "name": doc["name"],
        "overview": doc["overview"],
        "cues": doc["cues"],
        "mistakes": doc["mistakes"],
        "muscles": doc["muscles"],
        "safety_note": doc["safety_note"],
        **urls,
        "cached": False,
    }
