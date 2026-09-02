import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import client, db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def _booking_reminder_loop():
    """Runs forever in the background: sweeps for day-before booking reminders
    every 15 minutes. A single process is enough for this app's scale."""
    from routes_booking import run_reminder_sweep

    while True:
        try:
            result = await run_reminder_sweep()
            if result.get("checked"):
                logger.info("Booking reminder sweep: %s", result)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Booking reminder sweep failed: %s", exc)
        await asyncio.sleep(15 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.client_logs.create_index([("user_id", 1), ("date", -1)])
    await db.purchases.create_index("checkout_session_id", unique=True)
    await db.invites.create_index("code", unique=True)
    await db.feature_flags.create_index("coach_id", unique=True)
    await db.private_files.create_index("id", unique=True)
    await db.private_files.create_index([("coach_id", 1), ("created_at", -1)])
    await db.courses.create_index("id", unique=True)
    await db.courses.create_index("slug", unique=True, sparse=True)
    await db.lessons.create_index([("course_id", 1), ("order", 1)])
    await db.course_modules.create_index([("course_id", 1), ("order", 1)])
    await db.course_enrollments.create_index([("course_id", 1), ("user_id", 1)], unique=True)
    await db.course_enrollments.create_index("user_id")
    await db.lesson_completions.create_index([("user_id", 1), ("lesson_id", 1)], unique=True)
    await db.contacts.create_index([("coach_id", 1), ("email", 1)], unique=True)
    await db.community_posts.create_index([("coach_id", 1), ("created_at", -1)])
    await db.community_comments.create_index([("post_id", 1), ("created_at", 1)])
    await db.community_reactions.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.community_rsvps.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.subscriptions.create_index([("user_id", 1), ("plan_id", 1)], unique=True)
    await db.webhook_events.create_index("event_id", unique=True)
    await db.assistant_consents.create_index([("coach_id", 1), ("client_id", 1)], unique=True)
    await db.practice_profiles.create_index("coach_id", unique=True)
    await db.practice_installs.create_index([("coach_id", 1), ("domain", 1)], unique=True)
    await db.certificates.create_index([("course_id", 1), ("user_id", 1)], unique=True)
    await db.challenges.create_index([("coach_id", 1), ("starts_at", -1)])
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.automation_rules.create_index([("coach_id", 1), ("enabled", 1)])
    await db.strava_oauth_states.create_index("expires_at", expireAfterSeconds=0)
    await db.wearable_connections.create_index([("user_id", 1), ("provider", 1)], unique=True)
    await db.wearable_activities.create_index(
        [("user_id", 1), ("provider", 1), ("external_id", 1)], unique=True
    )
    await db.exercise_guides.create_index("name_lower", unique=True)
    try:
        from storage import init_storage
        init_storage()
        logger.info("Object storage initialised")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Object storage init failed (uploads may retry): %s", exc)
    reminder_task = asyncio.create_task(_booking_reminder_loop())
    logger.info("Startup complete: indexes ensured")
    yield
    reminder_task.cancel()
    client.close()


app = FastAPI(title="Co-Coachify API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Co-Coachify API"}


import routes_analytics
import routes_assistant
import routes_auth
import routes_automations
import routes_catalog
import routes_chat
import routes_coach
import routes_community
import routes_courses
import routes_crm
import routes_exercise_ai
import routes_growth
import routes_booking
import routes_import
import routes_landing
import routes_library
import routes_logs
import routes_memberships
import routes_misc
import routes_modules
import routes_payments
import routes_plans
import routes_programs
import routes_uploads
import routes_wearables

api_router.include_router(routes_auth.router)
api_router.include_router(routes_programs.router)
api_router.include_router(routes_import.router)
api_router.include_router(routes_logs.router)
api_router.include_router(routes_misc.router)
api_router.include_router(routes_coach.router)
api_router.include_router(routes_chat.router)
api_router.include_router(routes_payments.router)
api_router.include_router(routes_library.router)
api_router.include_router(routes_uploads.router)
api_router.include_router(routes_modules.router)
api_router.include_router(routes_courses.router)
api_router.include_router(routes_plans.router)
api_router.include_router(routes_analytics.router)
api_router.include_router(routes_crm.router)
api_router.include_router(routes_landing.router)
api_router.include_router(routes_community.router)
api_router.include_router(routes_memberships.router)
api_router.include_router(routes_assistant.router)
api_router.include_router(routes_catalog.router)
api_router.include_router(routes_growth.router)
api_router.include_router(routes_growth.public_router)
api_router.include_router(routes_booking.router)
api_router.include_router(routes_automations.router)
api_router.include_router(routes_exercise_ai.router)
api_router.include_router(routes_wearables.router)
api_router.include_router(routes_wearables.public_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
