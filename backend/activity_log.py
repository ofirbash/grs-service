"""Activity-log helper + collection setup.

Logs operationally-interesting actions (job created, stone verbal entered,
status changed, payment recorded, shipment sent/delivered, client created,
admin login) so admins can see who did what and when on a per-job timeline.

Design choices (Feb 25 2026):
  - Per-row format intentionally minimal: action label + actor + when. No
    diff payload (user-confirmed). Keeps the timeline scannable; we can
    enrich later if drift becomes painful.
  - 12-month TTL on the collection (`expires_at`). After that Mongo
    auto-prunes — no separate cron needed. If anyone ever wants longer
    retention, change ACTIVITY_TTL_DAYS and the TTL index will follow.
  - All writes use `log_activity()`; never reach into the collection
    directly. The helper is fire-and-forget — it logs DB errors but never
    re-raises, so a logging hiccup can't take down the actual business
    write that triggered it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId

from database import db

logger = logging.getLogger(__name__)

# 12 months hot, then Mongo TTL prunes the doc. The user's explicit choice on
# Feb 25 2026 was "12 months hot + archive cold" — for now we just expire;
# adding a cold-archive S3 stage is a separate task on the ROADMAP.
ACTIVITY_TTL_DAYS = 365


# Canonical action codes. Use these constants from call sites so the
# timeline UI can render a stable label per action without parsing strings.
class Action:
    JOB_CREATED = "job_created"
    JOB_UPDATED = "job_updated"
    JOB_STATUS_CHANGED = "job_status_changed"
    JOB_NOTIFICATION_SENT = "job_notification_sent"
    JOB_EXPECTED_DATE_CHANGED = "job_expected_date_changed"

    STONE_VERBAL_ENTERED = "stone_verbal_entered"
    STONE_FEES_UPDATED = "stone_fees_updated"
    STONE_UPDATED = "stone_updated"
    STONE_CERT_UPLOADED = "stone_cert_uploaded"
    STONE_CANCELLED = "stone_cancelled"

    SHIPMENT_CREATED = "shipment_created"
    SHIPMENT_STATUS_CHANGED = "shipment_status_changed"

    PAYMENT_RECORDED = "payment_recorded"

    CLIENT_CREATED = "client_created"
    CLIENT_UPDATED = "client_updated"

    SIGNATURE_REQUESTED = "signature_requested"
    SIGNATURE_CAPTURED = "signature_captured"
    SIGNATURE_CANCELLED = "signature_cancelled"
    SIGNATURE_DELETED = "signature_deleted"

    PICKUP_PRINTED = "pickup_printed"
    PICKUP_DELETED = "pickup_deleted"

    LOGIN_SUCCESS = "login_success"


_TTL_INDEX_ENSURED = False


async def ensure_indexes() -> None:
    """Create the TTL index on first use. Idempotent — Mongo no-ops when an
    equivalent index already exists. We don't run this at import-time
    because the DB connection isn't ready that early; instead `log_activity`
    calls it lazily once per process."""
    global _TTL_INDEX_ENSURED
    if _TTL_INDEX_ENSURED:
        return
    try:
        await db.activity_log.create_index(
            "expires_at",
            expireAfterSeconds=0,
            name="activity_log_ttl",
        )
        # Hot-path query is "by job_id, newest first" — this index serves
        # both the job-timeline and the global feed (when we add it later).
        await db.activity_log.create_index(
            [("job_id", 1), ("created_at", -1)],
            name="activity_log_job_recent",
        )
        await db.activity_log.create_index(
            [("branch_id", 1), ("created_at", -1)],
            name="activity_log_branch_recent",
        )
        _TTL_INDEX_ENSURED = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("activity_log index setup failed: %s", exc)


async def log_activity(
    action: str,
    *,
    actor: Optional[dict] = None,
    job_id: Optional[str] = None,
    stone_id: Optional[str] = None,
    shipment_id: Optional[str] = None,
    client_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    summary: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Append one row to the activity log. Fire-and-forget — any DB error is
    logged but never re-raised, so a logging failure can't break the
    business write that triggered it.

    `actor` should be the dict returned by `get_current_user`. We extract
    just the safe-for-log fields (id, full_name, role, branch_id). System
    actions can pass actor=None.

    `branch_id` controls who can read the row later. For job-scoped events
    we copy the job's branch_id so a branch_admin's queries naturally
    return their own branch's history.
    """
    await ensure_indexes()

    actor_id = None
    actor_name = "(system)"
    actor_role = None
    if actor:
        raw_id = actor.get("_id") or actor.get("id")
        actor_id = str(raw_id) if raw_id else None
        actor_name = actor.get("full_name") or actor.get("email") or "(unknown)"
        actor_role = actor.get("role")
        if branch_id is None:
            # If the caller didn't supply a branch_id, fall back to the
            # actor's branch (e.g. branch_admin login). super_admins
            # legitimately have None here — global scope is fine.
            branch_id = actor.get("branch_id")

    now = datetime.now(timezone.utc)
    doc: dict[str, Any] = {
        "action": action,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "actor_role": actor_role,
        "job_id": job_id,
        "stone_id": stone_id,
        "shipment_id": shipment_id,
        "client_id": client_id,
        "branch_id": branch_id,
        "summary": summary,  # Optional short human-readable annotation
        "metadata": metadata or {},
        "created_at": now,
        "expires_at": now + timedelta(days=ACTIVITY_TTL_DAYS),
    }
    try:
        await db.activity_log.insert_one(doc)
    except Exception as exc:  # noqa: BLE001
        logger.error("log_activity(%s) failed: %s", action, exc)


def _to_string_id(doc_id: Any) -> Optional[str]:
    """Coerce a Mongo `_id` (could be ObjectId or str) to a string."""
    if doc_id is None:
        return None
    if isinstance(doc_id, ObjectId):
        return str(doc_id)
    return str(doc_id)
