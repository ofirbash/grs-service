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

import cloudinary
import cloudinary.uploader

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
    # Optional memo HTML template containing a `{{SIGNATURE_BLOCK}}`
    # placeholder. When provided, the backend stores it so finalize() can
    # swap the signature in and render a frozen PDF for archive.
    memo_html_template: Optional[str] = None
    # Optional signature capture trigger — when the admin uses the one-click
    # "Approve and Print" flow, we also create a signature_request in the
    # same call so the pad lights up. The signer_name is required for that.
    auto_create_signature_for: Optional[str] = None  # signer name
    signature_role: Optional[str] = None  # 'client_collection' or 'cert_collection'


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
        "signed_pdf_url": row.get("signed_pdf_url"),
        "signed_pdf_public_id": row.get("signed_pdf_public_id"),
        "finalized_at": _iso(row.get("finalized_at")),
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

    # Auto-create a signature request if the admin used the integrated
    # "Approve and Print" flow (real-world: client signs the printed memo
    # they just inspected on the pad). We do this BEFORE inserting the
    # pickup so the signature_request_id can be stored on it.
    now = datetime.now(timezone.utc)
    auto_sig_id: Optional[str] = None
    if payload.auto_create_signature_for and payload.signature_role:
        sig_doc = {
            "job_id": payload.job_id,
            "branch_id": job.get("branch_id"),
            "role": payload.signature_role,
            "signer_name": payload.auto_create_signature_for.strip(),
            "status": "pending",
            "signed_url": None,
            "signed_public_id": None,
            "created_at": now,
            "created_by": str(user.get("_id")),
            "created_by_name": user.get("full_name") or user.get("email"),
            "signed_at": None,
            "signed_by_user_agent": None,
            "signed_by_ip": None,
            "cancelled_at": None,
        }
        sig_result = await db.signature_requests.insert_one(sig_doc)
        auto_sig_id = str(sig_result.inserted_id)

    doc = {
        "job_id": payload.job_id,
        "branch_id": job.get("branch_id"),
        "type": payload.type,
        "stone_ids": payload.stone_ids,
        "signature_request_id": payload.signature_request_id or auto_sig_id,
        "memo_html_template": payload.memo_html_template,
        "signed_pdf_url": None,
        "signed_pdf_public_id": None,
        "finalized_at": None,
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


async def finalize_pickup_if_linked(signature_id: str, signature_url: str, signer_name: str) -> Optional[str]:
    """Called from `submit_signature` after a successful sign. Finds the
    pickup_event linked to this signature_request, swaps the signature
    PNG into its stored memo template, converts to PDF via xhtml2pdf,
    uploads to Cloudinary, and stores the URL on the pickup row.

    Returns the signed PDF URL, or None if there is no linked pickup or
    no memo template stored. Best-effort: any failure is logged but does
    not raise (the signature itself already succeeded)."""
    try:
        pickup = await db.pickup_events.find_one({"signature_request_id": signature_id})
        if not pickup or not pickup.get("memo_html_template"):
            return None
        # Idempotency: if this pickup already has a signed PDF, don't
        # re-upload (Cloudinary would otherwise accumulate orphan assets
        # because public_id is timestamp-based).
        if pickup.get("signed_pdf_url"):
            return pickup["signed_pdf_url"]
        return await _render_and_upload(pickup, signature_url, signer_name)
    except Exception:  # noqa: BLE001
        logger.exception("finalize_pickup_if_linked failed for signature %s", signature_id)
        return None


async def _render_and_upload(pickup: dict, signature_url: str, signer_name: str) -> Optional[str]:
    """Shared implementation: swap signature into memo template, render
    PDF, upload to Cloudinary, persist URL. Returns the secure URL or
    None if rendering produced no bytes."""
    html = pickup["memo_html_template"].replace(
        "{{SIGNATURE_BLOCK}}",
        f'<img src="{signature_url}" alt="Picked-up signature" '
        f'style="height:54px;object-fit:contain;max-width:100%;display:block;"/>'
        f'<div style="margin-top:4px;font-size:11px;color:#4a5a7a;">{signer_name}</div>',
    )

    import io
    import base64 as _b64
    from xhtml2pdf import pisa

    pdf_buf = io.BytesIO()
    result = pisa.CreatePDF(io.StringIO(html), dest=pdf_buf)
    if result.err:
        logger.warning("xhtml2pdf reported %s errors finalizing %s", result.err, pickup["_id"])
    pdf_bytes = pdf_buf.getvalue()
    if not pdf_bytes:
        return None

    import asyncio
    folder = f"pickup_receipts/{pickup.get('branch_id') or 'unscoped'}"
    public_id = f"{pickup['job_id']}_{pickup['type']}_{int(datetime.now(timezone.utc).timestamp())}"
    upload_resp = await asyncio.to_thread(
        cloudinary.uploader.upload,
        f"data:application/pdf;base64,{_b64.b64encode(pdf_bytes).decode()}",
        folder=folder,
        public_id=public_id,
        resource_type="raw",
        format="pdf",
        overwrite=True,
    )
    signed_url = upload_resp.get("secure_url")
    signed_public_id = upload_resp.get("public_id")

    await db.pickup_events.update_one(
        {"_id": pickup["_id"]},
        {"$set": {
            "signed_pdf_url": signed_url,
            "signed_pdf_public_id": signed_public_id,
            "finalized_at": datetime.now(timezone.utc),
        }},
    )
    return signed_url


class FinalizePayload(BaseModel):
    signature_url: Optional[str] = None
    signer_name: Optional[str] = None


@router.post("/pickups/{pickup_id}/finalize")
async def finalize_pickup(
    pickup_id: str,
    payload: FinalizePayload | None = None,
    user: dict = Depends(require_admin),
):
    """Independent finalize trigger — compiles the stored memo template
    into a PDF and archives it on Cloudinary. Idempotent: if the pickup
    already has a `signed_pdf_url`, return it without re-uploading.

    The primary call-path is the implicit one from `/signatures/{id}/submit`
    via `finalize_pickup_if_linked`. This endpoint exists for retries and
    out-of-band finalizations (e.g., signature was captured outside the
    standard flow)."""
    pickup = await db.pickup_events.find_one({"_id": _oid(pickup_id)})
    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    if user.get("role") == "branch_admin":
        if str(pickup.get("branch_id")) != str(user.get("branch_id")):
            raise HTTPException(status_code=403, detail="Pickup is in another branch")

    # Idempotent fast-path.
    if pickup.get("signed_pdf_url"):
        return _serialise(pickup)

    if not pickup.get("memo_html_template"):
        raise HTTPException(
            status_code=400,
            detail="This pickup has no stored memo template to render.",
        )

    # Resolve signature URL/name: prefer explicit payload, else fall back
    # to the linked signature_request, else 400.
    sig_url = (payload.signature_url if payload else None) or None
    signer = (payload.signer_name if payload else None) or None
    if (not sig_url or not signer) and pickup.get("signature_request_id"):
        sig_row = await db.signature_requests.find_one(
            {"_id": _oid(pickup["signature_request_id"], field="signature_request_id")}
        )
        if sig_row and sig_row.get("status") == "signed":
            sig_url = sig_url or sig_row.get("signed_url")
            signer = signer or sig_row.get("signer_name")

    if not sig_url:
        raise HTTPException(
            status_code=400,
            detail="No signature available to finalize (linked signature is not yet signed).",
        )

    await _render_and_upload(pickup, sig_url, signer or "")
    refreshed = await db.pickup_events.find_one({"_id": pickup["_id"]})
    return _serialise(refreshed or pickup)
