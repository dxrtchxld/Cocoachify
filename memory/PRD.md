# Co-Coachify — PRD

## Product
Coach↔client coaching platform, rebuilt on Emergent (Expo + FastAPI + MongoDB) to match the user's REAL production app at cocoachify.web.app (Flutter/Firebase — cannot be transferred directly; features fact-checked against live app via coach & client logins).

## User's real app (ground truth, explored live)
- Client: onboarding wizard (goal/experience/schedule/notes), home w/ streak + daily progress + today's workout with BLOCKS (form/purpose notes), daily check-in, connect via invite code OR coach email, Ask Coach chat, water counter, daily affirmation, theme settings.
- Coach (Practitioner Portal): home triage (schedule/bookings, group challenges, stats 13 clients/81 programs/23% active, needs attention, due soon, recent activity), clients list (name/compliance/due date, On Track chips), programs (81, categories Fitness/Breathwork/Yoga/Mobility/Mindful, editor w/ type/length/days-per-week/difficulty/Spotify URL), inbox (check-in review), coach tools (exercise library, invite, wellness journal, group challenges, brand studio).
- Demo logins to real app: ilovejeremygillespie@gmail.com / 7399Sexy (client), jcgfit@gmail.com / 7399Sexy (coach).

## Key user directives
- NO fake/invented data — all my reconstructed seed content was DELETED; DB content starts empty; coaches author in-app.
- Real data incoming via: GitHub push of Flutter repo AND/OR Firestore JSON export AND/OR my scraping of top programs from live app. IMPORT PENDING — when files arrive, write an import script mapping Firestore/Hive models → our Mongo collections.
- Premium "$200/month" quality bar: user-friendly, logical, smart.
- Match Flutter spec exactly — NO AI coach chat.
- Auth: Emergent Google + email/password. Payments: Stripe (emergent test key, one-time only via emergentintegrations proxy).

## PHASE 1 — COMPLETE & TESTED (34/34 backend tests, frontend e2e verified)
- Roles: role-select screen after signup; role-based tabs (coach: Home/Clients/Programs/Settings; client: Today/Progress/Settings).
- Client onboarding wizard (4 steps, mirrors real app).
- Connect: invite code (QR screen for coach) OR coach email (segmented UI in client Settings).
- Coach portal: Practitioner Home (stats/needs-attention/recent activity/quick actions), Clients (search, On Track|Behind|No program), client detail (intake, program, check-in history, assign modal).
- Program builder: categories (5), lengths (7-84d), days/week, difficulty, Spotify URL, per-day schedule w/ session picker + rest days (null).
- Session editor: exercises w/ block_label, sets/reps/rest, form_note, purpose_note, reorder.
- Client: Today card (day X/Y, rest handling), session view grouped by blocks w/ Form:/Purpose: notes, Daily Check-In modal (duration/RPE/notes) advances current_day, streak, progress charts + weight logging.
- Stripe premium paywall ($9.99 one-time unlock).

## Architecture
Backend (/app/backend): server.py, db.py, auth.py (dual token: JWT + Google session), routes_auth.py, routes_programs.py (programs + sessions CRUD), routes_logs.py, routes_misc.py (role/onboarding/dashboard/invites), routes_coach.py (clients/assign/activity/stats), routes_payments.py (emergentintegrations StripeCheckout).
Frontend (/app/frontend): app/{login, role-select, onboarding, (tabs)/{index,clients,programs,progress,settings}, client/[id], program/[id], program-editor, session-editor, session/[id], invite, paywall, checkout/*}; src/{theme, lib/api, context/AuthContext, screens/{CoachHome,ClientToday}, components/{Button,ProgressRing,LineChart,BarChart}}.

## Data model
users (role, onboarding{goal,experience,days_per_week,focus,notes}, coach_id, is_premium), user_sessions, programs (category, total_days, days_per_week, difficulty, spotify_url, schedule:[session_id|null], owner_id), coaching_sessions (owner_id, exercises embedded w/ block_label/form_note/purpose_note), user_programs (enrollment: assigned_by, current_day, active), client_logs (workout|body), invites, purchases.

## Test credentials: /app/memory/test_credentials.md

## NEXT (in priority order, defaults pending user confirmation)
0. PHASE 4 PREMIUM REDESIGN (in progress). Blueprint: /app/design_guidelines.json ("Glass / Luxe DARK" — obsidian #0A0A0A + champagne-gold #E5D0A1, cinematic hero imagery, frosted glass, sticky CTAs). DONE: new theme tokens (src/theme.ts) app-wide; brand-color presets expanded (ThemeContext ACCENTS: Champagne default +6); Scrim + Segmented components; Programs Library cinematic cover cards (categoryCover/coverFor); Program Detail hero + 3 layout views (Week/List/Calendar). Backend _program_summary returns cover_image. REMAINING: Coach Home polish; Client Today session player; builder polish; Inbox/Chat bubbles; Client Detail polish; FULL Brand Studio (logo + cover-image UPLOAD via Emergent Object Storage — needs integration_expert).
1. ~~Import real data~~ ✅ DONE — migrated from Firestore (somatic-wealth) via /app/backend/scripts/migrate_firestore.py: 15 users (2 coaches, 13 clients), 89 programs, 437 sessions, 137 enrollments, 7 chat messages, 52 check-ins. Firestore UIDs kept as Mongo user_id/program id so Google login (by email) resolves migrated accounts.
2. Coach Inbox (check-in review All/New/Urgent/Watch) + Exercise Library tool.
3. Ask Coach chat, water counter, daily affirmation on client home.
4. Group challenges, scheduling & bookings (self-book link).
5. Brand & Dashboard Studio (theme customization).

## Data migration notes
- Script: /app/backend/scripts/migrate_firestore.py (idempotent: wipes content collections then re-inserts). Requires backend/scripts/serviceAccountKey.json (gitignored secret — user must rotate after).
- Firestore schema: users/{uid}; coaches/{coachUid}/programs/{pid} with EMBEDDED sessions[] (each session has exercises[] using exerciseDefId ids → humanized names); assignments; coach_client_links (→ coach_id); connection_requests (name/email enrichment); messages (chat); checkins (→ client_logs workout, feeds Coach Inbox).
- Exercise names derived by humanizing exerciseDefId (e.g. kettlebell_windmill → "Kettlebell Windmill"); real coaching detail lives in exercise notes → form_note.

## PHASE 5 — MODULAR COACHING PLATFORM (DONE, tested: 41/41 backend pytest + frontend E2E)
Additive only. Existing programs/clients/chat/settings untouched. Every new module sits behind a per-coach feature flag (db.feature_flags, all default OFF).

### Backend (new files)
- modules.py — MODULES registry (courses, coaching, community, crm, landing, memberships, assistant, files), get/set flags, `require_module`, `owned()`, `require_own_client`, `require_course_access` (server-enforced ownership everywhere).
- routes_modules.py — GET/PUT /api/modules (coach editable, client read-only).
- routes_courses.py — courses, sections (course_modules), lessons w/ drip release (immediate|day_offset|date), cohorts, idempotent enrollments, lesson complete/uncomplete, GET /api/studio/continue (resume).
- routes_plans.py — milestones, goals (+client progress), action plans (+client item toggle), assignments (submit/review), check-in templates + responses, session notes (private_note NEVER serialized to clients), GET /api/studio/my/plan.
- routes_crm.py — contacts + lifecycle (lead/applied/active/paused/churned) + stats, lead forms, segments (live rule evaluation), enrolment history, contact→account link.
- routes_landing.py — coach landing config + PUBLIC no-auth GET /api/public/courses/{slug} and POST /api/public/leads (404 unless landing module on AND landing.published).
- routes_community.py — feed (workspace or course-scoped), posts/announcements/events (clients can only post plain posts), comments, reaction toggle, RSVP.
- memberships.py + routes_memberships.py — plans, subscriptions, EXPLICIT GRACE RULE: period ends → status past_due and access stays ON for plan.grace_days → then paused + plan course enrollments paused. activate_subscription() restores access + enrolls plan courses (idempotent).
- routes_library.py — PRIVATE files (worksheets/recordings/PDFs/images) in Emergent Object Storage; Mongo stores refs only; authorization on every download (owner / shared_with / visibility=clients within workspace / visibility=course + active enrollment); short-lived signed `?t=` media token for <Image>/<Video>.
- routes_assistant.py — consent-gated drafting (agenda | checkin_summary | followup) via Emergent LLM key, models: claude-sonnet-4-6 (default), gpt-5.5, gemini-3.1-pro-preview. Module OFF by default; requires db.assistant_consents.granted by the CLIENT; output is a coach-only draft, never messages a client.
- routes_analytics.py — coach dashboard overview + per-course performance (avg progress, completion rate, per-lesson %, drop-off lesson).
- routes_payments.py extended — purchase_type course|membership; webhook idempotency ledger db.webhook_events (unique event_id); paid membership → activate_subscription; failed/expired → refresh_access.
- IMPORTANT: routes_library MUST be registered BEFORE routes_uploads in server.py (routes_uploads has wildcard /files/{path:path} that otherwise shadows /files/private/{id}).

### Frontend (new screens, Luxe Dark preserved)
Coach: app/studio/{index,modules,courses,checkins,contacts,memberships,library,assistant,clients-plans}.tsx, app/studio/course/[id].tsx, app/studio/lesson-editor.tsx, app/studio/landing/[id].tsx, app/studio/client-plan/[id].tsx.
Client: app/portal/{index,plan,files,consent}.tsx, app/portal/course/[id].tsx, app/portal/lesson/[id].tsx.
Shared: app/community.tsx (both roles), app/p/[slug].tsx (public landing, no auth).
Kit: src/components/studio/UI.tsx (ScreenHeader, Card, Row, Pill, StatTile, Field, Sheet, ProgressBar, EmptyState, Loading), src/lib/modules.ts (useModules hook + types), src/lib/api.ts (+uploadPrivateFile, privateFileUrl).
Entry points added (non-destructive): CoachHome quick action "Workspace", ClientToday quick action "My Journey", settings rows (coach: Coach workspace + Platform modules; client: My journey).

### New collections
feature_flags, courses, course_modules, lessons, cohorts, course_enrollments, lesson_completions, milestones, goals, action_plans, assignments, checkin_templates, checkin_responses, session_notes, contacts, lead_forms, segments, community_posts/comments/reactions/rsvps, membership_plans, subscriptions, private_files, assistant_consents, assistant_drafts, webhook_events. No existing collection changed.

### Tests
/app/tests/smoke_studio.py (E2E A–F; assumes flags start OFF), /app/backend/tests/test_phase5_platform.py (41 tests: cross-tenant isolation, privacy sweep, landing lifecycle, checkout, private downloads, grace/paused access, consent gate).

## NEXT (after Phase 5)
- P0 Client "Today" workout player glow-up; P0 chat bubble redesign; P1 branded welcome screen; P1 Google-first landing.
- P1 cover library gallery; P2 native video handling; P2 true recurring Stripe subscriptions (needs live keys from user); P3 reply templates.

## PHASE 7 — VIDEO LESSONS, GROWTH EXTRAS, BOOKING LINKS (June 2026)

### Real video lessons (DONE)
- Coach: `studio/lesson-editor.tsx` uploads an mp4/mov via `uploadPrivateFile` (visibility=course) → `lesson.video_file_id`.
- Client: `src/components/player/LessonVideo.tsx` — `expo-video` (`useVideoPlayer` + `VideoView`), nativeControls + fullscreen,
  playback-speed pills (0.75–2x), resume-where-you-left-off (position stored in AsyncStorage key `video_pos_<lessonId>`),
  loading + friendly error overlays. Wired into `app/portal/lesson/[id].tsx`; a signed `privateFileUrl()` is fetched per view.
- Pasted `video_url` links only play inline when they end in mp4/mov/m4v/webm/m3u8 (`DIRECT_MEDIA`), otherwise the old
  "Watch the video" external-browser button is kept (YouTube/Vimeo).
- `routes_library.download_private_file` now supports HTTP **Range** (206 + Content-Range + Accept-Ranges) so scrubbing works.
- NOTE: headless Chromium has no H.264 codec, so the web preview shows the error overlay for mp4 — it plays on real devices.

### Certificates (DONE)
- `issue_certificate_if_complete` fires from lesson-complete (idempotent, 8-char `code`).
- NEW public, no-auth: `GET /api/public/certificates/{code}` (verify JSON) and `GET /api/public/certificates/{code}/pdf`
  (Luxe Dark landscape A4 PDF via **reportlab**).
- `studio/certificates.tsx` (shared coach+client) now has "Download PDF" (WebBrowser) and "Share" (RN Share sheet).

### Booking / scheduling links (DONE — the last Kajabi-beating extra)
- Backend `routes_booking.py` (module gate: `coaching`), new collections `booking_settings`, `bookings`:
  - `GET/PUT /api/studio/booking/settings` — enabled, slug, headline, intro, IANA timezone, session_types[],
    weekly availability windows, slot_interval_minutes, buffer_minutes, lead_time_hours, max_days_ahead.
  - `GET /api/public/book/{slug}`, `GET /api/public/book/{slug}/slots?date=&session_type_id=` (zoneinfo-based slot maths,
    excludes pending+confirmed bookings and honours buffers/lead time), `POST /api/public/book/{slug}`.
  - Booking POST re-validates the slot server-side (409 if taken), links the booking to the account when an
    Authorization header is present, otherwise creates a CRM contact with `source: "booking"`.
  - `GET /api/studio/booking/requests` (coach: all, client: own), `POST .../{id}/decision` {confirm|decline|cancel}
    — clients may only `cancel` their own; confirming posts a chat message to the client.
  - `GET /api/studio/booking/link` — client helper: does my coach have a live booking page?
- Frontend: `app/studio/booking.tsx` (settings, copy/share link, session types, day toggles, rules, requests + upcoming),
  `app/book/[slug].tsx` (public page — session type chips, 21-day strip, slot grid, name/email for prospects, auto-filled
  for signed-in clients). Entry points: Coach Home → MODULES → "Booking"; Portal → "SESSIONS" → "Book a session"
  + pending/confirmed list.

### Tests
- `/app/backend/tests/test_phase7_booking.py` — 17 tests (settings validation, public page/slots, anon + client booking,
  double-booking 409, off-grid 409, CRM lead creation, cross-role isolation, confirm/cancel lifecycle, certificate
  PDF/verify, Range streaming, unsigned download rejected). Full suite: **167 passed, 3 skipped**.
- `/app/tests/smoke_booking.py` — sequential E2E script (includes the enable/disable 404 check that can't run under xdist).
- `/app/tests/seed_video_lesson.py` — uploads a real 1 MB mp4 into object storage, attaches it to a lesson in
  "Video Demo Course" and enrols the test client (lesson id printed at the end).

### Still open
- P2 Google-first login screen (Google primary, email/password behind a link).
- P2 True recurring Stripe subscriptions (blocked on live keys; test wrapper in place).
- P2 Full AI assistant wiring (consent flow UI + drafting screens).
