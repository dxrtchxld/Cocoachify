"""Image upload (auth) + public file serving for brand logos & program covers."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from auth import get_current_user
from db import db
from storage import APP_NAME, get_object, put_object

router = APIRouter(tags=["uploads"])

EXT_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}
MAX_BYTES = 8 * 1024 * 1024  # 8 MB


@router.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content_type = (file.content_type or "").lower()
    if content_type not in EXT_BY_TYPE:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP or HEIC images are allowed")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 8 MB)")

    ext = EXT_BY_TYPE[content_type]
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except Exception as exc:  # noqa: BLE001
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 402:
            raise HTTPException(status_code=402, detail="Storage quota reached. Add balance to keep uploading.")
        raise HTTPException(status_code=502, detail="Upload failed, please try again")

    await db.uploads.insert_one({
        "id": f"up_{uuid.uuid4().hex[:12]}",
        "owner_id": user["user_id"],
        "storage_path": path,
        "content_type": content_type,
        "created_at": datetime.now(timezone.utc),
    })
    # Relative URL — the app prepends its backend base URL when rendering.
    return {"url": f"/api/files/{path}", "path": path}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    """Public read — brand logos and program covers are meant to be shown to clients."""
    record = await db.uploads.find_one({"storage_path": path}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content, content_type = await run_in_threadpool(get_object, path)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "public, max-age=31536000"})

COVER_PRESETS = [
    {"id": "strength_1", "label": "Strength gym", "category": "fitness",
     "url": "https://plus.unsplash.com/premium_photo-1770372268833-74900c17e390?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "strength_2", "label": "Weights room", "category": "fitness",
     "url": "https://plus.unsplash.com/premium_photo-1771954750559-3487fc83706f?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "strength_3", "label": "Boxing", "category": "fitness",
     "url": "https://plus.unsplash.com/premium_photo-1771954748636-035c52d5dc16?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "yoga_1", "label": "Yoga studio", "category": "yoga",
     "url": "https://plus.unsplash.com/premium_photo-1778704257764-1285e53de603?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "yoga_2", "label": "Yoga low light", "category": "yoga",
     "url": "https://plus.unsplash.com/premium_photo-1778704061795-0e12b902344d?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "yoga_3", "label": "Practice class", "category": "yoga",
     "url": "https://plus.unsplash.com/premium_photo-1770426308246-d703f364375f?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "mobility_1", "label": "Stretch at sunrise", "category": "mobility",
     "url": "https://plus.unsplash.com/premium_photo-1664301376084-643810674463?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "running_1", "label": "Trail running", "category": "fitness",
     "url": "https://plus.unsplash.com/premium_photo-1706300226628-8a45754e98bb?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "cycling_1", "label": "Road cycling", "category": "fitness",
     "url": "https://images.unsplash.com/photo-1750967991618-7b64a3025381?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "nutrition_1", "label": "Meal prep", "category": "nutrition",
     "url": "https://images.unsplash.com/photo-1762631383378-115f2d4cbe07?fm=jpg&q=70&w=1400&auto=format&fit=crop"},
    {"id": "mind_1", "label": "Breathwork", "category": "breathwork",
     "url": "https://images.unsplash.com/photo-1680543254043-477fb4dc4677?crop=entropy&cs=srgb&fm=jpg&q=70&w=1400"},
    {"id": "mind_2", "label": "Mindfulness", "category": "mindfulness",
     "url": "https://images.unsplash.com/photo-1787089574609-c3757a355bec?crop=entropy&cs=srgb&fm=jpg&q=70&w=1400"},
]


@router.get("/covers")
async def cover_library(user: dict = Depends(get_current_user)):
    """Ready-made cover photos per category plus the coach's own uploads."""
    mine = await db.uploads.find(
        {"owner_id": user["user_id"]}, {"_id": 0, "storage_path": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(60)
    return {
        "presets": COVER_PRESETS,
        "mine": [{"id": m["storage_path"], "url": f"/api/files/{m['storage_path']}"} for m in mine],
    }
