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
1. ~~Import real data~~ ✅ DONE — migrated from Firestore (somatic-wealth) via /app/backend/scripts/migrate_firestore.py: 15 users (2 coaches, 13 clients), 89 programs, 437 sessions, 137 enrollments, 7 chat messages, 52 check-ins. Firestore UIDs kept as Mongo user_id/program id so Google login (by email) resolves migrated accounts.
2. Coach Inbox (check-in review All/New/Urgent/Watch) + Exercise Library tool.
3. Ask Coach chat, water counter, daily affirmation on client home.
4. Group challenges, scheduling & bookings (self-book link).
5. Brand & Dashboard Studio (theme customization).

## Data migration notes
- Script: /app/backend/scripts/migrate_firestore.py (idempotent: wipes content collections then re-inserts). Requires backend/scripts/serviceAccountKey.json (gitignored secret — user must rotate after).
- Firestore schema: users/{uid}; coaches/{coachUid}/programs/{pid} with EMBEDDED sessions[] (each session has exercises[] using exerciseDefId ids → humanized names); assignments; coach_client_links (→ coach_id); connection_requests (name/email enrichment); messages (chat); checkins (→ client_logs workout, feeds Coach Inbox).
- Exercise names derived by humanizing exerciseDefId (e.g. kettlebell_windmill → "Kettlebell Windmill"); real coaching detail lives in exercise notes → form_note.
