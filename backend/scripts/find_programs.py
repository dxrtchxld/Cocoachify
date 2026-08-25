"""Find programs & sessions via collection_group and assignment references."""
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


# Sample assignment to get a programId
a = next(fs.collection("assignments").limit(1).stream())
adata = a.to_dict()
print("SAMPLE ASSIGNMENT:", json.dumps(ser(adata), indent=1, default=str))
pid = adata.get("programId")
coach = adata.get("coachId")
print("\nprogramId:", pid, "coachId:", coach)

# Try collection_group for common program collection names
for name in ["programs", "Programs", "workoutPrograms", "plans", "templates"]:
    try:
        docs = list(fs.collection_group(name).limit(3).stream())
        print(f"\ncollection_group('{name}') -> {len(docs)} sample docs")
        for d in docs[:1]:
            print(f"  path={d.reference.path}")
            print(f"  data={json.dumps(ser(d.to_dict()), indent=1, default=str)[:1500]}")
    except Exception as e:
        print(f"collection_group('{name}') error: {e}")

# Try direct doc lookup by programId across candidate paths
print("\n=== DIRECT programId lookups ===")
for path in [f"programs/{pid}", f"coaches/{coach}/programs/{pid}", f"users/{coach}/programs/{pid}"]:
    try:
        doc = fs.document(path).get()
        print(f"{path}: exists={doc.exists}")
        if doc.exists:
            print(json.dumps(ser(doc.to_dict()), indent=1, default=str)[:1500])
    except Exception as e:
        print(f"{path}: error {e}")
