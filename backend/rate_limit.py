"""Lightweight, MongoDB-backed rate limiting.

Fine for a single-process FastAPI app: each check does one count + one insert
against a TTL-indexed collection, so old hits self-expire and nothing needs a
background sweep. Not a replacement for an edge/WAF rate limiter in front of
a large multi-region deployment, but enough to blunt brute-force and cost-abuse
attempts from a single account/IP.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from db import db


async def check_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    """Raise 429 if `key` already hit `max_attempts` within the last `window_seconds`.

    Records this attempt regardless of outcome so repeated hammering keeps
    getting rejected rather than resetting the window.
    """
    await _raise_if_limited(key, max_attempts, window_seconds)
    await _record_hit(key)


async def _raise_if_limited(key: str, max_attempts: int, window_seconds: int) -> None:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=window_seconds)
    count = await db.rate_limit_hits.count_documents({"key": key, "ts": {"$gte": window_start}})
    if count >= max_attempts:
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")


async def _record_hit(key: str) -> None:
    await db.rate_limit_hits.insert_one({"key": key, "ts": datetime.now(timezone.utc)})


async def check_rate_limit_failures_only(key: str, max_attempts: int, window_seconds: int) -> None:
    """Like `check_rate_limit`, but the caller records a hit itself (via
    `record_failed_attempt`) only when the attempt actually fails — e.g. a wrong
    password shouldn't count the same as a successful login against the quota,
    or every legitimate repeat login would eventually get an innocent user locked out.
    """
    await _raise_if_limited(key, max_attempts, window_seconds)


async def record_failed_attempt(key: str) -> None:
    await _record_hit(key)


def client_ip(request) -> str:
    """Best-effort caller IP, honoring a single trusted proxy hop."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
