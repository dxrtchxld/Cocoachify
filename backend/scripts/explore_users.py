"""Deep dive: find programs/sessions, dump full sample docs."""
import json
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

KEY = Path(__file__).parent / "serviceAccountKey.json"
cred = credentials.Certificate(str(KEY))
firebase_admin.initialize_app(cred)
fs = firestore.client()


def ser(v):
    t = type(v).__name__
    if t == "DatetimeWithNanoseconds":
        return v.isoformat()
    if isinstance(v, dict):
        return {k: ser(x) for k, x in v.items()}
    if isinstance(v, list):
        return [ser(x) for x in v]
    return v


print("=== FULL USERS ===")
for d in fs.collection("users").stream():
    data = ser(d.to_dict())
    print(f"\nUSER {d.id}:")
    print(json.dumps(data, indent=1, default=str)[:1200])
    subs = list(d.reference.collections())
    if subs:
        print(f"  SUBCOLLECTIONS: {[(s.id, len(list(s.limit(200).stream()))) for s in subs]}")
