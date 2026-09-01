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
