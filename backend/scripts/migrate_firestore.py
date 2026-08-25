"""
Migrate legacy Firestore (project: somatic-wealth) -> Co-Coachify MongoDB.

Firestore layout discovered:
  users/{uid}                         -> users
  coaches/{coachUid}/programs/{pid}   -> programs (+ embedded sessions -> coaching_sessions)
  assignments/{id}                    -> user_programs
  coach_client_links/{id}             -> sets users.coach_id
  connection_requests/{id}            -> name/email enrichment
  messages/{id}                       -> messages (chat)
  checkins/{id}                       -> client_logs (workout) -> feeds Coach Inbox

Firestore UIDs are reused as Mongo user_id / program id so every relation lines up,
and Google login (matched by email) resolves the migrated coach/client accounts.
"""
import os
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
from pymongo import MongoClient

import bcrypt

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

KEY = Path(__file__).parent / "serviceAccountKey.json"
cred = credentials.Certificate(str(KEY))
firebase_admin.initialize_app(cred)
fs = firestore.client()

mc = MongoClient(os.environ["MONGO_URL"])
db = mc[os.environ["DB_NAME"]]

NOW = datetime.now(timezone.utc)

CATEGORY_MAP = {
    "fitness": "fitness",
    "breathwork": "breathwork",
    "yoga": "yoga",
    "mobility": "mobility",
    "mindfulness": "mindfulness",
    "journaling": "mindfulness",
    "accountability": "mindfulness",
    None: "fitness",
}
DIFFICULTY = {"beginner", "intermediate", "advanced"}
SPECIALTY_MAP = {"personal_trainer": "fitness"}

# Accounts that get a password so they can be logged into via JWT (for testing).
# Real users normally sign in with Google (matched by email).
TEST_PASSWORDS = {
    "jcgfit@gmail.com": "Coach1234!",
    "ilovejeremygillespie@gmail.com": "Client1234!",
}


def dt(v):
    if v is None:
        return NOW
    if type(v).__name__ == "DatetimeWithNanoseconds":
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
    if isinstance(v, datetime):
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d
        except ValueError:
            return NOW
    return NOW


def humanize(ex_id):
    if not ex_id:
        return None
    return ex_id.replace("_", " ").replace("-", " ").title()


def hash_pw(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


def wipe():
    for c in ["users", "user_sessions", "programs", "coaching_sessions",
              "user_programs", "client_logs", "messages", "invites",
              "daily_habits", "purchases"]:
        db[c].delete_many({})
    print("Wiped content collections.")


def migrate_users():
    # Base users from the users collection
    fs_users = {d.id: d.to_dict() for d in fs.collection("users").stream()}

    # Enrich names/emails from connection_requests
    enrich = {}  # uid -> {name, email}
    for d in fs.collection("connection_requests").stream():
        x = d.to_dict()
        cu = x.get("clientUid")
        if cu:
            enrich.setdefault(cu, {})
            if x.get("clientDisplayName"):
                enrich[cu]["name"] = x["clientDisplayName"]
            if x.get("clientEmail"):
                enrich[cu]["email"] = x["clientEmail"]
    # names from checkins/messages as last resort
    for d in fs.collection("messages").stream():
        x = d.to_dict()
        cu = x.get("clientId")
        if cu and cu not in enrich and x.get("clientName"):
            enrich.setdefault(cu, {})["name"] = x["clientName"]

    # coach_client_links -> coach_id map + referenced client uids
    links = [d.to_dict() for d in fs.collection("coach_client_links").stream()]
    coach_of = {}  # clientUid -> coachUid  (active links win)
    for l in links:
        if l.get("clientUid") and l.get("coachUid"):
            if l.get("status") == "active" or l["clientUid"] not in coach_of:
                coach_of[l["clientUid"]] = l["coachUid"]

    # Ensure every linked/assigned client uid exists (placeholder if missing doc)
    referenced = set(coach_of.keys()) | set(coach_of.values())
    for d in fs.collection("assignments").stream():
        x = d.to_dict()
        if x.get("clientId"):
            referenced.add(x["clientId"])
        if x.get("coachId"):
            referenced.add(x["coachId"])

    docs = []
    for uid in set(fs_users.keys()) | referenced:
        u = fs_users.get(uid, {})
        e = enrich.get(uid, {})
        email = (u.get("emailLowercase") or u.get("email") or e.get("email") or "").lower()
        role = u.get("role")
        is_placeholder = uid not in fs_users
        if is_placeholder:
            role = role or ("coach" if uid in set(coach_of.values()) else "client")
            if not email:
                email = f"legacy_{uid[:10].lower()}@cocoachify.local"
        name = u.get("displayName") or e.get("name") or (email.split("@")[0] if email else "Client")
        specialty = SPECIALTY_MAP.get(u.get("practitionerType"), "fitness") if role == "coach" else None

        user = {
            "user_id": uid,
            "email": email,
            "name": name,
            "picture": None,
            "password_hash": hash_pw(TEST_PASSWORDS[email]) if email in TEST_PASSWORDS else None,
            "role": role,
            "coach_specialty": specialty,
            "onboarding_completed": True,
            "is_premium": True,
            "coach_id": coach_of.get(uid),
            "created_at": dt(u.get("createdAt")),
            "legacy_uid": uid,
            "legacy_placeholder": is_placeholder,
        }
        docs.append(user)

    if docs:
        db.users.insert_many(docs)

    # Invites from coach inviteCode
    inv = []
    for uid, u in fs_users.items():
        if u.get("role") == "coach" and u.get("inviteCode"):
            inv.append({
                "id": f"inv_{uid[:12]}",
                "coach_id": uid,
                "code": u["inviteCode"].upper(),
                "created_at": dt(u.get("updatedAt")),
            })
    if inv:
        db.invites.insert_many(inv)

    coaches = [d for d in docs if d["role"] == "coach"]
    clients = [d for d in docs if d["role"] == "client"]
    print(f"Users: {len(docs)} ({len(coaches)} coaches, {len(clients)} clients, "
          f"{sum(1 for d in docs if d['legacy_placeholder'])} placeholders)")
    return {d["user_id"] for d in docs}


def map_exercise(ex):
    name = humanize(ex.get("exerciseDefId"))
    if not name:
        note = (ex.get("notes") or "").strip()
        name = (note[:40] + "...") if len(note) > 40 else (note or "Exercise")
    sets = ex.get("sets")
    reps = ex.get("reps")
    block = ex.get("blockType")
    block_label = "" if (not block or block == "standard") else str(block).replace("_", " ").title()
    return {
        "name": name,
        "block_label": block_label,
        "sets": int(sets) if isinstance(sets, (int, float)) else None,
        "reps": str(reps) if reps not in (None, "") else None,
        "duration_seconds": ex.get("durationSeconds"),
        "rest_seconds": ex.get("restSeconds"),
        "form_note": (ex.get("notes") or None),
        "purpose_note": None,
    }


def migrate_programs(valid_users):
    programs, sessions = [], []
    seen_prog = set()
    # (owner, legacy_pid) -> unique mongo program id  (for assignment resolution)
    prog_lookup = {}
    for p in fs.collection_group("programs").stream():
        owner = p.reference.parent.parent.id
        d = p.to_dict()
        legacy_pid = p.id
        # namespace id per-owner so identical doc-ids across coaches don't collide
        pid = legacy_pid if legacy_pid not in seen_prog else f"{legacy_pid}__{owner[:6]}"
        seen_prog.add(pid)
        prog_lookup[(owner, legacy_pid)] = pid

        created = dt(d.get("createdAt"))
        schedule = []
        for s in (d.get("sessions") or []):
            if s.get("isRestDay"):
                schedule.append(None)
                continue
            base_sid = s.get("id") or f"s{len(schedule)}"
            sid = f"{pid}__{base_sid}"
            exs = [map_exercise(e) for e in (s.get("exercises") or [])]
            sessions.append({
                "id": sid,
                "name": s.get("name") or "Session",
                "session_type": s.get("sessionType") or "workout",
                "target_minutes": s.get("targetMinutes") or s.get("longMinutes") or 45,
                "warmup_notes": s.get("warmupNotes") or "",
                "finisher_notes": s.get("finisherNotes") or "",
                "coach_notes": s.get("coachNotes") or s.get("homeworkNote") or "",
                "exercises": exs,
                "owner_id": owner,
                "created_at": created,
            })
            schedule.append(sid)

        total = d.get("totalDays") or len(schedule) or 1
        if len(schedule) < total:
            schedule += [None] * (total - len(schedule))
        else:
            total = len(schedule)

        diff = d.get("difficulty")
        programs.append({
            "id": pid,
            "name": d.get("name") or "Untitled Program",
            "description": d.get("description") or "",
            "category": CATEGORY_MAP.get(d.get("programModality"), "fitness"),
            "difficulty": diff if diff in DIFFICULTY else "beginner",
            "total_days": total,
            "days_per_week": d.get("daysPerWeek") or 3,
            "spotify_url": d.get("playlistUrl"),
            "schedule": schedule,
            "owner_id": owner,
            "is_template": bool(d.get("isTemplate")),
            "tags": d.get("tags") or [],
            "created_at": created,
            "legacy_pid": legacy_pid,
        })

    if sessions:
        db.coaching_sessions.insert_many(sessions)
    if programs:
        db.programs.insert_many(programs)
    print(f"Programs: {len(programs)}, coaching_sessions: {len(sessions)}")
    return prog_lookup


def migrate_assignments(valid_users, prog_lookup):
    ups = []
    for d in fs.collection("assignments").stream():
        x = d.to_dict()
        cid, legacy_pid, coach = x.get("clientId"), x.get("programId"), x.get("coachId")
        pid = prog_lookup.get((coach, legacy_pid))
        if pid is None:
            # fall back to any owner that has this legacy_pid
            pid = next((v for (o, lp), v in prog_lookup.items() if lp == legacy_pid), None)
        if cid not in valid_users or pid is None:
            continue
        ups.append({
            "id": d.id,
            "user_id": cid,
            "program_id": pid,
            "assigned_by": coach,
            "started_at": dt(x.get("startDate")),
            "current_day": x.get("currentDayNumber") or 1,
            "active": bool(x.get("isActive")),
            "completed_days": x.get("completedDays") or [],
        })
    # keep only one active enrollment per user (latest by started_at)
    active_by_user = {}
    for e in ups:
        if e["active"]:
            cur = active_by_user.get(e["user_id"])
            if cur is None or e["started_at"] > cur["started_at"]:
                if cur:
                    cur["active"] = False
                active_by_user[e["user_id"]] = e
            else:
                e["active"] = False
    if ups:
        db.user_programs.insert_many(ups)
    print(f"Assignments -> user_programs: {len(ups)} "
          f"({sum(1 for e in ups if e['active'])} active)")


def migrate_messages(valid_users):
    msgs = []
    for d in fs.collection("messages").stream():
        x = d.to_dict()
        coach, client = x.get("coachId"), x.get("clientId")
        if coach not in valid_users or client not in valid_users:
            continue
        from_client = bool(x.get("fromClient"))
        msgs.append({
            "id": d.id,
            "sender_id": client if from_client else coach,
            "recipient_id": coach if from_client else client,
            "text": x.get("text") or "",
            "created_at": dt(x.get("createdAt")),
        })
    if msgs:
        db.messages.insert_many(msgs)
    print(f"Messages: {len(msgs)}")


def migrate_checkins(valid_users):
    logs = []
    for d in fs.collection("checkins").stream():
        x = d.to_dict()
        cid = x.get("clientId")
        if cid not in valid_users:
            continue
        logs.append({
            "id": d.id,
            "user_id": cid,
            "log_type": "workout",
            "session_id": None,
            "session_name": x.get("sessionName") or None,
            "program_id": None,
            "duration_minutes": None,
            "rpe": None,
            "weight": None,
            "notes": x.get("message") or None,
            "date": dt(x.get("createdAt")),
            "reviewed": bool(x.get("read")),
            "day_number": x.get("dayNumber"),
            "coach_reply": x.get("coachReply") or None,
        })
    if logs:
        db.client_logs.insert_many(logs)
    print(f"Checkins -> client_logs: {len(logs)}")


if __name__ == "__main__":
    wipe()
    valid_users = migrate_users()
    prog_lookup = migrate_programs(valid_users)
    migrate_assignments(valid_users, prog_lookup)
    migrate_messages(valid_users)
    migrate_checkins(valid_users)
    print("\nDONE.")
    print("Coach programs (jcgfit):",
          db.programs.count_documents({"owner_id": "0wj2PJsaAOZBQ145aKKK5l1hZnb2"}))
    print("jcgfit clients:",
          db.users.count_documents({"coach_id": "0wj2PJsaAOZBQ145aKKK5l1hZnb2"}))
