#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "Co-Coachify — coach↔client fitness platform rebuilt from Flutter spec. Full MVP: auth (Emergent Google + email/password JWT), 3 seeded template programs + 21 sessions, session builder, workout/body logging, progress charts, dashboard with streak & today's plan, QR coach invites, Stripe checkout (emergent test key, one-time payments)."

backend:
  - task: "Auth: register/login/me/logout + Google session exchange (dual token)"
    implemented: true
    working: "NA"
    file: "/app/backend/routes_auth.py, /app/backend/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Register/login verified via curl. Google exchange untestable without real session_id (expect 401 for invalid)."
  - task: "Programs: list/detail/create/delete/enroll + sessions + exercises"
    implemented: true
    working: "NA"
    file: "/app/backend/routes_programs.py, /app/backend/seed_data.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Seeded 3 programs (Rowing Strength is premium-locked), 21 sessions, 41 exercises. List verified via curl."
  - task: "Logs & progress summary (workout/body), enrollment day advance, dashboard/streak"
    implemented: true
    working: "NA"
    file: "/app/backend/routes_logs.py, /app/backend/routes_misc.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Invites: create/accept/clients/coach"
    implemented: true
    working: "NA"
    file: "/app/backend/routes_misc.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
  - task: "Stripe checkout via emergentintegrations (session create, status poll fulfillment, webhook)"
    implemented: true
    working: "NA"
    file: "/app/backend/routes_payments.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Checkout session creation verified via curl (returns stripe URL). Server-side price map. subscription=premium unlock $9.99, program=$19.99."

frontend:
  - task: "Login screen: email/password + Google button"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/login.tsx, /app/frontend/src/context/AuthContext.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Dashboard: streak, weekly rings, today's plan card, empty state"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Programs library + program detail + enroll + premium lock"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/programs.tsx, /app/frontend/app/program/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Session detail + log workout modal (duration/RPE/notes)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/session/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Progress tab: segmented workouts/body, charts, weight logging"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/progress.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Session builder: week slots, session picker, weeks stepper, save"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/builder.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
  - task: "Settings: profile, premium row, coach code join, clients, logout"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/settings.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
  - task: "Paywall + checkout success/cancelled polling"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/paywall.tsx, /app/frontend/app/checkout/success.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Invite QR screen"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/invite.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1

test_plan:
  current_focus:
    - "Full backend API suite"
    - "Frontend e2e: login -> dashboard -> enroll -> log workout -> progress -> builder -> settings"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Fresh MVP build. Test credentials in /app/memory/test_credentials.md (testcoach@cocoachify.com / Test1234!). Backend accepts both JWT and Google session tokens as Bearer. Do NOT complete real Stripe payments; only verify checkout session URL creation and status endpoint returns pending/unpaid. Google OAuth flow can't be e2e tested (external); verify /api/auth/session returns 401 for invalid session_id."

## PHASE 1 REBUILD (coach↔client engine, real-app parity) — added by main agent
user_problem_statement: "Rebuilt to match user's real app (cocoachify.web.app): roles (coach/client), client onboarding wizard, connect via invite code OR coach email, coach portal (Practitioner Home triage, clients list w/ status, program builder w/ categories & block-based session editor), program assignment, client Today's Workout + daily check-in. All fake seed data DELETED per user request — DB content starts empty; coaches author everything in-app."

backend:
  - task: "Roles (POST /api/me/role) + onboarding (PUT /api/me/onboarding)"
    implemented: true
    working: true
    file: "/app/backend/routes_misc.py"
    comment: "Verified via curl e2e"
  - task: "Coach endpoints: /api/coach/clients, /clients/{id}, /assign, /activity, /stats"
    implemented: true
    working: true
    file: "/app/backend/routes_coach.py"
    comment: "Verified via curl e2e (status computation on_track/behind/no_program)"
  - task: "Program CRUD w/ categories(fitness/breathwork/yoga/mobility/mindfulness), lengths(7-84d), nullable rest days in schedule"
    implemented: true
    working: true
    file: "/app/backend/routes_programs.py"
  - task: "Session CRUD w/ embedded exercises (block_label, sets/reps/rest, form_note, purpose_note)"
    implemented: true
    working: true
    file: "/app/backend/routes_programs.py"
  - task: "Invite accept via code OR coach_email; invite creation coach-only"
    implemented: true
    working: true
    file: "/app/backend/routes_misc.py"
  - task: "Dashboard handles null (rest) schedule days"
    implemented: true
    working: true
    file: "/app/backend/routes_misc.py"

frontend:
  - task: "Role select screen (coach/client)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/role-select.tsx"
    needs_retesting: true
  - task: "Client onboarding wizard (4 steps: welcome, goal, experience, schedule/focus/notes)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/onboarding.tsx"
    needs_retesting: true
  - task: "Role-based tabs (coach: Home/Clients/Programs/Settings; client: Today/Progress/Settings)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/_layout.tsx"
    needs_retesting: true
  - task: "Coach Home triage (stats, needs attention, recent activity)"
    implemented: true
    working: true
    file: "/app/frontend/src/screens/CoachHome.tsx"
    comment: "Smoke-tested via screenshot: renders stats + activity"
  - task: "Clients tab (search, status chips) + client detail (intake, program, check-in history, assign modal)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/clients.tsx, /app/frontend/app/client/[id].tsx"
    needs_retesting: true
  - task: "Coach Programs tab (category filters, search) + program editor (type/length/dpw/difficulty/spotify + schedule w/ session picker)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/programs.tsx, /app/frontend/app/program-editor.tsx"
    needs_retesting: true
  - task: "Session editor (blocks, exercises w/ form & purpose notes, reorder)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/session-editor.tsx"
    needs_retesting: true
  - task: "Client Today screen (connect prompt, streak, rings, today's workout, rest day)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/screens/ClientToday.tsx"
    needs_retesting: true
  - task: "Session view grouped by blocks + Complete & Check In modal (client only)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/session/[id].tsx"
    needs_retesting: true
  - task: "Settings: client connect (Invite Code | Coach Email segmented), coach invite tools, logout"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/settings.tsx"
    needs_retesting: true

agent_communication:
  - agent: "main"
    message: "Credentials in /app/memory/test_credentials.md. coach.demo@cocoachify.com/Coach1234! (coach w/ 1 program+1 session), client.demo@cocoachify.com/Client1234! (client, connected+assigned, day 2). testcoach@cocoachify.com/Test1234! lands on role-select (no role yet). Do NOT complete Stripe payments. Google OAuth not e2e-testable. Note: progress tab exists for clients only; builder.tsx deleted."
