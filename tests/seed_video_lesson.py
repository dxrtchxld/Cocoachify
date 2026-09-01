"""Seed a real video lesson so the client player can be exercised end-to-end.

Uploads a real mp4 into private object storage as a course-visibility file,
attaches it to a lesson, and enrols the test client.

Run: python /app/tests/seed_video_lesson.py
"""
import os
import sys

import requests

BASE = "http://localhost:8001/api"
SAMPLE = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"
COACH = ("jcgfit@gmail.com", "Coach1234!")
CLIENT_EMAIL = "ilovejeremygillespie@gmail.com"


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


token = login(*COACH)
H = {"Authorization": f"Bearer {token}"}

courses = requests.get(f"{BASE}/studio/courses", headers=H).json()
course = next((c for c in courses if c["title"] == "Video Demo Course"), None)
if not course:
    r = requests.post(f"{BASE}/studio/courses", headers=H, json={
        "title": "Video Demo Course",
        "subtitle": "In-app video playback",
        "description": "A short course used to verify the native lesson player.",
        "category": "strength",
    })
    r.raise_for_status()
    course = r.json()
course_id = course["id"]
print("course", course_id)

detail = requests.get(f"{BASE}/studio/courses/{course_id}", headers=H).json()
lessons = [l for sec in (detail.get("sections") or []) for l in (sec.get("lessons") or [])]
lesson = next((l for l in lessons if l["title"] == "Warm-up walkthrough"), None)
if not lesson:
    r = requests.post(f"{BASE}/studio/courses/{course_id}/lessons", headers=H, json={
        "title": "Warm-up walkthrough",
        "summary": "Watch the full warm-up before your first session.",
        "content": "Follow along, then mark the lesson complete.",
        "duration_minutes": 1,
    })
    r.raise_for_status()
    lesson = r.json()
lesson_id = lesson["id"]
print("lesson", lesson_id)

if not lesson.get("video_file_id"):
    data = requests.get(SAMPLE, timeout=60).content
    print("downloaded sample", len(data), "bytes")
    up = requests.post(
        f"{BASE}/library/files",
        headers=H,
        files={"file": ("warmup.mp4", data, "video/mp4")},
        data={"title": "Warm-up walkthrough", "visibility": "course", "course_id": course_id},
    )
    if up.status_code != 201:
        print("upload failed", up.status_code, up.text[:300])
        sys.exit(1)
    file_id = up.json()["id"]
    print("file", file_id)
    r = requests.put(f"{BASE}/studio/lessons/{lesson_id}", headers=H, json={
        "title": lesson["title"],
        "summary": lesson.get("summary", ""),
        "content": lesson.get("content", ""),
        "video_file_id": file_id,
        "duration_minutes": 1,
    })
    print("lesson updated", r.status_code, r.text[:200])

clients = requests.get(f"{BASE}/coach/clients", headers=H).json()
client = next((c for c in clients if c.get("email") == CLIENT_EMAIL), None)
if client:
    r = requests.post(f"{BASE}/studio/courses/{course_id}/enroll", headers=H,
                      json={"client_id": client.get("user_id") or client.get("id")})
    print("enrolled", r.status_code, r.text[:200])
else:
    print("client not found in /clients:", [c.get("email") for c in clients][:5])

print("\nSeeded. Client can open the lesson at /portal/lesson/%s" % lesson_id)
