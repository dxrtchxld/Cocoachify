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
    try:
        from storage import init_storage
        init_storage()
        logger.info("Object storage initialised")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Object storage init failed (uploads may retry): %s", exc)
    logger.info("Startup complete: indexes ensured")
    yield
    client.close()


app = FastAPI(title="Co-Coachify API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Co-Coachify API"}


import routes_auth
import routes_chat
import routes_coach
import routes_import
import routes_logs
import routes_misc
import routes_payments
import routes_programs
import routes_uploads

api_router.include_router(routes_auth.router)
api_router.include_router(routes_programs.router)
api_router.include_router(routes_import.router)
api_router.include_router(routes_logs.router)
api_router.include_router(routes_misc.router)
api_router.include_router(routes_coach.router)
api_router.include_router(routes_chat.router)
api_router.include_router(routes_payments.router)
api_router.include_router(routes_uploads.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
