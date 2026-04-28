"""Bot / brute-force protection for the /auth/login endpoint.

Three layers:

1. **Honeypot** — the client renders a hidden `website` input; real users leave
   it blank, naive bots fill every input. Non-empty → immediate 400.

2. **IP rate-limit** — 10 failed attempts per IP per 15 minutes, stored in
   Mongo (survives backend restarts, simple to inspect). Successful logins
   clear the counter. On limit, returns 429.

3. **Cloudflare Turnstile** — server-side siteverify of the token issued by
   the widget on the login page. Configured via `TURNSTILE_SECRET_KEY`.
   If the env var is unset the check is skipped (useful for local dev).
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import HTTPException, Request

from database import db

logger = logging.getLogger(__name__)

TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "").strip()
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

RATE_LIMIT_MAX_FAILS = 10
RATE_LIMIT_WINDOW = timedelta(minutes=15)


def _client_ip(request: Request) -> str:
    # Trust the first X-Forwarded-For hop (Kubernetes ingress / Cloudflare).
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_honeypot(honeypot_value: Optional[str]) -> None:
    """If the hidden honeypot field has any value, it was filled by a bot."""
    if honeypot_value:
        logger.warning("Login honeypot triggered — rejecting request")
        raise HTTPException(status_code=400, detail="Invalid request")


async def enforce_rate_limit(request: Request) -> str:
    """Raise 429 if this IP has too many recent failures. Returns the ip."""
    ip = _client_ip(request)
    cutoff = datetime.utcnow() - RATE_LIMIT_WINDOW
    doc = await db.login_attempts.find_one({"ip": ip})
    if doc:
        fails = [t for t in doc.get("fails", []) if t >= cutoff]
        if len(fails) >= RATE_LIMIT_MAX_FAILS:
            retry_in = (fails[0] + RATE_LIMIT_WINDOW - datetime.utcnow()).total_seconds()
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed login attempts. Try again in {int(retry_in/60)+1} minute(s).",
            )
        # Prune stale entries so the document doesn't grow unbounded.
        if len(fails) != len(doc.get("fails", [])):
            await db.login_attempts.update_one(
                {"ip": ip}, {"$set": {"fails": fails}}
            )
    return ip


async def record_login_failure(ip: str) -> None:
    await db.login_attempts.update_one(
        {"ip": ip},
        {"$push": {"fails": datetime.utcnow()}},
        upsert=True,
    )


async def clear_login_failures(ip: str) -> None:
    await db.login_attempts.delete_one({"ip": ip})


async def verify_turnstile(token: Optional[str], request: Request) -> None:
    """Call Cloudflare's siteverify. Skipped if `TURNSTILE_SECRET_KEY` is blank."""
    if not TURNSTILE_SECRET_KEY:
        return  # Local dev fallback — the other two layers still apply.

    if not token:
        raise HTTPException(status_code=400, detail="Bot verification required")

    ip = _client_ip(request)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                TURNSTILE_VERIFY_URL,
                data={
                    "secret": TURNSTILE_SECRET_KEY,
                    "response": token,
                    "remoteip": ip,
                },
            )
            data = resp.json()
    except Exception as e:
        logger.error(f"Turnstile siteverify call failed: {e}")
        raise HTTPException(status_code=503, detail="Bot verification service unavailable")

    if not data.get("success"):
        logger.warning(f"Turnstile rejected login from {ip}: {data.get('error-codes')}")
        raise HTTPException(status_code=400, detail="Bot verification failed")
