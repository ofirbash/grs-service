"""Read-only routes for the activity log.

RBAC:
  - super_admin sees all rows.
  - branch_admin sees rows for their branch only.

The TTL index handles 12-month auto-prune in the background.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from activity_log import Action
from auth import require_admin
from database import db

router = APIRouter()

# Static label table so the frontend filter dropdown shows human-readable
# options. Keep this in sync with the `Action` constants in activity_log.py.
# We expose it as a route response so the frontend never has to hardcode
# the same mapping in two places.
_ACTION_LABELS: dict[str, str] = {
    Action.JOB_CREATED: "Job created",
    Action.JOB_UPDATED: "Job updated",
    Action.JOB_STATUS_CHANGED: "Job status changed",
    Action.JOB_NOTIFICATION_SENT: "Notification sent",
    Action.STONE_VERBAL_ENTERED: "Verbal findings saved",
    Action.STONE_FEES_UPDATED: "Stone fees updated",
    Action.STONE_CERT_UPLOADED: "Certificate uploaded",
    Action.STONE_CANCELLED: "Stone removed",
    Action.SHIPMENT_CREATED: "Shipment created",
    Action.SHIPMENT_STATUS_CHANGED: "Shipment status changed",
    Action.PAYMENT_RECORDED: "Payment recorded",
    Action.CLIENT_CREATED: "Client created",
    Action.CLIENT_UPDATED: "Client updated",
    Action.LOGIN_SUCCESS: "Admin login",
}


def _serialise(row: dict) -> dict:
    """Mongo doc → JSON-safe dict. Drops `_id` (Bson is not serialisable)
    and `expires_at` (internal TTL field — operators don't need to see it).
    `created_at` is force-stamped UTC on the way out so JS `new Date(iso)`
    interprets it the same in every browser locale."""
    created_at = row.get("created_at")
    if isinstance(created_at, datetime):
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        created_iso = created_at.isoformat()
    else:
        created_iso = None
    return {
        "id": str(row.get("_id")),
        "action": row.get("action"),
        "actor_id": row.get("actor_id"),
        "actor_name": row.get("actor_name"),
        "actor_role": row.get("actor_role"),
        "job_id": row.get("job_id"),
        "stone_id": row.get("stone_id"),
        "shipment_id": row.get("shipment_id"),
        "client_id": row.get("client_id"),
        "branch_id": row.get("branch_id"),
        "summary": row.get("summary"),
        "metadata": row.get("metadata") or {},
        "created_at": created_iso,
    }


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 datetime string, returning None for empties.
    Raises 400 for malformed values so the client sees a useful error
    instead of a silent empty result set."""
    if not value:
        return None
    try:
        # `fromisoformat` handles both "YYYY-MM-DD" and full ISO with offset
        # (and accepts a trailing "Z" since Python 3.11).
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ISO date/time: {value!r}",
        )


@router.get("/activity")
async def list_activity(
    job_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    # Phase 2 filters
    action: Optional[List[str]] = Query(None, description="Repeatable — filter to one or more action codes."),
    actor_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, description="ISO datetime — inclusive lower bound on created_at."),
    to_date: Optional[str] = Query(None, description="ISO datetime — exclusive upper bound on created_at."),
    # Cursor pagination: pass the `created_at` of the oldest row from the
    # previous page; we return rows strictly older than that. Combined with
    # the default sort (created_at desc) this gives a stable forward-only
    # pager that doesn't drift when new rows arrive.
    before: Optional[str] = Query(None, description="ISO datetime cursor — return rows strictly older than this."),
    limit: int = Query(200, ge=1, le=500),
    user: dict = Depends(require_admin),
):
    """Per-job timeline (when `job_id` is set) or a recent feed (when not).

    Branch-admins are silently scoped to their own branch — even if the
    requested `job_id` belongs to a different branch they only see what
    they're allowed to. Super-admins see everything (and can optionally
    pass `branch_id` to scope down).
    """
    query: dict = {}
    if job_id:
        query["job_id"] = job_id

    role = user.get("role")
    if role == "branch_admin":
        actor_branch = user.get("branch_id")
        if not actor_branch:
            raise HTTPException(status_code=403, detail="Branch admin missing branch_id")
        # Force-scope to actor's branch — overrides any client-supplied branch_id.
        query["branch_id"] = actor_branch
    elif branch_id:
        # super_admin can optionally filter by branch.
        query["branch_id"] = branch_id

    if action:
        # `$in` keeps the index on (job_id, created_at) and (branch_id,
        # created_at) usable; the action filter is a post-bucket narrow.
        query["action"] = {"$in": action}

    if actor_id:
        query["actor_id"] = actor_id

    created_clauses: dict = {}
    parsed_from = _parse_iso(from_date)
    parsed_to = _parse_iso(to_date)
    parsed_before = _parse_iso(before)
    if parsed_from:
        created_clauses["$gte"] = parsed_from
    if parsed_to:
        created_clauses["$lt"] = parsed_to
    if parsed_before:
        # Cursor takes precedence over `to_date` when both are present —
        # `before` is the "next page" boundary; `to_date` is the user's
        # filter. Use whichever is older as the effective upper bound.
        existing_lt = created_clauses.get("$lt")
        created_clauses["$lt"] = (
            parsed_before if existing_lt is None or parsed_before < existing_lt else existing_lt
        )
    if created_clauses:
        query["created_at"] = created_clauses

    projection = {
        "_id": 1, "action": 1, "actor_id": 1, "actor_name": 1, "actor_role": 1,
        "job_id": 1, "stone_id": 1, "shipment_id": 1, "client_id": 1,
        "branch_id": 1, "summary": 1, "metadata": 1, "created_at": 1,
    }
    cursor = db.activity_log.find(query, projection).sort("created_at", -1).limit(limit)
    rows = [_serialise(r) async for r in cursor]
    return rows


@router.get("/activity/actions")
async def list_actions(user: dict = Depends(require_admin)):
    """Static label table for the action-filter dropdown. Returned in the
    order they're declared on `Action` so the UI has a sensible default
    grouping (job → stone → shipment → payment → client → auth)."""
    return [{"code": code, "label": label} for code, label in _ACTION_LABELS.items()]


@router.get("/activity/actors")
async def list_actors(user: dict = Depends(require_admin)):
    """Distinct (actor_id, actor_name, actor_role) tuples that appear in the
    log — populates the actor filter dropdown. Branch-admins see only actors
    in their own branch's rows.

    Returns at most 200 actors; the activity log is meant to be reasonably
    small (12-month TTL + one row per business write), so this is a
    bounded result set in practice. If we ever exceed it, the right answer
    is a typeahead, not a paginated list.
    """
    match_stage: dict = {}
    role = user.get("role")
    if role == "branch_admin":
        actor_branch = user.get("branch_id")
        if not actor_branch:
            raise HTTPException(status_code=403, detail="Branch admin missing branch_id")
        match_stage["branch_id"] = actor_branch

    pipeline = [
        {"$match": {**match_stage, "actor_id": {"$ne": None}}},
        {"$group": {
            "_id": "$actor_id",
            "name": {"$last": "$actor_name"},
            "role": {"$last": "$actor_role"},
            "last_seen": {"$max": "$created_at"},
        }},
        {"$sort": {"last_seen": -1}},
        {"$limit": 200},
    ]
    out = []
    async for row in db.activity_log.aggregate(pipeline):
        out.append({
            "actor_id": row["_id"],
            "name": row.get("name") or "(unknown)",
            "role": row.get("role"),
            "last_seen": row["last_seen"].isoformat() if row.get("last_seen") else None,
        })
    return out
