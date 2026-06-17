"""Pickup events — admin records when a client collects stones (memo
return) or certificates (cert collection) from the lab. Each event stores
the subset of stones involved, so the system can answer "which stones
haven't been collected yet?" and prevent double-pickup.

For memo_return events the route also flips the corresponding stones'
`stone_status` to 'returned' so the existing stone-tracking UI stays
consistent. Cert_collection does NOT change stone_status — the certificate
may travel home without the stone.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from activity_log import Action, log_activity
from auth import require_admin, require_super_admin
from database import db

logger = logging.getLogger(__name__)

router = APIRouter()

PICKUP_TYPES = {"memo_return", "cert_collection"}


class CreatePickupPayload(BaseModel):
    job_id: str
    type: str
    stone_ids: List[str] = Field(..., min_length=1)
    # Optional captured signature row — linked into the activity log so we
    # can later show "client X signed for this pickup" on the receipt.
    signature_request_id: Optional[str] = None


def _oid(value: str, *, field: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field}: {value!r}")


def _serialise(row: dict) -> dict:
    def _iso(value):
        if not isinstance(value, datetime):
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    return {
        "id": str(row.get("_id")),
        "job_id": row.get("job_id"),
        "branch_id": row.get("branch_id"),
        "type": row.get("type"),
        "stone_ids": row.get("stone_ids") or [],
        "signature_request_id": row.get("signature_request_id"),
        "printed_at": _iso(row.get("printed_at")),
        "printed_by": row.get("printed_by"),
        "printed_by_name": row.get("printed_by_name"),
    }


@router.post("/pickups")
async def create_pickup(payload: CreatePickupPayload, user: dict = Depends(require_admin)):
    if payload.type not in PICKUP_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Must be one of {sorted(PICKUP_TYPES)}",
        )

    job_oid = _oid(payload.job_id, field="job_id")
    job = await db.jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Branch scoping — same rule as everywhere else in the app.
    if user.get("role") == "branch_admin":
        if str(job.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Job is in another branch")

    # Validate stone_ids belong to this job and are active (not cancelled).
    active_ids = {
        s.get("id") for s in (job.get("stones") or [])
        if not s.get("cancelled")
    }
    invalid = [sid for sid in payload.stone_ids if sid not in active_ids]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Stone IDs not in this job (or cancelled): {invalid}",
        )

    # Double-pickup guard: same type, already picked. We let the operator
    # see a 409 instead of silently creating duplicates — they almost
    # always meant to print a receipt rather than record a second pickup.
    prior_events = await db.pickup_events.find({
        "job_id": payload.job_id,
        "type": payload.type,
    }).to_list(length=200)
    already_picked = {
        sid for ev in prior_events for sid in (ev.get("stone_ids") or [])
    }
    conflict = [sid for sid in payload.stone_ids if sid in already_picked]
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Already recorded as picked up: {conflict}. "
                "Delete the prior pickup event first if this is a mistake."
            ),
        )

    now = datetime.now(timezone.utc)
    doc = {
        "job_id": payload.job_id,
        "branch_id": job.get("branch_id"),
        "type": payload.type,
        "stone_ids": payload.stone_ids,
        "signature_request_id": payload.signature_request_id,
        "printed_at": now,
        "printed_by": str(user.get("_id")),
        "printed_by_name": user.get("full_name") or user.get("email"),
    }
    result = await db.pickup_events.insert_one(doc)
    doc["_id"] = result.inserted_id

    # For memo_return: physically the stones are now back with the client,
    # so flip their stone_status to 'returned'. Cert_collection doesn't
    # touch stone_status (the stone may stay at the office while only the
    # cert physically travels home).
    if payload.type == "memo_return":
        await db.jobs.update_one(
            {"_id": job_oid, "stones.id": {"$in": payload.stone_ids}},
            {"$set": {
                "stones.$[s].stone_status": "returned",
                "updated_at": now,
            }},
            array_filters=[{"s.id": {"$in": payload.stone_ids}}],
        )

    await log_activity(
        Action.PICKUP_PRINTED,
        actor=user,
        job_id=payload.job_id,
        branch_id=job.get("branch_id"),
        summary=f"{payload.type} · {len(payload.stone_ids)} stones",
        metadata={
            "pickup_id": str(result.inserted_id),
            "type": payload.type,
            "stone_count": len(payload.stone_ids),
        },
    )

    return _serialise(doc)


@router.get("/jobs/{job_id}/pickups")
async def list_job_pickups(job_id: str, user: dict = Depends(require_admin)):
    rows = await db.pickup_events.find({"job_id": job_id}) \
        .sort("printed_at", -1).to_list(length=200)

    if user.get("role") == "branch_admin":
        rows = [r for r in rows if str(r.get("branch_id")) == str(user.get("branch_id"))]

    return [_serialise(r) for r in rows]


@router.delete("/pickups/{pickup_id}")
async def delete_pickup(pickup_id: str, user: dict = Depends(require_super_admin)):
    """Undo a pickup event — super_admin only. For memo_return events,
    also reverts the stones' stone_status to 'at_office' if no OTHER
    memo_return event still claims them. The signature record is kept
    intact (the client did sign, just for a now-revoked event)."""
    row = await db.pickup_events.find_one({"_id": _oid(pickup_id)})
    if not row:
        raise HTTPException(status_code=404, detail="Pickup not found")

    job_id = row.get("job_id")
    if row.get("type") == "memo_return" and job_id:
        # Stones to revert = those in this pickup that are NOT in any other
        # memo_return event for the same job.
        other_events = await db.pickup_events.find({
            "_id": {"$ne": row["_id"]},
            "job_id": job_id,
            "type": "memo_return",
        }).to_list(length=200)
        still_picked = {
            sid for ev in other_events for sid in (ev.get("stone_ids") or [])
        }
        to_revert = [sid for sid in (row.get("stone_ids") or []) if sid not in still_picked]
        if to_revert:
            await db.jobs.update_one(
                {"_id": _oid(job_id, field="job_id"), "stones.id": {"$in": to_revert}},
                {"$set": {
                    "stones.$[s].stone_status": "at_office",
                    "updated_at": datetime.now(timezone.utc),
                }},
                array_filters=[{"s.id": {"$in": to_revert}}],
            )

    await db.pickup_events.delete_one({"_id": row["_id"]})

    await log_activity(
        Action.PICKUP_DELETED,
        actor=user,
        job_id=row.get("job_id"),
        branch_id=row.get("branch_id"),
        summary=f"{row.get('type')} pickup undone",
        metadata={
            "pickup_id": pickup_id,
            "type": row.get("type"),
            "stone_count": len(row.get("stone_ids") or []),
        },
    )

    return {"deleted": True}
