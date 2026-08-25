"""One-off: explore the legacy Firestore (project somatic-wealth) structure."""
import json
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

KEY = Path(__file__).parent / "serviceAccountKey.json"

cred = credentials.Certificate(str(KEY))
firebase_admin.initialize_app(cred)
fs = firestore.client()

print("=== TOP-LEVEL COLLECTIONS ===")
for col in fs.collections():
    docs = list(col.limit(1000).stream())
    print(f"\n## collection: {col.id}  (count={len(docs)})")
    for d in docs[:2]:
        data = d.to_dict()
        # summarise keys and types
        keys = {k: type(v).__name__ for k, v in (data or {}).items()}
        print(f"  doc {d.id}: keys={keys}")
        # print subcollections of first doc
        subs = list(d.reference.collections())
        if subs:
            print(f"    subcollections: {[s.id for s in subs]}")
            for s in subs:
                sdocs = list(s.limit(3).stream())
                print(f"      -> {s.id} (count~{len(sdocs)})")
                for sd in sdocs[:1]:
                    sk = {k: type(v).__name__ for k, v in (sd.to_dict() or {}).items()}
                    print(f"         subdoc {sd.id}: keys={sk}")
