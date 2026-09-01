"""Coaching plans: milestones, goals, action plans, assignments, check-ins, session notes.

Ownership is enforced server-side on every route. Private coach notes are never
serialized into any client-facing response.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db
from modules import owned, require_coach, require_module, require_own_client

router = APIRouter(prefix="/studio", tags=["plans"])
MODULE = "coaching"


def _aware(dt):
    if not isinstance(dt, datetime):
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _iso(dt):
    d = _aware(dt)
    return d.isoformat() if d else dt


def _clean(doc: dict, drop: tuple[str, ...] = ()) -> dict:
    out = {k: (_iso(v) if isinstance(v, datetime) else v) for k, v in doc.items() if k not in drop}
    return out


async def _coach_ctx(user: dict, client_id: str) -> str:
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await require_own_client(coach_id, client_id)
    return coach_id


# ---------------- Milestones ----------------

class MilestoneBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=1000)
    target_date: datetime | None = None
    order: int = Field(default=0, ge=0, le=999)


@router.get("/clients/{client_id}/milestones")
async def list_milestones(client_id: str, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    docs = await db.milestones.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).sort("order", 1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/clients/{client_id}/milestones", status_code=201)
async def create_milestone(client_id: str, body: MilestoneBody, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    doc = {
        "id": f"mil_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": client_id,
        **body.model_dump(),
        "status": "pending",
        "achieved_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.milestones.insert_one(dict(doc))
    return _clean(doc)


@router.put("/milestones/{milestone_id}")
async def update_milestone(milestone_id: str, body: MilestoneBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.milestones, milestone_id, coach_id, "Milestone")
    await db.milestones.update_one({"id": milestone_id}, {"$set": body.model_dump()})
    return _clean(await db.milestones.find_one({"id": milestone_id}, {"_id": 0}))


@router.post("/milestones/{milestone_id}/achieve")
async def achieve_milestone(milestone_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    m = await owned(db.milestones, milestone_id, coach_id, "Milestone")
    achieved = m.get("status") != "achieved"
    await db.milestones.update_one(
        {"id": milestone_id},
        {"$set": {"status": "achieved" if achieved else "pending",
                  "achieved_at": datetime.now(timezone.utc) if achieved else None}},
    )
    return {"ok": True, "status": "achieved" if achieved else "pending"}


@router.delete("/milestones/{milestone_id}")
async def delete_milestone(milestone_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.milestones, milestone_id, coach_id, "Milestone")
    await db.milestones.delete_one({"id": milestone_id})
    return {"ok": True}


# ---------------- Goals ----------------

class GoalBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    metric: str = Field(default="", max_length=60)
    unit: str = Field(default="", max_length=20)
    target_value: float | None = Field(default=None, ge=-100000, le=1000000)
    current_value: float | None = Field(default=None, ge=-100000, le=1000000)
    due_date: datetime | None = None


@router.get("/clients/{client_id}/goals")
async def list_goals(client_id: str, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    docs = await db.goals.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/clients/{client_id}/goals", status_code=201)
async def create_goal(client_id: str, body: GoalBody, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    doc = {
        "id": f"goal_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": client_id,
        **body.model_dump(),
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    await db.goals.insert_one(dict(doc))
    return _clean(doc)


@router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.goals, goal_id, coach_id, "Goal")
    await db.goals.update_one({"id": goal_id}, {"$set": body.model_dump()})
    return _clean(await db.goals.find_one({"id": goal_id}, {"_id": 0}))


class GoalProgressBody(BaseModel):
    current_value: float = Field(ge=-100000, le=1000000)


@router.post("/goals/{goal_id}/progress")
async def log_goal_progress(goal_id: str, body: GoalProgressBody, user: dict = Depends(get_current_user)):
    """Clients update their own goal progress; coaches update their clients' goals."""
    await require_module(user, MODULE)
    goal = await db.goals.find_one({"id": goal_id}, {"_id": 0})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    allowed = goal["client_id"] == user["user_id"] or goal["coach_id"] == user["user_id"]
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")
    status = goal.get("status", "active")
    target = goal.get("target_value")
    if target is not None and body.current_value >= target:
        status = "achieved"
    await db.goals.update_one(
        {"id": goal_id}, {"$set": {"current_value": body.current_value, "status": status,
                                   "updated_at": datetime.now(timezone.utc)}}
    )
    return {"ok": True, "current_value": body.current_value, "status": status}


@router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.goals, goal_id, coach_id, "Goal")
    await db.goals.delete_one({"id": goal_id})
    return {"ok": True}


# ---------------- Action plans ----------------

class ActionItem(BaseModel):
    text: str = Field(min_length=1, max_length=300)


class ActionPlanBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    items: list[ActionItem] = Field(default_factory=list)


@router.get("/clients/{client_id}/action-plans")
async def list_action_plans(client_id: str, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    docs = await db.action_plans.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [_clean(d) for d in docs]


@router.post("/clients/{client_id}/action-plans", status_code=201)
async def create_action_plan(client_id: str, body: ActionPlanBody, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    doc = {
        "id": f"plan_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": client_id,
        "title": body.title.strip(),
        "items": [
            {"id": f"it_{uuid.uuid4().hex[:8]}", "text": i.text.strip(), "done": False, "done_at": None}
            for i in body.items
        ],
        "created_at": datetime.now(timezone.utc),
    }
    await db.action_plans.insert_one(dict(doc))
    return _clean(doc)


@router.post("/action-plans/{plan_id}/items/{item_id}/toggle")
async def toggle_action_item(plan_id: str, item_id: str, user: dict = Depends(get_current_user)):
    await require_module(user, MODULE)
    plan = await db.action_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Action plan not found")
    if user["user_id"] not in (plan["client_id"], plan["coach_id"]):
        raise HTTPException(status_code=403, detail="Not authorized")
    items = plan.get("items", [])
    found = False
    for it in items:
        if it["id"] == item_id:
            it["done"] = not it.get("done")
            it["done_at"] = datetime.now(timezone.utc) if it["done"] else None
            found = True
    if not found:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.action_plans.update_one({"id": plan_id}, {"$set": {"items": items}})
    return {"ok": True, "items": [{**i, "done_at": _iso(i.get("done_at"))} for i in items]}


@router.delete("/action-plans/{plan_id}")
async def delete_action_plan(plan_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.action_plans, plan_id, coach_id, "Action plan")
    await db.action_plans.delete_one({"id": plan_id})
    return {"ok": True}


# ---------------- Assignments ----------------

class AssignmentBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    instructions: str = Field(default="", max_length=4000)
    due_date: datetime | None = None
    attachments: list[str] = Field(default_factory=list)


async def _valid_files(file_ids: list[str], coach_id: str) -> list[str]:
    if not file_ids:
        return []
    files = await db.private_files.find(
        {"id": {"$in": file_ids}, "coach_id": coach_id}, {"_id": 0, "id": 1}
    ).to_list(50)
    return [f["id"] for f in files]


@router.get("/clients/{client_id}/assignments")
async def list_assignments(client_id: str, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    docs = await db.assignments.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/clients/{client_id}/assignments", status_code=201)
async def create_assignment(client_id: str, body: AssignmentBody, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    doc = {
        "id": f"asg_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": client_id,
        "title": body.title.strip(),
        "instructions": body.instructions.strip(),
        "due_date": body.due_date,
        "attachments": await _valid_files(body.attachments, coach_id),
        "status": "assigned",
        "submission": None,
        "feedback": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.assignments.insert_one(dict(doc))
    # Share attached files with this client so downloads authorize
    if doc["attachments"]:
        await db.private_files.update_many(
            {"id": {"$in": doc["attachments"]}}, {"$addToSet": {"shared_with": client_id}}
        )
    return _clean(doc)


class SubmitBody(BaseModel):
    text: str = Field(default="", max_length=4000)
    file_ids: list[str] = Field(default_factory=list)


@router.post("/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: str, body: SubmitBody, user: dict = Depends(get_current_user)):
    await require_module(user, MODULE)
    a = await db.assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if a["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your assignment")
    submission = {
        "text": body.text.strip(),
        "file_ids": body.file_ids[:10],
        "submitted_at": datetime.now(timezone.utc),
    }
    await db.assignments.update_one(
        {"id": assignment_id}, {"$set": {"submission": submission, "status": "submitted"}}
    )
    return {"ok": True}


class FeedbackBody(BaseModel):
    feedback: str = Field(min_length=1, max_length=2000)


@router.post("/assignments/{assignment_id}/review")
async def review_assignment(assignment_id: str, body: FeedbackBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.assignments, assignment_id, coach_id, "Assignment")
    await db.assignments.update_one(
        {"id": assignment_id},
        {"$set": {"feedback": body.feedback.strip(), "status": "reviewed",
                  "reviewed_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.assignments, assignment_id, coach_id, "Assignment")
    await db.assignments.delete_one({"id": assignment_id})
    return {"ok": True}


# ---------------- Check-in templates & responses ----------------

class Question(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    type: str = Field(default="text", pattern="^(text|scale|number|boolean)$")
    required: bool = True


class TemplateBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    cadence: str = Field(default="weekly", pattern="^(daily|weekly|biweekly|monthly|adhoc)$")
    questions: list[Question] = Field(default_factory=list)
    client_ids: list[str] = Field(default_factory=list)


@router.get("/checkin-templates")
async def list_templates(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    if user.get("role") == "coach":
        docs = await db.checkin_templates.find({"coach_id": coach_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        docs = await db.checkin_templates.find(
            {"coach_id": coach_id, "$or": [{"client_ids": user["user_id"]}, {"client_ids": []}]}, {"_id": 0}
        ).to_list(100)
    return [_clean(d) for d in docs]


@router.post("/checkin-templates", status_code=201)
async def create_template(body: TemplateBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    valid_clients: list[str] = []
    if body.client_ids:
        clients = await db.users.find(
            {"user_id": {"$in": body.client_ids}, "coach_id": coach_id}, {"_id": 0, "user_id": 1}
        ).to_list(300)
        valid_clients = [c["user_id"] for c in clients]
    doc = {
        "id": f"tpl_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "title": body.title.strip(),
        "cadence": body.cadence,
        "questions": [
            {"id": f"q_{uuid.uuid4().hex[:8]}", **q.model_dump()} for q in body.questions
        ],
        "client_ids": valid_clients,
        "created_at": datetime.now(timezone.utc),
    }
    await db.checkin_templates.insert_one(dict(doc))
    return _clean(doc)


@router.delete("/checkin-templates/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.checkin_templates, template_id, coach_id, "Template")
    await db.checkin_templates.delete_one({"id": template_id})
    return {"ok": True}


class ResponseBody(BaseModel):
    answers: dict[str, str | float | bool | None] = Field(default_factory=dict)


@router.post("/checkin-templates/{template_id}/respond", status_code=201)
async def respond_template(template_id: str, body: ResponseBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    tpl = await db.checkin_templates.find_one({"id": template_id, "coach_id": coach_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Check-in not found")
    if tpl.get("client_ids") and user["user_id"] not in tpl["client_ids"]:
        raise HTTPException(status_code=403, detail="This check-in isn't assigned to you")
    valid_ids = {q["id"] for q in tpl.get("questions", [])}
    answers = {k: v for k, v in body.answers.items() if k in valid_ids}
    doc = {
        "id": f"cir_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": user["user_id"],
        "template_id": template_id,
        "template_title": tpl["title"],
        "answers": answers,
        "reviewed": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.checkin_responses.insert_one(dict(doc))
    return _clean(doc)


@router.get("/checkin-responses")
async def list_responses(client_id: str | None = None, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    q: dict = {"coach_id": coach_id}
    if user.get("role") == "coach":
        if client_id:
            await require_own_client(coach_id, client_id)
            q["client_id"] = client_id
    else:
        q["client_id"] = user["user_id"]
    docs = await db.checkin_responses.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    if user.get("role") == "coach":
        ids = list({d["client_id"] for d in docs})
        users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(300)
        names = {u["user_id"]: u.get("name") for u in users}
        for d in docs:
            d["client_name"] = names.get(d["client_id"])
    # attach question labels
    tpl_ids = list({d["template_id"] for d in docs})
    tpls = await db.checkin_templates.find({"id": {"$in": tpl_ids}}, {"_id": 0}).to_list(100)
    qmap = {t["id"]: {q["id"]: q["label"] for q in t.get("questions", [])} for t in tpls}
    for d in docs:
        labels = qmap.get(d["template_id"], {})
        d["answer_list"] = [{"label": labels.get(k, k), "value": v} for k, v in (d.get("answers") or {}).items()]
    return [_clean(d) for d in docs]


@router.post("/checkin-responses/{response_id}/review")
async def review_response(response_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.checkin_responses, response_id, coach_id, "Check-in")
    await db.checkin_responses.update_one({"id": response_id}, {"$set": {"reviewed": True}})
    return {"ok": True}


# ---------------- Session notes (private + shared) ----------------

class NoteBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    date: datetime | None = None
    agenda: str = Field(default="", max_length=4000)
    shared_note: str = Field(default="", max_length=6000)
    private_note: str = Field(default="", max_length=6000)


def _note_for_coach(n: dict) -> dict:
    return _clean(n)


def _note_for_client(n: dict) -> dict:
    """Private coach notes are stripped — never sent to a client."""
    return {
        "id": n["id"],
        "title": n["title"],
        "date": _iso(n.get("date")),
        "agenda": n.get("agenda", ""),
        "shared_note": n.get("shared_note", ""),
        "created_at": _iso(n.get("created_at")),
    }


@router.get("/clients/{client_id}/notes")
async def list_notes(client_id: str, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    docs = await db.session_notes.find({"coach_id": coach_id, "client_id": client_id}, {"_id": 0}).sort("date", -1).to_list(200)
    return [_note_for_coach(d) for d in docs]


@router.post("/clients/{client_id}/notes", status_code=201)
async def create_note(client_id: str, body: NoteBody, user: dict = Depends(get_current_user)):
    coach_id = await _coach_ctx(user, client_id)
    doc = {
        "id": f"note_{uuid.uuid4().hex[:12]}",
        "coach_id": coach_id,
        "client_id": client_id,
        "title": body.title.strip(),
        "date": body.date or datetime.now(timezone.utc),
        "agenda": body.agenda.strip(),
        "shared_note": body.shared_note.strip(),
        "private_note": body.private_note.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    await db.session_notes.insert_one(dict(doc))
    return _note_for_coach(doc)


@router.put("/notes/{note_id}")
async def update_note(note_id: str, body: NoteBody, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.session_notes, note_id, coach_id, "Note")
    update = body.model_dump()
    update["date"] = update.get("date") or datetime.now(timezone.utc)
    await db.session_notes.update_one({"id": note_id}, {"$set": update})
    return _note_for_coach(await db.session_notes.find_one({"id": note_id}, {"_id": 0}))


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    require_coach(user)
    await owned(db.session_notes, note_id, coach_id, "Note")
    await db.session_notes.delete_one({"id": note_id})
    return {"ok": True}


# ---------------- Client portal aggregate ----------------

@router.get("/my/plan")
async def my_plan(user: dict = Depends(get_current_user)):
    coach_id = await require_module(user, MODULE)
    uid = user["user_id"]
    milestones = await db.milestones.find({"client_id": uid}, {"_id": 0}).sort("order", 1).to_list(100)
    goals = await db.goals.find({"client_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    plans = await db.action_plans.find({"client_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    assignments = await db.assignments.find({"client_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    notes = await db.session_notes.find({"client_id": uid}, {"_id": 0}).sort("date", -1).to_list(50)
    templates = await db.checkin_templates.find(
        {"coach_id": coach_id, "$or": [{"client_ids": uid}, {"client_ids": []}]}, {"_id": 0}
    ).to_list(50)
    return {
        "milestones": [_clean(m, drop=("coach_id",)) for m in milestones],
        "goals": [_clean(g, drop=("coach_id",)) for g in goals],
        "action_plans": [_clean(p, drop=("coach_id",)) for p in plans],
        "assignments": [_clean(a, drop=("coach_id",)) for a in assignments],
        "notes": [_note_for_client(n) for n in notes],
        "checkins": [_clean(t, drop=("coach_id", "client_ids")) for t in templates],
    }
