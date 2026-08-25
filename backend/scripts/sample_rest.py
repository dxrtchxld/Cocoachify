"""Sample checkins, coach_client_links, connection_requests, messages fully."""
import json
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


for col in ["coach_client_links", "connection_requests", "checkins", "messages"]:
    print(f"\n===== {col} =====")
    for d in list(fs.collection(col).limit(2).stream()):
        print(json.dumps(ser(d.to_dict()), indent=1, default=str)[:800])

# Distinct client uids in links + which coach
print("\n=== LINKS SUMMARY ===")
for d in fs.collection("coach_client_links").stream():
    x = d.to_dict()
    print(x.get("coachUid"), "->", x.get("clientUid"), x.get("status"), x.get("source"))
