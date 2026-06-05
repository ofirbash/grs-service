"""Shared async wrapper around the synchronous Resend Python SDK.

Why this exists
---------------
`resend.Emails.send(...)` is a synchronous `requests`-based call. Invoking
it directly from an `async def` FastAPI route blocks the entire asyncio
event loop until Resend responds. On Feb 25 2026 production began returning
Cloudflare 520 ("origin returned an invalid or incomplete response")
because Resend's first call to a freshly-verified domain was slow enough
that CF's edge timed out the request before our origin produced a response.

This module wraps every Resend send in `asyncio.to_thread(...)` plus a
hard `asyncio.wait_for` timeout so:
  - the event loop stays responsive during the network call, and
  - a stuck Resend call fails fast (clean error → 502 from our route)
    instead of hanging long enough for Cloudflare to serve its own 520.

Use `send_email_async(params, timeout=15.0)` from any route. It returns
the Resend response dict on success or `None` on any failure (timeout,
SDK exception, missing api_key). Callers decide how to surface failure —
some routes treat it as fatal (access-request OTP), others as best-effort
(payment receipts, bulk notifications).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import resend

logger = logging.getLogger(__name__)

# Default per-call ceiling. Long enough to absorb a normal warm Resend call
# (~1s) plus a cold-start margin, short enough that Cloudflare's ~30s edge
# timeout can't fire first.
DEFAULT_TIMEOUT_SECONDS = 15.0


async def send_email_async(
    params: dict,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    context: str = "email",
) -> Optional[dict]:
    """Send one email through Resend without blocking the event loop.

    Returns the Resend response dict on success, or ``None`` if:
      - ``resend.api_key`` is unset (treated as a development-mock no-op)
      - the call timed out (logged WARNING)
      - the Resend SDK raised any exception (logged ERROR)

    Always treats `params` as opaque — callers shape it (from, reply_to,
    attachments, etc.) themselves. The caller decides whether ``None`` is
    a hard error or a soft "best-effort" failure.

    `context` is a short freeform string included in log messages so we
    can grep production logs by the calling subsystem (e.g. "otp",
    "welcome", "payment-receipt", "notifications-bulk", "reset-link").
    """
    if not resend.api_key:
        recipient = params.get("to") or "?"
        subject = params.get("subject") or "?"
        logger.info("[MOCK EMAIL %s] to=%s subject=%r", context, recipient, subject)
        return None

    try:
        # NB: resend.Emails.send is a classmethod taking a single dict.
        response: Any = await asyncio.wait_for(
            asyncio.to_thread(resend.Emails.send, params),
            timeout=timeout,
        )
        if isinstance(response, dict):
            return response
        # Some SDK versions return an object with a `.id` attribute; coerce.
        return {"id": getattr(response, "id", str(response))}
    except asyncio.TimeoutError:
        logger.warning(
            "Resend send (%s) timed out after %ss; recipient=%s",
            context, timeout, params.get("to"),
        )
        return None
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Resend send (%s) failed: %s; recipient=%s",
            context, exc, params.get("to"),
        )
        return None
