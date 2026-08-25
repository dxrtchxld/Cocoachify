"""Verify migrated data integrity in Mongo."""
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

COACH = "0wj2PJsaAOZBQ145aKKK5l1hZnb2"

print("counts:",
      "users", db.users.count_documents({}),
      "programs", db.programs.count_documents({}),
      "sessions", db.coaching_sessions.count_documents({}),
      "user_programs", db.user_programs.count_documents({}),
      "messages", db.messages.count_documents({}),
      "logs", db.client_logs.count_documents({}))

# Coach's programs sample
p = db.programs.find_one({"owner_id": COACH, "category": "fitness"}, {"_id": 0})
print("\nsample program:", p["name"], "| days", p["total_days"], "| cat", p["category"],
      "| sched_len", len(p["schedule"]), "| sessions_in_sched",
      len([s for s in p["schedule"] if s]))
# do schedule session ids resolve?
sids = [s for s in p["schedule"] if s]
found = db.coaching_sessions.count_documents({"id": {"$in": sids}})
print("schedule sessions resolvable:", found, "/", len(sids))
s = db.coaching_sessions.find_one({"id": sids[0]}, {"_id": 0}) if sids else None
if s:
    print("first session:", s["name"], "| exercises", len(s["exercises"]))
    print("  ex0:", {k: s["exercises"][0].get(k) for k in ("name", "sets", "reps", "form_note")})

# clients & their active program
print("\nclients of jcgfit:")
for c in db.users.find({"coach_id": COACH}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
    enr = db.user_programs.find_one({"user_id": c["user_id"], "active": True}, {"_id": 0})
    prog = db.programs.find_one({"id": enr["program_id"]}, {"_id": 0, "name": 1}) if enr else None
    print(f"  {c['name']:<22} {c['email']:<32} -> {prog['name'] if prog else 'NO ACTIVE PROGRAM'}")

# test accounts have password
for e in ["jcgfit@gmail.com", "ilovejeremygillespie@gmail.com"]:
    u = db.users.find_one({"email": e}, {"_id": 0, "password_hash": 1, "role": 1})
    print(f"\n{e}: role={u['role']} has_password={bool(u['password_hash'])}")
