import json
import os
import re
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db

router = APIRouter(tags=["import"])

EXTRACTION_SYSTEM = """You are a fitness program digitizer. You receive a photo or scan of a workout/wellness program (handwritten, printed, screenshot, or PDF page). Extract it into STRICT JSON with this exact shape:
{
  "name": "program name (infer if missing)",
  "description": "1-2 sentence summary",
  "category": "fitness|breathwork|yoga|mobility|mindfulness",
  "difficulty": "beginner|intermediate|advanced",
  "sessions": [
    {
      "day": 1,
      "name": "session name",
      "session_type": "workout|yoga|breathwork|mobility|mindfulness|recovery",
      "target_minutes": 45,
      "coach_notes": "",
      "exercises": [
        {"name": "Exercise Name", "block_label": "", "sets": 3, "reps": "8-10", "rest_seconds": 90, "form_note": null, "purpose_note": null}
      ]
    }
  ]
}
Rules: day numbers start at 1; skip rest days (only include training days); use null for unknown numeric fields; reps is a string; if the image is NOT a workout/wellness program, return {"error": "not_a_program"}. Return ONLY the JSON, no markdown fences, no commentary."""

ALLOWED_LENGTHS = [7, 14, 21, 28, 42, 56, 84]


class ImportBody(BaseModel):
    image_base64: str = Field(min_length=100)


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no json")
    return json.loads(text[start : end + 1])


@router.post("/programs/import-image", status_code=201)
async def import_program_image(body: ImportBody, user: dict = Depends(get_current_user)):
    if user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Coach access required")

    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"import_{uuid.uuid4().hex[:8]}",
        system_message=EXTRACTION_SYSTEM,
    ).with_model("openai", "gpt-5.4")

    try:
        response = await chat.send_message(
            UserMessage(
                text="Extract this program into the JSON format.",
                file_contents=[ImageContent(image_base64=body.image_base64)],
            )
        )
        data = _parse_json(str(response))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="AI extraction failed — try a clearer photo")

    if data.get("error") or not data.get("sessions"):
        raise HTTPException(status_code=422, detail="Couldn't find a program in that image")

    now = datetime.now(timezone.utc)
    category = data.get("category") if data.get("category") in {"fitness", "breathwork", "yoga", "mobility", "mindfulness"} else "fitness"
    difficulty = data.get("difficulty") if data.get("difficulty") in {"beginner", "intermediate", "advanced"} else "beginner"

    # Create sessions
    day_to_session: dict[int, str] = {}
    for s in data["sessions"][:60]:
        try:
            day = max(1, int(s.get("day") or 1))
        except (TypeError, ValueError):
            day = 1
        exercises = []
        for e in (s.get("exercises") or [])[:30]:
            if not e.get("name"):
                continue
            exercises.append({
                "name": str(e["name"])[:120],
                "block_label": str(e.get("block_label") or "")[:60],
                "sets": e.get("sets") if isinstance(e.get("sets"), int) else None,
                "reps": str(e["reps"])[:40] if e.get("reps") is not None else None,
                "duration_seconds": None,
                "rest_seconds": e.get("rest_seconds") if isinstance(e.get("rest_seconds"), int) else None,
                "form_note": str(e["form_note"])[:500] if e.get("form_note") else None,
                "purpose_note": str(e["purpose_note"])[:500] if e.get("purpose_note") else None,
            })
        session_doc = {
            "id": f"ses_{uuid.uuid4().hex[:12]}",
            "name": str(s.get("name") or f"Day {day}")[:100],
            "session_type": s.get("session_type") if s.get("session_type") in {"workout", "yoga", "breathwork", "mobility", "mindfulness", "recovery"} else "workout",
            "target_minutes": s.get("target_minutes") if isinstance(s.get("target_minutes"), int) else 45,
            "warmup_notes": "",
            "finisher_notes": "",
            "coach_notes": str(s.get("coach_notes") or "")[:1000],
            "exercises": exercises,
            "owner_id": user["user_id"],
            "created_at": now,
        }
        await db.coaching_sessions.insert_one(dict(session_doc))
        if day not in day_to_session:
            day_to_session[day] = session_doc["id"]

    max_day = max(day_to_session.keys())
    total_days = next((l for l in ALLOWED_LENGTHS if l >= max_day), 84)
    schedule: list = [None] * total_days
    for day, sid in day_to_session.items():
        if day <= total_days:
            schedule[day - 1] = sid

    workout_days_week1 = len([s for s in schedule[:7] if s])
    program = {
        "id": f"prog_{uuid.uuid4().hex[:12]}",
        "name": str(data.get("name") or "Imported Program")[:100],
        "description": str(data.get("description") or "Imported from a photo.")[:2000],
        "category": category,
        "difficulty": difficulty,
        "total_days": total_days,
        "days_per_week": max(1, min(7, workout_days_week1 or len(day_to_session))),
        "spotify_url": None,
        "schedule": schedule,
        "owner_id": user["user_id"],
        "created_at": now,
    }
    await db.programs.insert_one(dict(program))
    return {"program_id": program["id"], "name": program["name"], "sessions_created": len(day_to_session)}
