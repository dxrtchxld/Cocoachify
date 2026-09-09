import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


async def _get_peer(user: dict, peer_id: str) -> dict:
    """Chat is only allowed between a coach and their connected clients."""
    peer = await db.users.find_one({"user_id": peer_id}, {"_id": 0})
    if not peer:
        raise HTTPException(status_code=404, detail="User not found")
    is_my_coach = user.get("coach_id") == peer_id
    is_my_client = peer.get("coach_id") == user["user_id"]
    if not (is_my_coach or is_my_client):
        raise HTTPException(status_code=403, detail="You can only chat with your coach or clients")
    return peer


class MessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.get("/{peer_id}/messages")
async def get_messages(peer_id: str, after: str | None = None, user: dict = Depends(get_current_user)):
    peer = await _get_peer(user, peer_id)
    query: dict = {
        "$or": [
            {"sender_id": user["user_id"], "recipient_id": peer_id},
            {"sender_id": peer_id, "recipient_id": user["user_id"]},
        ]
    }
    if after:
        try:
            query["created_at"] = {"$gt": datetime.fromisoformat(after)}
        except ValueError:
            pass
    messages = await db.messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(200)
    for m in messages:
        m["created_at"] = m["created_at"].isoformat()
    return {
        "peer": {"user_id": peer["user_id"], "name": peer.get("name"), "picture": peer.get("picture")},
        "messages": messages,
    }


@router.post("/{peer_id}/messages", status_code=201)
async def send_message(peer_id: str, body: MessageBody, user: dict = Depends(get_current_user)):
    await _get_peer(user, peer_id)
    message = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "sender_id": user["user_id"],
        "recipient_id": peer_id,
        "text": body.text.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    await db.messages.insert_one(dict(message))
    message.pop("_id", None)
    message["created_at"] = message["created_at"].isoformat()

    try:
        from routes_push import send_push

        await send_push(
            recipients=[peer_id],
            data={
                "title": user.get("name") or "New message",
                "message": message["text"][:140],
                "action_url": f"/chat/{user['user_id']}",
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chat push failed (non-blocking): %s", exc)

    return message
