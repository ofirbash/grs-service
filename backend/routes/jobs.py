from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import uuid
import os

from database import db
from auth import get_current_user, require_admin
from models import (
    JobCreate, JobResponse, JobStatusUpdate, JobUpdate,
    StoneResponse, VerbalFindingResponse, NotificationLog,
    StoneGroupUpdate, StoneUngroupUpdate, MemoUpload, AddStoneRequest,
    VerbalFindingCreate
)
from pricing import (
    get_pricing_brackets_from_db,
    get_color_stability_fee_from_db,
    get_mounted_fee_from_db,
    calculate_stone_fee_from_brackets,
    calculate_parcel_fee_from_brackets,
)
from utils import generate_sku
from jobs_helpers import active_stones, recompute_job_totals, is_parcel, physical_stone_count
from activity_log import Action, log_activity

FRONTEND_URL = os.getenv("FRONTEND_URL", "")

router = APIRouter()


def _resolve_shipment_ids(job: dict) -> list:
    shipment_ids = job.get("shipment_ids", [])
    if not shipment_ids and job.get("shipment_id"):
        return [job.get("shipment_id")]
    return shipment_ids


async def _fetch_latest_shipment_info(shipment_ids: list) -> Optional[dict]:
    if not shipment_ids:
        return None
    try:
        shipment = await db.shipments.find_one({"_id": ObjectId(shipment_ids[-1])})
    except Exception:
        return None
    if not shipment:
        return None
    date_sent = shipment.get("date_sent")
    return {
        "id": str(shipment["_id"]),
        "shipment_number": shipment["shipment_number"],
        "shipment_type": shipment["shipment_type"],
        "courier": shipment["courier"],
        "tracking_number": shipment.get("tracking_number"),
        "source_address": shipment["source_address"],
        "destination_address": shipment["destination_address"],
        "status": shipment["status"],
        "date_sent": date_sent.isoformat() if date_sent else None,
    }


def _serialize_payments(job: dict) -> list:
    out = []
    for p in (job.get("payments", []) or []):
        recorded = p.get("recorded_at")
        out.append({
            **p,
            "recorded_at": recorded.isoformat() if hasattr(recorded, "isoformat") else recorded,
        })
    return out


def _build_payment_url(job: dict) -> Optional[str]:
    token = job.get("payment_token")
    return f"{FRONTEND_URL}/pay/?token={token}" if token and FRONTEND_URL else None


async def build_job_response(job: dict) -> JobResponse:
    """Build a JobResponse from a job document, enriching with client/branch/shipment data"""
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})

    shipment_ids = _resolve_shipment_ids(job)
    shipment_info = await _fetch_latest_shipment_info(shipment_ids)

    return JobResponse(
        id=str(job["_id"]),
        job_number=job["job_number"],
        client_id=job["client_id"],
        client_name=client.get("name") if client else None,
        branch_id=job["branch_id"],
        branch_name=branch.get("name") if branch else None,
        service_type=job["service_type"],
        recheck_reasons=job.get("recheck_reasons"),
        status=job["status"],
        notes=job.get("notes"),
        stones=[StoneResponse(**s) for s in job.get("stones", [])],
        verbal_findings=[VerbalFindingResponse(**vf) for vf in job.get("verbal_findings", [])],
        notification_log=[NotificationLog(**nl) for nl in job.get("notification_log", [])],
        total_stones=job["total_stones"],
        total_certificates=job.get("total_certificates", len(job.get("stones", []))),
        total_value=job["total_value"],
        total_fee=job["total_fee"],
        discount=job.get("discount"),
        shipment_ids=shipment_ids,
        shipment_info=shipment_info,
        signed_memo_url=job.get("signed_memo_url"),
        signed_memo_filename=job.get("signed_memo_filename"),
        lab_invoice_url=job.get("lab_invoice_url"),
        lab_invoice_filename=job.get("lab_invoice_filename"),
        invoice_url=job.get("invoice_url"),
        invoice_filename=job.get("invoice_filename"),
        payment_status=job.get("payment_status"),
        payment_token=job.get("payment_token"),
        payment_url=_build_payment_url(job),
        payments=_serialize_payments(job),
        created_at=job["created_at"],
        updated_at=job["updated_at"],
    )


def _enforce_client_branch_consistency(job: JobCreate, client: dict) -> None:
    """A job must live in the client's own branch (no cross-branch jobs).

    The frontend auto-fills `branch_id` from the selected client, but we guard
    the API too for direct-caller safety. Mutates `job.branch_id` in place
    when the client has a branch — even if the caller omitted it.
    """
    client_branch_id = str(client.get("branch_id")) if client.get("branch_id") else None
    if client_branch_id and job.branch_id and job.branch_id != client_branch_id:
        raise HTTPException(
            status_code=400,
            detail="Job branch must match the client's branch.",
        )
    if client_branch_id:
        job.branch_id = client_branch_id


async def _assign_next_job_number() -> int:
    """Job numbers start at 500. After that each new job increments by 1."""
    last_job = await db.jobs.find_one(sort=[("job_number", -1)])
    last_number = last_job.get("job_number", 0) if last_job else 0
    return max(last_number + 1, 500)


def _build_stones_for_create(
    certificate_units: list,
    *,
    job_number: int,
    service_type: str,
    db_brackets: list,
    cs_fee: float,
    mounted_fee: float,
) -> tuple[list[dict], float, float]:
    """Build the `stones` subdocs for a brand-new job.

    Returns `(stones, total_value, total_fee)`. Each stone gets a fresh UUID,
    deterministic SKU (`<TYPE><CT00><JOB><POS>`), and starts in the partial-
    return lifecycle at `stone_status=at_office, cert_status=pending`.

    Parcel rows (`is_parcel=True`, `stone_count>=2`) get `kind="parcel"`
    and use the parcel pricing helper instead of the per-stone bracket
    lookup.
    """
    stones: list[dict] = []
    position = 1
    total_value = 0.0
    total_fee = 0.0
    for cert_unit in certificate_units:
        for stone_data in cert_unit.stones:
            sku = generate_sku(
                stone_data.stone_type, stone_data.weight, job_number, position
            )
            parcel = bool(getattr(stone_data, "is_parcel", False))
            count = int(getattr(stone_data, "stone_count", 0) or 0)
            mounted_flag = bool(getattr(stone_data, "mounted", False))
            if parcel:
                if count < 2:
                    raise HTTPException(
                        status_code=400,
                        detail="Parcel rows require stone_count >= 2.",
                    )
                fee = calculate_parcel_fee_from_brackets(
                    stone_data.value,
                    count,
                    service_type,
                    stone_data.color_stability_test,
                    mounted_flag,
                    db_brackets,
                    cs_fee,
                    mounted_fee,
                )
            else:
                fee = calculate_stone_fee_from_brackets(
                    stone_data.value,
                    service_type,
                    stone_data.color_stability_test,
                    db_brackets,
                    cs_fee,
                )
                if mounted_flag:
                    fee += mounted_fee
            stone_doc = {
                "id": str(uuid.uuid4()),
                "sku": sku,
                "stone_type": stone_data.stone_type,
                "weight": stone_data.weight,
                "shape": stone_data.shape,
                "value": stone_data.value,
                "color_stability_test": stone_data.color_stability_test,
                "mounted": mounted_flag,
                "fee": fee,
                "position": position,
                "certificate_scan": None,
                # Every new stone starts at the office, cert not yet issued.
                "stone_status": "at_office",
                "cert_status": "pending",
            }
            if parcel:
                stone_doc["kind"] = "parcel"
                stone_doc["stone_count"] = count
            stones.append(stone_doc)
            total_value += stone_data.value
            total_fee += fee
            position += 1
    return stones, total_value, total_fee


@router.post("/jobs", response_model=JobResponse)
async def create_job(job: JobCreate, user: dict = Depends(require_admin)):
    client = await db.clients.find_one({"_id": ObjectId(job.client_id)})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    _enforce_client_branch_consistency(job, client)

    # Recheck service requires one or more reasons documenting why the
    # stone(s) are being re-examined. Other service types must NOT carry
    # a recheck_reasons list (it would be meaningless and would confuse
    # downstream renders like the memo / invoice).
    recheck_reasons: Optional[List[str]] = None
    if job.service_type == "Recheck":
        if not job.recheck_reasons:
            raise HTTPException(
                status_code=400,
                detail="Recheck jobs require at least one reason "
                       "(e.g. Origin, Color, Identification, Comment).",
            )
        # Trim, drop empties, dedupe (preserve order)
        seen: set[str] = set()
        recheck_reasons = []
        for r in job.recheck_reasons:
            r2 = (r or "").strip()
            if r2 and r2 not in seen:
                seen.add(r2)
                recheck_reasons.append(r2)
        if not recheck_reasons:
            raise HTTPException(
                status_code=400,
                detail="Recheck jobs require at least one non-empty reason.",
            )
    elif job.recheck_reasons:
        # Don't reject — silently drop. Frontend can send a stale list when
        # the user switches from Recheck → Express. Persisting None keeps
        # the doc clean.
        recheck_reasons = None

    job_number = await _assign_next_job_number()

    db_brackets = await get_pricing_brackets_from_db()
    cs_fee = await get_color_stability_fee_from_db()
    mounted_fee = await get_mounted_fee_from_db()

    stones, total_value, total_fee = _build_stones_for_create(
        job.certificate_units,
        job_number=job_number,
        service_type=job.service_type,
        db_brackets=db_brackets,
        cs_fee=cs_fee,
        mounted_fee=mounted_fee,
    )

    total_stones_physical = sum(physical_stone_count(s) for s in stones)
    total_certificates = len(stones)

    job_doc = {
        "job_number": job_number,
        "client_id": job.client_id,
        "branch_id": job.branch_id,
        "service_type": job.service_type,
        "status": "draft",
        "notes": job.notes,
        "stones": stones,
        "verbal_findings": [],
        "notification_log": [],
        "documents": [],
        "total_stones": total_stones_physical,
        "total_certificates": total_certificates,
        "total_value": total_value,
        "total_fee": total_fee,
        "created_by": str(user["_id"]),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    if recheck_reasons:
        job_doc["recheck_reasons"] = recheck_reasons

    result = await db.jobs.insert_one(job_doc)
    branch = await db.branches.find_one({"_id": ObjectId(job.branch_id)})

    await log_activity(
        Action.JOB_CREATED,
        actor=user,
        job_id=str(result.inserted_id),
        client_id=job.client_id,
        branch_id=job.branch_id,
        summary=f"Job #{job_number} \u00b7 {len(stones)} stones",
    )

    return JobResponse(
        id=str(result.inserted_id),
        job_number=job_number,
        client_id=job.client_id,
        client_name=client.get("name"),
        branch_id=job.branch_id,
        branch_name=branch.get("name") if branch else None,
        service_type=job.service_type,
        recheck_reasons=recheck_reasons,
        status="draft",
        notes=job.notes,
        stones=[StoneResponse(**s) for s in stones],
        verbal_findings=[],
        notification_log=[],
        total_stones=total_stones_physical,
        total_certificates=total_certificates,
        total_value=total_value,
        total_fee=total_fee,
        created_at=job_doc["created_at"],
        updated_at=job_doc["updated_at"],
    )


@router.get("/jobs", response_model=List[JobResponse])
async def get_jobs(
    branch_id: Optional[str] = None,
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}

    if user["role"] == "customer":
        user_client_id = user.get("client_id")
        if user_client_id:
            query["client_id"] = user_client_id
        else:
            client = await db.clients.find_one({"email": user["email"]})
            if client:
                query["client_id"] = str(client["_id"])
            else:
                return []
    elif user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")

    if branch_id and user["role"] == "super_admin":
        query["branch_id"] = branch_id
    if client_id and user["role"] != "customer":
        query["client_id"] = client_id
    if status:
        query["status"] = status

    jobs = await db.jobs.find(query).sort("created_at", -1).to_list(1000)

    response = []
    for job in jobs:
        response.append(await build_job_response(job))

    return response


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return await build_job_response(job)


@router.put("/jobs/{job_id}/status", response_model=JobResponse)
async def update_job_status(job_id: str, status_update: JobStatusUpdate, user: dict = Depends(require_admin)):
    valid_statuses = ["draft", "stones_accepted", "sent_to_lab", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done", "cancelled"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    # Read old status so we can label the activity row (no diff payload, but
    # the action label "X → Y" is the one piece of context that's
    # genuinely useful on a timeline).
    existing = await db.jobs.find_one({"_id": ObjectId(job_id)}, {"status": 1, "branch_id": 1, "job_number": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Job not found")
    old_status = existing.get("status")

    result = await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": status_update.status, "updated_at": datetime.utcnow()}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")

    await log_activity(
        Action.JOB_STATUS_CHANGED,
        actor=user,
        job_id=job_id,
        branch_id=existing.get("branch_id"),
        summary=f"{old_status} \u2192 {status_update.status}",
        metadata={"from": old_status, "to": status_update.status},
    )

    return await get_job(job_id, user)


@router.put("/jobs/{job_id}/group-stones")
async def group_stones_for_certificate(job_id: str, group_update: StoneGroupUpdate, user: dict = Depends(require_admin)):
    """Group stones together for a single certificate (max 30 per group).

    Parcels cannot be grouped — a parcel already represents one certificate
    covering N stones, so combining it with anything else would be a
    contradiction. We reject the whole call with a clear error rather than
    silently skip the offending rows.
    """
    if len(group_update.stone_ids) > 30:
        raise HTTPException(status_code=400, detail="Maximum 30 stones per certificate group")

    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stones = job.get("stones", [])
    target_skus = []
    for stone in stones:
        if stone["id"] in group_update.stone_ids and is_parcel(stone):
            target_skus.append(stone.get("sku") or stone["id"])
    if target_skus:
        raise HTTPException(
            status_code=400,
            detail=f"Parcels cannot be added to a certificate group: {', '.join(target_skus)}",
        )

    for stone in stones:
        if stone["id"] in group_update.stone_ids:
            stone["certificate_group"] = group_update.group_number

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"stones": stones, "updated_at": datetime.utcnow()}}
    )

    return {"message": f"Grouped {len(group_update.stone_ids)} stones into certificate group {group_update.group_number}"}


@router.put("/jobs/{job_id}/ungroup-stones")
async def ungroup_stones(job_id: str, ungroup_update: StoneUngroupUpdate, user: dict = Depends(require_admin)):
    """Remove stones from their certificate group"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stones = job.get("stones", [])
    ungrouped_count = 0
    for stone in stones:
        if stone["id"] in ungroup_update.stone_ids:
            stone["certificate_group"] = None
            ungrouped_count += 1

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"stones": stones, "updated_at": datetime.utcnow()}}
    )

    return {"message": f"Ungrouped {ungrouped_count} stones"}


@router.put("/jobs/{job_id}/memo")
async def upload_signed_memo(job_id: str, memo: MemoUpload, user: dict = Depends(require_admin)):
    """Upload a signed memo document to a job"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {
            "signed_memo_url": memo.file_data,
            "signed_memo_filename": memo.filename,
            "updated_at": datetime.utcnow()
        }}
    )

    return {"message": "Memo uploaded successfully", "filename": memo.filename}


@router.put("/jobs/{job_id}/lab-invoice")
async def upload_lab_invoice(job_id: str, memo: MemoUpload, user: dict = Depends(require_admin)):
    """Upload a lab invoice document to a job (admin only)"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {
            "lab_invoice_url": memo.file_data,
            "lab_invoice_filename": memo.filename,
            "updated_at": datetime.utcnow()
        }}
    )

    return {"message": "Lab invoice uploaded successfully", "filename": memo.filename}


@router.post("/jobs/{job_id}/stones")
async def add_stone_to_job(job_id: str, stone: AddStoneRequest, user: dict = Depends(require_admin)):
    """Add a new stone (or parcel) to an existing job."""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing_stones = job.get("stones", [])
    next_position = len(existing_stones) + 1

    db_brackets = await get_pricing_brackets_from_db()
    cs_fee = await get_color_stability_fee_from_db()
    mounted_fee = await get_mounted_fee_from_db()
    service_type = job.get("service_type", "Normal")

    is_p = bool(stone.is_parcel)
    count = int(stone.stone_count or 0)
    if is_p and count < 2:
        raise HTTPException(status_code=400, detail="Parcel rows require stone_count >= 2.")
    if is_p:
        fee = calculate_parcel_fee_from_brackets(
            stone.value, count, service_type,
            stone.color_stability_test, stone.mounted,
            db_brackets, cs_fee, mounted_fee,
        )
    else:
        fee = calculate_stone_fee_from_brackets(
            stone.value, service_type, stone.color_stability_test,
            db_brackets, cs_fee,
        )
        if stone.mounted:
            fee += mounted_fee

    sku = generate_sku(stone.stone_type, stone.weight, job["job_number"], next_position)

    new_stone = {
        "id": str(uuid.uuid4()),
        "sku": sku,
        "stone_type": stone.stone_type,
        "weight": stone.weight,
        "shape": stone.shape,
        "value": stone.value,
        "color_stability_test": stone.color_stability_test,
        "mounted": stone.mounted,
        "fee": fee,
        "position": next_position,
        "certificate_group": None,
        # Same defaults as `_build_stones_for_create`: a freshly-added
        # stone always lands at the office with no certificate yet —
        # regardless of the parent job's lifecycle stage. Admin moves it
        # forward via the normal pickup / cert-upload flows. Without
        # these defaults the StoneStatusBadges UI showed nothing for new
        # walk-in stones (Feb 26 2026 regression).
        "stone_status": "at_office",
        "cert_status": "pending",
    }
    if is_p:
        new_stone["kind"] = "parcel"
        new_stone["stone_count"] = count

    # Push the new row, then recompute the job totals from scratch to keep
    # physical-stone count and certificate count correctly in sync (a $inc
    # of 1 would wrongly increment total_stones for parcels).
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$push": {"stones": new_stone}, "$set": {"updated_at": datetime.utcnow()}},
    )
    refreshed = await db.jobs.find_one({"_id": ObjectId(job_id)})
    totals = recompute_job_totals(active_stones(refreshed), mounted_fee=mounted_fee)
    await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": totals})

    return {"message": "Stone added successfully", "stone": new_stone, **totals}


@router.delete("/jobs/{job_id}/stones/{stone_id}")
async def delete_stone_from_job(job_id: str, stone_id: str, user: dict = Depends(require_admin)):
    """Remove a stone from a job (by stone.id). Recalculates totals and
    keeps stones ordered by position (contiguous 1..N).
    """
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stones = job.get("stones", []) or []
    target = next((s for s in stones if s.get("id") == stone_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Stone not found on this job")

    remaining = [s for s in stones if s.get("id") != stone_id]
    # Reassign contiguous positions, preserving original order
    for idx, s in enumerate(sorted(remaining, key=lambda x: x.get("position", 0)), start=1):
        s["position"] = idx

    # Totals only count active (non-cancelled) stones; cancelled ones remain
    # on the job for audit but must never contribute to the job's totals.
    totals = recompute_job_totals(active_stones(remaining))

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$set": {
                "stones": remaining,
                **totals,
                "updated_at": datetime.utcnow(),
            }
        },
    )

    await log_activity(
        Action.STONE_CANCELLED,
        actor=user,
        job_id=job_id,
        stone_id=stone_id,
        branch_id=job.get("branch_id"),
        summary=f"Job #{job.get('job_number', '?')} \u00b7 stone {target.get('sku') or stone_id[-6:]} removed",
    )

    return {
        "message": "Stone removed",
        "stone_id": stone_id,
        **totals,
    }


@router.put("/jobs/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, job_update: JobUpdate, user: dict = Depends(require_admin)):
    """Update job details"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    update_data = {"updated_at": datetime.utcnow()}

    if job_update.notes is not None:
        update_data["notes"] = job_update.notes

    if job_update.status is not None:
        valid_statuses = ["draft", "stones_accepted", "sent_to_lab", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done", "cancelled"]
        if job_update.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        update_data["status"] = job_update.status

    if job_update.discount is not None:
        update_data["discount"] = job_update.discount

    # ---------------------------------------------------------------- service_type
    # Changing the service_type after creation requires re-pricing every
    # active stone from the bracket table that matches the NEW service
    # type. Cancelled stones keep their original fee (the audit/invoice
    # already reflects them). Recheck has an extra `recheck_reasons`
    # field — validate matching presence/absence with the new type.
    if job_update.service_type is not None and job_update.service_type != job.get("service_type"):
        new_st = job_update.service_type
        # Validate the new type is a configured service.
        pricing_doc = await db.pricing_config.find_one() or {}
        valid_types = pricing_doc.get("service_types") or ["Express", "Normal", "Recheck"]
        if new_st not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid service_type '{new_st}'. Must be one of {valid_types}.")

        if new_st == "Recheck":
            # Need at least one recheck reason to remain consistent with
            # the create-job validation.
            reasons = job_update.recheck_reasons or job.get("recheck_reasons") or []
            reasons = [r for r in reasons if r and r.strip()]
            if not reasons:
                raise HTTPException(
                    status_code=400,
                    detail="Switching to Recheck requires at least one recheck reason.",
                )
            update_data["recheck_reasons"] = reasons
        else:
            # Leaving Recheck → drop the now-meaningless reasons array.
            update_data["recheck_reasons"] = None

        # Recompute fees for every stone (cancelled OR active — keeping
        # cancelled stones priced consistently makes audit reports
        # easier; recompute_job_totals already excludes them from
        # `total_fee`).
        db_brackets = await get_pricing_brackets_from_db()
        cs_fee = await get_color_stability_fee_from_db()
        mounted_fee = await get_mounted_fee_from_db()

        updated_stones: list[dict] = []
        for s in (job.get("stones") or []):
            value = float(s.get("value") or 0)
            mounted_flag = bool(s.get("mounted"))
            cs_flag = bool(s.get("color_stability_test"))
            if s.get("kind") == "parcel":
                count = int(s.get("stone_count") or 0)
                new_fee = calculate_parcel_fee_from_brackets(
                    value, count, new_st, cs_flag, mounted_flag,
                    db_brackets, cs_fee, mounted_fee,
                ) if count >= 2 else float(s.get("fee") or 0)
            else:
                new_fee = calculate_stone_fee_from_brackets(
                    value, new_st, cs_flag, db_brackets, cs_fee,
                )
                if mounted_flag:
                    new_fee += mounted_fee
            s2 = {**s, "fee": new_fee}
            # Preserve any actual_fee override the admin set — we only
            # rebase the suggested `fee`, not the manual override.
            updated_stones.append(s2)

        update_data["service_type"] = new_st
        update_data["stones"] = updated_stones

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": update_data}
    )

    # If service_type changed we wrote a new stones array — recompute the
    # job totals from those new fees so total_fee / total_value stay
    # consistent without the caller needing a second round-trip.
    if "stones" in update_data:
        mounted_fee = await get_mounted_fee_from_db()
        refreshed = await db.jobs.find_one({"_id": ObjectId(job_id)})
        totals = recompute_job_totals(active_stones(refreshed), mounted_fee=mounted_fee)
        await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": totals})

    changed_fields = sorted(update_data.keys() - {"updated_at"})
    if changed_fields:
        await log_activity(
            Action.JOB_UPDATED,
            actor=user,
            job_id=job_id,
            branch_id=job.get("branch_id"),
            summary=f"Job #{job.get('job_number', '?')} \u00b7 {', '.join(changed_fields)}",
        )

    return await get_job(job_id, user)


@router.post("/jobs/{job_id}/verbal-findings", response_model=JobResponse)
async def add_verbal_finding(job_id: str, finding: VerbalFindingCreate, user: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stone_exists = any(s["id"] == finding.stone_id for s in job.get("stones", []))
    if not stone_exists:
        raise HTTPException(status_code=404, detail="Stone not found in job")

    verbal_finding = {
        "id": str(uuid.uuid4()),
        **finding.dict(),
        "created_at": datetime.utcnow()
    }

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$push": {"verbal_findings": verbal_finding},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    return await get_job(job_id, user)
