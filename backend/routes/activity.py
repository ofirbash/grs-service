"""Read-only routes for the activity log.

RBAC:
  - super_admin sees all rows.
  - branch_admin sees rows for their branch only.
The TTL index handles 12-month auto-prune in the background.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_admin
from database import db

router = APIRouter()


def _serialise(row: dict) -> dict:
    """Mongo doc → JSON-safe dict. Drops `_id` (Bson is not serialisable)
    and `expires_at` (internal TTL field — operators don't need to see it)."""
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
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
    }


@router.get("/activity")
async def list_activity(
    job_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_admin),
):
    """Per-job timeline (when `job_id` is set) or a recent feed (when not).

    Branch-admins are silently scoped to their own branch — even if the
    requested `job_id` belongs to a different branch they only see what
    they're allowed to. Super-admins see everything.
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

    cursor = db.activity_log.find(query, {"_id": 1, "action": 1, "actor_id": 1,
                                          "actor_name": 1, "actor_role": 1,
                                          "job_id": 1, "stone_id": 1,
                                          "shipment_id": 1, "client_id": 1,
                                          "branch_id": 1, "summary": 1,
                                          "metadata": 1, "created_at": 1})
    cursor = cursor.sort("created_at", -1).limit(limit)
    rows = [_serialise(r) async for r in cursor]
    return rows
