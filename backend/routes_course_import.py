"""AI-assisted "Bulk Upload & Auto-Organize" course import.

Coach uploads several files (videos, PDFs, docs, slides) at once, optionally
with a course title hint. We extract text (PDF/DOCX/PPTX) or transcribe
(video/audio via Whisper), then ask an LLM to propose a Course -> Module ->
Lesson structure. Nothing is actually created until the coach reviews and
confirms the suggested plan on the frontend (see /confirm below) — this never
silently creates or overwrites a course.
"""
import io
import json
import os
import uuid
import asyncio
from datetime import datetime, timezone

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db
from modules import require_coach, require_module
from routes_courses import _slugify
from routes_library import ALLOWED, MAX_BYTES, _kind
from storage import APP_NAME, put_object

load_dotenv()

router = APIRouter(prefix="/studio/courses/import", tags=["course-import"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MAX_FILES = 10
TEXT_EXCERPT_CHARS = 3000
LLM_EXCERPT_CHARS = 1200


# ---------------- per-file text extraction (best-effort, never raises) ----------------

def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages[:40])
        return text.strip()
    except Exception:  # noqa: BLE001
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        import docx

        d = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in d.paragraphs).strip()
    except Exception:  # noqa: BLE001
        return ""


def _extract_pptx(data: bytes) -> str:
    try:
        from pptx import Presentation

        prs = Presentation(io.BytesIO(data))
        chunks = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if getattr(shape, "has_text_frame", False) and shape.text_frame.text:
                    chunks.append(shape.text_frame.text)
        return "\n".join(chunks).strip()
    except Exception:  # noqa: BLE001
        return ""


async def _transcribe(tmp_path: str) -> str:
    if not EMERGENT_LLM_KEY:
        return ""
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText

        stt = OpenAISpeechToText(EMERGENT_LLM_KEY)
        result = await stt.transcribe(tmp_path, model="whisper-1")
        return (getattr(result, "text", None) or str(result) or "").strip()
    except Exception:  # noqa: BLE001
        # Some formats (e.g. .mov) aren't accepted by Whisper — that's fine, the
        # file still gets uploaded and gets a filename-based lesson title instead.
        return ""


async def _extract_text(ext: str, content_type: str, kind: str, data: bytes, file_id: str) -> str:
    if content_type == "application/pdf":
        return await run_in_threadpool(_extract_pdf, data)
    if ext == "docx":
        return await run_in_threadpool(_extract_docx, data)
    if ext == "pptx":
        return await run_in_threadpool(_extract_pptx, data)
    if ext in ("txt", "csv"):
        try:
            return data.decode("utf-8", errors="ignore")
        except Exception:  # noqa: BLE001
            return ""
    if kind in ("video", "audio"):
        tmp_path = f"/tmp/cimp_{file_id}.{ext}"
        try:
            with open(tmp_path, "wb") as fh:
                fh.write(data)
            return await _transcribe(tmp_path)
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    return ""


# ---------------- AI structure planning ----------------

def _fallback_plan(course_title_hint: str, items: list[dict]) -> dict:
    """One lesson per file, in upload order — used if the LLM is unavailable or fails."""
    return {
        "course_title": course_title_hint or "New Course",
        "course_subtitle": "",
        "modules": [{
            "title": "Lessons",
            "lessons": [
                {
                    "title": (it["filename"].rsplit(".", 1)[0] or it["filename"])[:140],
                    "summary": "",
                    "file_id": it["file_id"],
                    "kind": it["kind"],
                }
                for it in items
            ],
        }],
    }


async def _build_plan(course_title_hint: str, items: list[dict]) -> dict:
    if not EMERGENT_LLM_KEY or not items:
        return _fallback_plan(course_title_hint, items)

    files_desc = "\n\n".join(
        f"[{i}] filename=\"{it['filename']}\" kind={it['kind']}\n"
        f"content_excerpt: {(it['text_excerpt'][:LLM_EXCERPT_CHARS] or '(no extractable text)')}"
        for i, it in enumerate(items)
    )
    system = (
        "You are a curriculum designer for an online fitness coaching platform. "
        "Given a list of uploaded files (filenames + extracted text/transcript excerpts), "
        "design a clear course structure: group the files into logical modules (e.g. by "
        "week or topic), write a short, engaging lesson title and a 1-2 sentence summary "
        "for EACH file, and suggest an overall course title/subtitle if none was given. "
        "Every input file index must appear in exactly one lesson. Never use the word "
        "'practitioner'. Respond with STRICT JSON only, no markdown fences, no commentary, "
        "matching exactly: "
        '{"course_title": "...", "course_subtitle": "...", "modules": '
        '[{"title": "...", "lessons": [{"title": "...", "summary": "...", "file_index": 0}]}]}'
    )
    hint = f"Coach-provided course title hint: {course_title_hint}\n\n" if course_title_hint else ""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"cimport_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        raw = await chat.send_message(UserMessage(text=f"{hint}Files:\n\n{files_desc}"))
    except Exception:  # noqa: BLE001
        return _fallback_plan(course_title_hint, items)

    text = (raw if isinstance(raw, str) else str(raw)).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        parsed = json.loads(text)
        modules = parsed.get("modules") or []
        seen: set[int] = set()
        out_modules = []
        for m in modules:
            lessons = []
            for l in (m.get("lessons") or []):
                idx = l.get("file_index")
                if not isinstance(idx, int) or idx < 0 or idx >= len(items) or idx in seen:
                    continue
                seen.add(idx)
                lessons.append({
                    "title": str(l.get("title") or items[idx]["filename"])[:140],
                    "summary": str(l.get("summary") or "")[:500],
                    "file_id": items[idx]["file_id"],
                    "kind": items[idx]["kind"],
                })
            if lessons:
                out_modules.append({"title": str(m.get("title") or "Module")[:140], "lessons": lessons})

        # Any file the model skipped still gets a lesson — nothing silently disappears.
        leftover = [i for i in range(len(items)) if i not in seen]
        if leftover:
            out_modules.append({
                "title": "More lessons",
                "lessons": [
                    {
                        "title": items[i]["filename"],
                        "summary": "",
                        "file_id": items[i]["file_id"],
                        "kind": items[i]["kind"],
                    }
                    for i in leftover
                ],
            })
        if not out_modules:
            return _fallback_plan(course_title_hint, items)
        return {
            "course_title": str(parsed.get("course_title") or course_title_hint or "New Course")[:140],
            "course_subtitle": str(parsed.get("course_subtitle") or "")[:200],
            "modules": out_modules,
        }
    except (json.JSONDecodeError, ValueError, TypeError, AttributeError):
        return _fallback_plan(course_title_hint, items)


# ---------------- routes ----------------

async def _process_one_file(f: UploadFile, coach_id: str, uploaded_by: str) -> tuple[dict, dict | None]:
    """Upload + extract text for a single file. Never raises — failures are captured
    in the returned `saved` entry's `error` field so one bad file can't sink the batch."""
    content_type = (f.content_type or "").lower()
    if content_type not in ALLOWED:
        return {"id": None, "filename": f.filename, "kind": "unknown", "size": 0, "error": "Unsupported file type"}, None

    data = await f.read()
    if not data:
        return {"id": None, "filename": f.filename, "kind": "unknown", "size": 0, "error": "Empty file"}, None
    if len(data) > MAX_BYTES:
        return {"id": None, "filename": f.filename, "kind": "unknown", "size": len(data), "error": "File too large (max 40 MB)"}, None

    ext = ALLOWED[content_type]
    file_id = f"file_{uuid.uuid4().hex[:12]}"
    path = f"{APP_NAME}/private/{coach_id}/{file_id}.{ext}"
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except Exception:  # noqa: BLE001
        return {"id": None, "filename": f.filename, "kind": "unknown", "size": len(data), "error": "Upload failed"}, None

    kind = _kind(content_type)
    filename = (f.filename or f"{file_id}.{ext}").strip()
    doc = {
        "id": file_id,
        "coach_id": coach_id,
        "uploaded_by": uploaded_by,
        "storage_path": path,
        "filename": filename,
        "title": filename[:140],
        "content_type": content_type,
        "kind": kind,
        "size": len(data),
        "visibility": "course",
        "course_id": None,  # attached once the coach confirms and the course is created
        "shared_with": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.private_files.insert_one(dict(doc))

    text_excerpt = await _extract_text(ext, content_type, kind, data, file_id)

    saved = {"id": file_id, "filename": filename, "kind": kind, "size": len(data), "error": None}
    context = {
        "file_id": file_id,
        "filename": filename,
        "kind": kind,
        "text_excerpt": (text_excerpt or "")[:TEXT_EXCERPT_CHARS],
    }
    return saved, context


@router.post("", status_code=201)
async def create_import(
    files: list[UploadFile] = File(...),
    course_title: str = Form(""),
    user: dict = Depends(get_current_user),
):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one file")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Upload at most {MAX_FILES} files at a time")

    results = await asyncio.gather(*[_process_one_file(f, coach_id, user["user_id"]) for f in files])
    saved_files = [r[0] for r in results]
    context_items = [r[1] for r in results if r[1] is not None]

    if not context_items:
        raise HTTPException(status_code=400, detail="None of the uploaded files could be processed")

    plan = await _build_plan(course_title.strip(), context_items)

    session = {
        "id": f"cimp_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "status": "ready",
        "course_title_hint": course_title.strip(),
        "files": saved_files,
        "plan": plan,
        "created_at": datetime.now(timezone.utc),
    }
    await db.course_imports.insert_one(dict(session))
    return {"id": session["id"], "files": saved_files, "plan": plan}


@router.get("/{import_id}")
async def get_import(import_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    session = await db.course_imports.find_one({"id": import_id, "coach_id": coach_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    return session


class ConfirmLesson(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    summary: str = Field(default="", max_length=500)
    file_id: str | None = None
    kind: str | None = None


class ConfirmModule(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    lessons: list[ConfirmLesson] = Field(default_factory=list)


class ConfirmBody(BaseModel):
    course_title: str = Field(min_length=1, max_length=140)
    course_subtitle: str = Field(default="", max_length=200)
    category: str = Field(default="fitness", max_length=40)
    modules: list[ConfirmModule] = Field(default_factory=list)


@router.post("/{import_id}/confirm", status_code=201)
async def confirm_import(import_id: str, body: ConfirmBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, "courses")
    require_coach(user)
    session = await db.course_imports.find_one({"id": import_id, "coach_id": coach_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    if session.get("status") == "confirmed":
        raise HTTPException(status_code=400, detail="This import already created a course")
    if not any(m.lessons for m in body.modules):
        raise HTTPException(status_code=400, detail="Add at least one lesson before creating the course")

    slug_base = _slugify(body.course_title)
    slug = slug_base
    while await db.courses.find_one({"slug": slug}, {"_id": 0, "id": 1}):
        slug = f"{slug_base}-{uuid.uuid4().hex[:4]}"

    course = {
        "id": f"crs_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "title": body.course_title.strip(),
        "subtitle": body.course_subtitle.strip(),
        "description": "",
        "category": body.category,
        "cover_image": None,
        "pricing_type": "free",
        "price": 0,
        "status": "draft",
        "slug": slug,
        "created_at": datetime.now(timezone.utc),
    }
    await db.courses.insert_one(dict(course))

    used_file_ids: list[str] = []
    lesson_order = 0
    for m_order, m in enumerate(body.modules):
        if not m.lessons:
            continue
        module_doc = {
            "id": f"sec_{uuid.uuid4().hex[:12]}",
            "coach_id": coach_id,
            "course_id": course["id"],
            "title": m.title.strip(),
            "order": m_order,
            "created_at": datetime.now(timezone.utc),
        }
        await db.course_modules.insert_one(dict(module_doc))
        for l in m.lessons:
            attachments: list[str] = []
            video_file_id = None
            if l.file_id:
                if l.kind == "video":
                    video_file_id = l.file_id
                else:
                    attachments = [l.file_id]
                used_file_ids.append(l.file_id)
            lesson_doc = {
                "id": f"les_{uuid.uuid4().hex[:12]}",
                "coach_id": coach_id,
                "course_id": course["id"],
                "module_id": module_doc["id"],
                "title": l.title.strip(),
                "summary": l.summary.strip(),
                "content": "",
                "video_url": None,
                "video_file_id": video_file_id,
                "duration_minutes": 0,
                "order": lesson_order,
                "attachments": attachments,
                "release": {"type": "immediate", "day_offset": 0, "date": None},
                "chapters": [],
                "coach_note": "",
                "created_at": datetime.now(timezone.utc),
            }
            await db.lessons.insert_one(dict(lesson_doc))
            lesson_order += 1

    if used_file_ids:
        await db.private_files.update_many(
            {"id": {"$in": used_file_ids}, "coach_id": coach_id},
            {"$set": {"course_id": course["id"]}},
        )

    await db.course_imports.update_one(
        {"id": import_id}, {"$set": {"status": "confirmed", "created_course_id": course["id"]}}
    )
    return {"id": course["id"], "slug": course["slug"], "title": course["title"]}
