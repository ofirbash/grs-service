"""Customer signature capture — Phase 1 (Feb 25 2026).

UX model: dedicated tablet/phone at each branch's front desk runs a kiosk
signing-pad page. The admin works on their desktop, clicks "Capture
client drop-off signature" inside the Job Detail dialog → a row lands in
`signature_requests` with status=pending. The pad polls
`GET /signatures/pending` every 2s, shows a full-screen canvas to the
client, who signs and submits. The PNG goes to Cloudinary, the row
flips to status=signed, and the desktop's own poll picks it up.

Multi-branch: each location has its own signing_pad user account whose
`branch_id` matches the location. The polling endpoint scopes to that
branch automatically — Israel pad never sees NY requests. Super admins
acting at any desk capture against the JOB's branch (not their own),
so the pad routing always "follows the job".
"""

from __future__ import annotations

import base64
import binascii
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import cloudinary
import cloudinary.uploader
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from activity_log import Action, log_activity
from auth import require_admin, require_signing_pad
from database import db

logger = logging.getLogger(__name__)

router = APIRouter()

SIGNATURE_ROLES = {
    "client_drop_off",
    "client_collection",
    "cert_collection",
    "courier_drop_off",
}

# How long a pending signature_request stays valid on the pad before being
# auto-cancelled with status="expired". Bumped at request-creation time
# (`created_at + SIGNATURE_PENDING_TTL_SECONDS`). Default 180s; override
# with SIGNATURE_PENDING_TTL_SECONDS in backend/.env if a branch needs
# longer (slow-arriving clients) or shorter (high-traffic kiosk).
#
# The expiry is enforced on every pad poll (no separate scheduler), which
# also means as soon as the pad's next 2s tick lands after the deadline,
# the stale row is reaped and the pad returns to the idle screen.
SIGNATURE_PENDING_TTL_SECONDS = int(os.environ.get("SIGNATURE_PENDING_TTL_SECONDS", "180"))

# Maximum allowed signature PNG payload — keeps Cloudinary upload latency
# bounded and rejects malformed clients sending megabytes of data.
MAX_PAYLOAD_BYTES = 2 * 1024 * 1024  # 2 MiB


class CreateSignatureRequestPayload(BaseModel):
    job_id: str
    role: str
    signer_name: str = Field(..., min_length=1, max_length=120)


class SubmitSignaturePayload(BaseModel):
    # The full data URL ("data:image/png;base64,...") OR the bare base64
    # body — both are accepted so the tablet client doesn't have to care.
    image_base64: str = Field(..., min_length=20)


def _serialise(row: dict) -> dict:
    """Mongo doc → JSON-safe dict. Datetimes go out as UTC-aware ISO."""
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
        "role": row.get("role"),
        "signer_name": row.get("signer_name"),
        "status": row.get("status"),
        "signed_url": row.get("signed_url"),
        "signed_public_id": row.get("signed_public_id"),
        "created_at": _iso(row.get("created_at")),
        "created_by": row.get("created_by"),
        "created_by_name": row.get("created_by_name"),
        "signed_at": _iso(row.get("signed_at")),
        "signed_by_user_agent": row.get("signed_by_user_agent"),
        "signed_by_ip": row.get("signed_by_ip"),
        "cancelled_at": _iso(row.get("cancelled_at")),
        "expires_at": _iso(row.get("expires_at")),
        "cancellation_reason": row.get("cancellation_reason"),
    }


def _oid(value: str, *, field: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field}: {value!r}")


@router.post("/signatures/request")
async def create_signature_request(
    payload: CreateSignatureRequestPayload,
    user: dict = Depends(require_admin),
):
    """Admin clicks "Capture signature" on the desktop → creates a
    pending row. The pad will pick it up on its next poll."""
    if payload.role not in SIGNATURE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of {sorted(SIGNATURE_ROLES)}",
        )

    job_oid = _oid(payload.job_id, field="job_id")
    job = await db.jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Branch-scope check: a branch_admin must own this job's branch.
    if user.get("role") == "branch_admin":
        if str(job.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Job is in another branch")

    # One pending request per (job, role) at a time. If the admin re-clicks
    # before the previous one was signed, replace it (cancel the stale one)
    # rather than queueing — otherwise the pad sees N duplicates.
    existing = await db.signature_requests.find_one({
        "job_id": payload.job_id,
        "role": payload.role,
        "status": "pending",
    })
    if existing:
        await db.signature_requests.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc),
            }},
        )

    now = datetime.now(timezone.utc)
    doc = {
        "job_id": payload.job_id,
        "branch_id": job.get("branch_id"),
        "role": payload.role,
        "signer_name": payload.signer_name.strip(),
        "status": "pending",
        "signed_url": None,
        "signed_public_id": None,
        "created_at": now,
        "expires_at": now + timedelta(seconds=SIGNATURE_PENDING_TTL_SECONDS),
        "created_by": str(user.get("_id")),
        "created_by_name": user.get("full_name") or user.get("email"),
        "signed_at": None,
        "signed_by_user_agent": None,
        "signed_by_ip": None,
        "cancelled_at": None,
        "cancellation_reason": None,
    }
    result = await db.signature_requests.insert_one(doc)
    doc["_id"] = result.inserted_id

    await log_activity(
        Action.SIGNATURE_REQUESTED,
        actor=user,
        job_id=payload.job_id,
        branch_id=job.get("branch_id"),
        summary=f"{payload.role} \u00b7 {payload.signer_name}",
        metadata={"role": payload.role, "request_id": str(result.inserted_id)},
    )

    return _serialise(doc)


@router.get("/signatures/pending")
async def get_pending_signature(
    user: dict = Depends(require_signing_pad),
):
    """Pad polls this every 2s. Returns the OLDEST pending request for the
    caller's branch — or `null` if none. Scoping rules:
      - signing_pad / branch_admin with branch_id: only their branch.
      - signing_pad / super_admin without branch_id ("global catch-all"
        pad): any pending request, oldest first.

    Side-effect: reaps any pending row whose `expires_at` is in the past
    (or, for legacy rows that pre-date the field, whose `created_at` is
    older than the TTL). This is the only mechanism that auto-clears
    stale requests — so the pad doesn't get stuck showing a signature
    request the admin abandoned an hour ago.
    """
    now = datetime.now(timezone.utc)
    # Reap expired rows scoped to the *whole DB* (cheap update_many on an
    # indexed status field). Cross-branch reaping is safe — a Tel Aviv
    # admin abandoning a request shouldn't haunt the NY pad either.
    legacy_cutoff = now - timedelta(seconds=SIGNATURE_PENDING_TTL_SECONDS)
    await db.signature_requests.update_many(
        {
            "status": "pending",
            "$or": [
                {"expires_at": {"$lte": now}},
                # Rows created before the expires_at field shipped — fall
                # back to created_at + TTL for the same end-user behaviour.
                {"expires_at": {"$exists": False}, "created_at": {"$lte": legacy_cutoff}},
            ],
        },
        {"$set": {
            "status": "expired",
            "cancelled_at": now,
            "cancellation_reason": "expired",
        }},
    )

    query: dict = {"status": "pending"}
    if user.get("branch_id"):
        query["branch_id"] = user.get("branch_id")

    row = await db.signature_requests.find_one(query, sort=[("created_at", 1)])
    if not row:
        return None
    return _serialise(row)


@router.get("/signatures/{request_id}")
async def get_signature_request(
    request_id: str,
    user: dict = Depends(require_admin),
):
    """Desktop polls this after clicking 'Capture signature' to learn
    when the pad has accepted/signed it."""
    row = await db.signature_requests.find_one({"_id": _oid(request_id)})
    if not row:
        raise HTTPException(status_code=404, detail="Signature request not found")
    if user.get("role") == "branch_admin":
        if str(row.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Branch mismatch")
    return _serialise(row)


@router.get("/jobs/{job_id}/signatures")
async def list_job_signatures(
    job_id: str,
    user: dict = Depends(require_admin),
):
    """Returns ALL signature rows (pending, signed, cancelled) for a job —
    drives the captured-signature gallery in the Job Detail dialog."""
    rows = await db.signature_requests.find({"job_id": job_id}) \
        .sort("created_at", -1).to_list(length=100)

    if user.get("role") == "branch_admin":
        rows = [r for r in rows if str(r.get("branch_id")) == str(user.get("branch_id"))]

    return [_serialise(r) for r in rows]


@router.post("/signatures/{request_id}/submit")
async def submit_signature(
    request_id: str,
    payload: SubmitSignaturePayload,
    request: Request,
    user: dict = Depends(require_signing_pad),
):
    """Pad uploads the captured PNG. Cloudinary stores it; we flip the
    row to status=signed and capture a tiny audit trail (user-agent + IP)."""
    row = await db.signature_requests.find_one({"_id": _oid(request_id)})
    if not row:
        raise HTTPException(status_code=404, detail="Signature request not found")
    if row.get("status") != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Request is {row.get('status')}, cannot submit",
        )
    # Reject submissions that arrived after the row expired (between the
    # pad's last poll and now). Matches the reaper's TTL logic.
    expires_at = row.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            await db.signature_requests.update_one(
                {"_id": row["_id"]},
                {"$set": {
                    "status": "expired",
                    "cancelled_at": datetime.now(timezone.utc),
                    "cancellation_reason": "expired",
                }},
            )
            raise HTTPException(status_code=410, detail="Signature request expired")
    # Pad branch scoping — same rule as polling.
    if user.get("branch_id"):
        if str(row.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Branch mismatch")

    # Accept either "data:image/png;base64,XXX" or bare "XXX".
    raw = payload.image_base64
    if raw.startswith("data:"):
        try:
            _, raw = raw.split(",", 1)
        except ValueError:
            raise HTTPException(status_code=400, detail="Malformed data URL")
    try:
        binary = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 payload")
    if len(binary) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Signature image too large")
    if len(binary) < 100:
        # An empty canvas serialises to ~70 bytes — reject early so the
        # client gets a useful error instead of an "everything saved" toast
        # followed by a confused admin.
        raise HTTPException(status_code=400, detail="Signature image is empty")

    # Upload to Cloudinary. The folder mirrors how memos/certs are
    # organised; the public_id encodes job + role + timestamp so URLs
    # are self-describing in the dashboard.
    folder = f"signatures/{row.get('branch_id') or 'unscoped'}"
    public_id = f"{row['job_id']}_{row['role']}_{int(datetime.now(timezone.utc).timestamp())}"
    try:
        # Wrap in to_thread — Cloudinary SDK is synchronous and would block
        # the FastAPI event loop otherwise (same fix we did for Resend).
        import asyncio
        upload_resp = await asyncio.to_thread(
            cloudinary.uploader.upload,
            f"data:image/png;base64,{raw}",
            folder=folder,
            public_id=public_id,
            resource_type="image",
            overwrite=True,
        )
    except Exception as exc:  # noqa: BLE001 — Cloudinary raises many things
        logger.exception("Cloudinary upload failed for signature %s", request_id)
        raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {exc}")

    signed_url = upload_resp.get("secure_url")
    signed_public_id = upload_resp.get("public_id")

    now = datetime.now(timezone.utc)
    await db.signature_requests.update_one(
        {"_id": row["_id"]},
        {"$set": {
            "status": "signed",
            "signed_url": signed_url,
            "signed_public_id": signed_public_id,
            "signed_at": now,
            "signed_by_user_agent": (request.headers.get("user-agent") or "")[:300],
            "signed_by_ip": (request.client.host if request.client else None),
        }},
    )

    await log_activity(
        Action.SIGNATURE_CAPTURED,
        actor=user,
        job_id=row["job_id"],
        branch_id=row.get("branch_id"),
        summary=f"{row['role']} \u00b7 {row['signer_name']}",
        metadata={"role": row["role"], "request_id": str(row["_id"])},
    )

    # If this signature is linked to a pickup_event (one-click "Approve
    # and Print" flow), finalize that pickup: render memo HTML → PDF →
    # Cloudinary, store url on the row. Best-effort — failures here don't
    # block the signature submission since the row is already signed.
    try:
        from routes.pickups import finalize_pickup_if_linked
        await finalize_pickup_if_linked(
            signature_id=str(row["_id"]),
            signature_url=signed_url,
            signer_name=row.get("signer_name", ""),
        )
    except Exception:  # noqa: BLE001
        logger.exception("pickup finalize hook failed for signature %s", row["_id"])

    updated = await db.signature_requests.find_one({"_id": row["_id"]})
    return _serialise(updated)


@router.post("/signatures/{request_id}/cancel")
async def cancel_signature_request(
    request_id: str,
    user: dict = Depends(require_admin),
):
    """Admin cancels a pending request — e.g. client walked away before
    signing. No-op if already signed/cancelled."""
    row = await db.signature_requests.find_one({"_id": _oid(request_id)})
    if not row:
        raise HTTPException(status_code=404, detail="Signature request not found")
    if user.get("role") == "branch_admin":
        if str(row.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Branch mismatch")
    if row.get("status") != "pending":
        return _serialise(row)

    await db.signature_requests.update_one(
        {"_id": row["_id"]},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc),
        }},
    )

    await log_activity(
        Action.SIGNATURE_CANCELLED,
        actor=user,
        job_id=row["job_id"],
        branch_id=row.get("branch_id"),
        summary=f"{row['role']} \u00b7 {row['signer_name']}",
        metadata={"role": row["role"], "request_id": str(row["_id"])},
    )

    updated = await db.signature_requests.find_one({"_id": row["_id"]})
    return _serialise(updated)


@router.delete("/signatures/{request_id}")
async def delete_signature(
    request_id: str,
    user: dict = Depends(require_admin),
):
    """Remove a captured signature entirely — used when a bad capture
    (smudge, wrong client, etc.) needs to be redone. Deletes the
    Cloudinary asset too so storage doesn't accumulate orphans."""
    row = await db.signature_requests.find_one({"_id": _oid(request_id)})
    if not row:
        raise HTTPException(status_code=404, detail="Signature request not found")
    if user.get("role") == "branch_admin":
        if str(row.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Branch mismatch")

    if row.get("signed_public_id"):
        try:
            import asyncio
            await asyncio.to_thread(
                cloudinary.uploader.destroy,
                row["signed_public_id"],
                resource_type="image",
            )
        except Exception:  # noqa: BLE001 — log but don't block deletion of the DB row
            logger.exception("Cloudinary destroy failed for signature %s", request_id)

    await db.signature_requests.delete_one({"_id": row["_id"]})

    await log_activity(
        Action.SIGNATURE_DELETED,
        actor=user,
        job_id=row["job_id"],
        branch_id=row.get("branch_id"),
        summary=f"{row['role']} \u00b7 {row['signer_name']}",
        metadata={"role": row["role"], "request_id": str(row["_id"])},
    )

    return {"deleted": True}
