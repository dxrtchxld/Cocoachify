"""Private file library: worksheets, recordings, PDFs, course images.

Files live in private object storage; Mongo stores only references.
Downloads are authorized per request — never public.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db
from modules import course_enrollment, require_coach, workspace_coach_id
from storage import APP_NAME, get_object, put_object

JWT_SECRET = os.environ["JWT_SECRET"]


def media_token(file_id: str, user_id: str) -> str:
    return jwt.encode(
        {"file_id": file_id, "sub": user_id, "type": "media",
         "exp": datetime.now(timezone.utc) + timedelta(hours=6)},
        JWT_SECRET, algorithm="HS256",
    )

router = APIRouter(tags=["library"])

ALLOWED = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/heic": "heic", "image/heif": "heif",
    "application/pdf": "pdf",
    "video/mp4": "mp4", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/wav": "wav",
    "audio/x-m4a": "m4a",
    "text/csv": "csv", "text/plain": "txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
}
MAX_BYTES = 40 * 1024 * 1024  # 40 MB


def _kind(content_type: str) -> str:
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    if content_type.startswith("audio/"):
        return "audio"
    if content_type == "application/pdf":
        return "pdf"
    return "doc"


def _public(f: dict) -> dict:
    return {
        "id": f["id"],
        "title": f.get("title") or f.get("filename") or "File",
        "filename": f.get("filename"),
        "kind": f.get("kind"),
        "content_type": f.get("content_type"),
        "size": f.get("size"),
        "visibility": f.get("visibility"),
        "course_id": f.get("course_id"),
        "url": f"/api/files/private/{f['id']}",
        "created_at": f["created_at"].isoformat() if isinstance(f.get("created_at"), datetime) else f.get("created_at"),
    }


@router.post("/library/files", status_code=201)
async def upload_private_file(
    file: UploadFile = File(...),
    title: str = Form(""),
    visibility: str = Form("private"),
    course_id: str = Form(""),
    user: dict = Depends(get_current_user),
):
    is_coach = user.get("role") == "coach"
    workspace_id = workspace_coach_id(user)  # coach = self, client = their coach
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if visibility not in ("private", "clients", "course"):
        raise HTTPException(status_code=400, detail="Invalid visibility")
    if not is_coach:
        # Clients may upload submissions / community images — visible inside the workspace only.
        visibility = "clients"
        course_id = ""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 40 MB)")
    if visibility == "course":
        if not course_id:
            raise HTTPException(status_code=400, detail="course_id required for course files")
        course = await db.courses.find_one({"id": course_id, "coach_id": user["user_id"]}, {"_id": 0})
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

    ext = ALLOWED[content_type]
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    path = f"{APP_NAME}/private/{user['user_id']}/{file_id}.{ext}"
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except Exception as exc:  # noqa: BLE001
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 402:
            raise HTTPException(status_code=402, detail="Storage quota reached. Add balance to keep uploading.")
        raise HTTPException(status_code=502, detail="Upload failed, please try again")

    doc = {
        "id": file_id,
        "coach_id": workspace_id,
        "uploaded_by": user["user_id"],
        "storage_path": path,
        "filename": file.filename or f"{file_id}.{ext}",
        "title": (title or file.filename or "File").strip()[:140],
        "content_type": content_type,
        "kind": _kind(content_type),
        "size": len(data),
        "visibility": visibility,
        "course_id": course_id or None,
        "shared_with": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.private_files.insert_one(dict(doc))
    return _public(doc)


@router.get("/library/files")
async def list_files(kind: str | None = None, user: dict = Depends(get_current_user)):
    require_coach(user)
    q: dict = {"coach_id": user["user_id"]}
    if kind:
        q["kind"] = kind
    files = await db.private_files.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_public(f) for f in files]


class ShareBody(BaseModel):
    visibility: str = Field(pattern="^(private|clients|course)$")
    client_ids: list[str] = Field(default_factory=list)


@router.put("/library/files/{file_id}/share")
async def share_file(file_id: str, body: ShareBody, user: dict = Depends(get_current_user)):
    require_coach(user)
    f = await db.private_files.find_one({"id": file_id, "coach_id": user["user_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    valid: list[str] = []
    if body.client_ids:
        clients = await db.users.find(
            {"user_id": {"$in": body.client_ids}, "coach_id": user["user_id"]}, {"_id": 0, "user_id": 1}
        ).to_list(200)
        valid = [c["user_id"] for c in clients]
    await db.private_files.update_one(
        {"id": file_id},
        {"$set": {"visibility": body.visibility, "shared_with": valid}},
    )
    updated = await db.private_files.find_one({"id": file_id}, {"_id": 0})
    return _public(updated)


@router.delete("/library/files/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    require_coach(user)
    res = await db.private_files.delete_one({"id": file_id, "coach_id": user["user_id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


async def can_read_file(user: dict, f: dict) -> bool:
    if f.get("coach_id") == user["user_id"] or f.get("uploaded_by") == user["user_id"]:
        return True
    if user["user_id"] in (f.get("shared_with") or []):
        return True
    visibility = f.get("visibility")
    if visibility == "clients":
        return user.get("coach_id") == f.get("coach_id")
    if visibility == "course" and f.get("course_id"):
        enr = await course_enrollment(user["user_id"], f["course_id"])
        return bool(enr and enr.get("access") == "active")
    return False


@router.get("/library/shared")
async def shared_with_me(user: dict = Depends(get_current_user)):
    """Files a client is authorized to see (coach-wide shares, direct shares, enrolled courses)."""
    coach_id = user.get("coach_id")
    enrollments = await db.course_enrollments.find(
        {"user_id": user["user_id"], "access": "active"}, {"_id": 0, "course_id": 1}
    ).to_list(200)
    course_ids = [e["course_id"] for e in enrollments]
    or_clauses: list[dict] = [{"shared_with": user["user_id"]}]
    if coach_id:
        or_clauses.append({"coach_id": coach_id, "visibility": "clients"})
    if course_ids:
        or_clauses.append({"visibility": "course", "course_id": {"$in": course_ids}})
    files = await db.private_files.find({"$or": or_clauses}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [_public(f) for f in files]


@router.get("/library/files/{file_id}/link")
async def signed_link(file_id: str, user: dict = Depends(get_current_user)):
    """Short-lived signed URL so <Image>/<Video> can load a private file without headers."""
    f = await db.private_files.find_one({"id": file_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if not await can_read_file(user, f):
        raise HTTPException(status_code=403, detail="Not authorized to access this file")
    return {"url": f"/api/files/private/{file_id}?t={media_token(file_id, user['user_id'])}",
            "expires_in": 6 * 3600}


@router.get("/files/private/{file_id}")
async def download_private_file(request: Request, file_id: str, t: str | None = None):
    f = await db.private_files.find_one({"id": file_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    user: dict | None = None
    if t:
        try:
            payload = jwt.decode(t, JWT_SECRET, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=403, detail="Link expired")
        if payload.get("type") != "media" or payload.get("file_id") != file_id:
            raise HTTPException(status_code=403, detail="Invalid link")
        user = await db.users.find_one({"user_id": payload.get("sub")}, {"_id": 0})
    else:
        user = await get_current_user(request)
    if not user or not await can_read_file(user, f):
        raise HTTPException(status_code=403, detail="Not authorized to access this file")
    try:
        content, content_type = await run_in_threadpool(get_object, f["storage_path"])
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="File not found")
    total = len(content)
    base_headers = {"Cache-Control": "private, max-age=600", "Accept-Ranges": "bytes"}

    # Range support — required for smooth video seeking in native players.
    range_header = request.headers.get("range") or request.headers.get("Range")
    if range_header and range_header.startswith("bytes="):
        spec = range_header.split("=", 1)[1].split(",")[0].strip()
        start_s, _, end_s = spec.partition("-")
        try:
            if start_s:
                start = int(start_s)
                end = int(end_s) if end_s else total - 1
            else:
                start = max(0, total - int(end_s))
                end = total - 1
        except ValueError:
            start, end = 0, total - 1
        start = max(0, min(start, max(total - 1, 0)))
        end = max(start, min(end, total - 1))
        chunk = content[start : end + 1]
        return Response(
            content=chunk,
            status_code=206,
            media_type=content_type,
            headers={
                **base_headers,
                "Content-Range": f"bytes {start}-{end}/{total}",
                "Content-Length": str(len(chunk)),
            },
        )

    return Response(content=content, media_type=content_type, headers=base_headers)
