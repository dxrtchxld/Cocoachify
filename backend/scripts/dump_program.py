"""Dump full program structure and counts per coach."""
import json
from collections import Counter
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

KEY = Path(__file__).parent / "serviceAccountKey.json"
cred = credentials.Certificate(str(KEY))
firebase_admin.initialize_app(cred)
fs = firestore.client()


def ser(v):
    if type(v).__name__ == "DatetimeWithNanoseconds":
        return v.isoformat()
    if isinstance(v, dict):
        return {k: ser(x) for k, x in v.items()}
    if isinstance(v, list):
        return [ser(x) for x in v]
    return v


all_progs = list(fs.collection_group("programs").stream())
print(f"TOTAL programs (collection_group): {len(all_progs)}")

# group by parent coach path
by_coach = Counter()
modality = Counter()
tmpl = Counter()
for p in all_progs:
    coach_id = p.reference.parent.parent.id
    by_coach[coach_id] += 1
    d = p.to_dict()
    modality[d.get("programModality")] += 1
    tmpl[d.get("isTemplate")] += 1

print("by coach:", dict(by_coach))
print("modality:", dict(modality))
print("isTemplate:", dict(tmpl))

# Full dump of one non-template fitness program
for p in all_progs:
    d = p.to_dict()
    if d.get("programModality") == "fitness":
        print("\n=== FULL PROGRAM SAMPLE ===")
        print("path:", p.reference.path)
        full = ser(d)
        # trim sessions to first one for readability but show top-level keys
        print("TOP KEYS:", list(d.keys()))
        s = full.get("sessions") or []
        print("num sessions:", len(s))
        full_copy = dict(full)
        full_copy["sessions"] = s[:1]
        print(json.dumps(full_copy, indent=1, default=str)[:3000])
        break

# Check any other subcollections used (collection_group discovery)
print("\n=== other subcollections probe ===")
for name in ["sessions", "exercises", "exerciseLibrary", "habits", "checkins", "notes", "workoutLogs", "logs"]:
    try:
        docs = list(fs.collection_group(name).limit(2).stream())
        if docs:
            print(f"{name}: {len(docs)} sample; path={docs[0].reference.path}")
            print("   keys:", list(docs[0].to_dict().keys()))
    except Exception as e:
        print(f"{name}: err {e}")
