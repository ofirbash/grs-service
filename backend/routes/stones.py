from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime
from bson import ObjectId
import logging

from database import db
from auth import get_current_user, require_admin
from models import (
    VerbalFindingsUpdate, StoneFeeUpdate,
    GroupCertificateScanUpload, CertificateScanUpload
)
from pricing import (
    get_color_stability_fee_from_db, get_mounted_fee_from_db,
    get_pricing_brackets_from_db,
    calculate_stone_fee_from_brackets, calculate_parcel_fee_from_brackets,
)
from jobs_helpers import active_stones, recompute_job_totals
from activity_log import Action, log_activity
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class StoneDetailsUpdate(BaseModel):
    """Payload for `PUT /api/stones/{stone_id}` — every field is
    optional; the endpoint patches only what's present. When any of
    `stone_type` / `weight` / `shape` / `value` / `kind` / `stone_count`
    / `color_stability_test` / `mounted` changes, the fee is recomputed
    from the job's current `service_type` bracket table so the total
    stays consistent (users explicitly asked Feb 28 2026: "the fees
    should be changed based on the new details")."""
    stone_type: Optional[str] = None
    weight: Optional[float] = None
    shape: Optional[str] = None
    value: Optional[float] = None
    color_stability_test: Optional[bool] = None
    mounted: Optional[bool] = None
    kind: Optional[str] = None  # 'stone' | 'parcel'
    stone_count: Optional[int] = None

router = APIRouter()


@router.put("/stones/{stone_id}")
async def update_stone_details(stone_id: str, data: StoneDetailsUpdate, user: dict = Depends(require_admin)):
    """Edit an existing stone's details (type / weight / shape / value /
    parcel / CS / mounted). The fee is recomputed from the job's
    current service_type bracket table on every change, matching the
    behaviour of `add_stone_to_job`. Cancelled stones can't be edited.

    Certificate-group mounted propagation is handled the same way as
    `/stones/{id}/fees`: toggling `mounted` on a stone in a group
    updates every stone in that group (and applies the fee once per
    group)."""
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")
    stone = next((s for s in job.get("stones", []) if s.get("id") == stone_id), None)
    if not stone:
        raise HTTPException(status_code=404, detail="Stone not found")
    if stone.get("cancelled"):
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled stone")

    # Build the merged stone dict: start from current values, overlay
    # patch fields that were provided.
    def pick(field: str):
        v = getattr(data, field)
        return stone.get(field) if v is None else v

    new_type = pick("stone_type")
    new_weight = float(pick("weight") or 0)
    new_shape = pick("shape")
    new_value = float(pick("value") or 0)
    new_cs = bool(pick("color_stability_test"))
    new_mounted = bool(pick("mounted"))
    new_kind = pick("kind")
    new_count = int(pick("stone_count") or 0) if new_kind == "parcel" else 0

    # Recompute the fee for this stone from the job's service_type. We
    # DO NOT touch `actual_fee` overrides — if the admin set one, it
    # stays. Same policy as JobUpdate.service_type recompute.
    service_type = job.get("service_type") or "Normal"
    brackets = await get_pricing_brackets_from_db()
    cs_fee = await get_color_stability_fee_from_db()
    mounted_fee = await get_mounted_fee_from_db()

    if new_kind == "parcel" and new_count >= 2:
        new_fee = calculate_parcel_fee_from_brackets(
            new_value, new_count, service_type, new_cs, new_mounted,
            brackets, cs_fee, mounted_fee,
        )
    else:
        new_fee = calculate_stone_fee_from_brackets(
            new_value, service_type, new_cs, brackets, cs_fee,
        )
        if new_mounted:
            # Mounted fee follows the same certificate-group dedup rule
            # as `/fees`: only bill once per group. If this stone is in
            # a group where another stone already carries the mounted
            # flag AND fee, skip the extra charge here.
            grp = stone.get("certificate_group")
            other_mounted = grp is not None and any(
                s.get("id") != stone_id and s.get("certificate_group") == grp and s.get("mounted")
                for s in job.get("stones", [])
            )
            if not other_mounted:
                new_fee += mounted_fee

    # Compose the update. Use dot-notation on stones.$ to patch just
    # this row (Mongo positional operator matches on stones.id in the
    # base query).
    set_ops = {
        "stones.$.stone_type": new_type,
        "stones.$.weight": new_weight,
        "stones.$.shape": new_shape,
        "stones.$.value": new_value,
        "stones.$.color_stability_test": new_cs,
        "stones.$.mounted": new_mounted,
        "stones.$.fee": new_fee,
        "updated_at": datetime.utcnow(),
    }
    if new_kind:
        set_ops["stones.$.kind"] = new_kind
        set_ops["stones.$.stone_count"] = new_count if new_kind == "parcel" else 0

    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": set_ops},
    )

    # Recompute job totals from the fresh stones array.
    refreshed = await db.jobs.find_one({"_id": job["_id"]})
    totals = recompute_job_totals(active_stones(refreshed), mounted_fee=mounted_fee)
    await db.jobs.update_one({"_id": job["_id"]}, {"$set": totals})

    try:
        await log_activity(
            Action.STONE_UPDATED,
            actor=user,
            job_id=str(job["_id"]),
            stone_id=stone_id,
            branch_id=job.get("branch_id"),
            summary=f"Stone {stone.get('sku', stone_id[-6:])} details updated (fee: ${new_fee:.2f})",
            metadata={"new_fee": new_fee},
        )
    except Exception:  # noqa: BLE001
        logger.exception("activity log for stone update failed")

    final = await db.jobs.find_one({"_id": job["_id"]})
    updated_stone = next((s for s in final.get("stones", []) if s.get("id") == stone_id), None)
    return {"stone": updated_stone, "new_fee": new_fee, "job_total_fee": final.get("total_fee")}


@router.get("/stones")
async def get_all_stones(
    branch_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Get all stones across all jobs with job info.

    Stones belonging to a cancelled job are still hidden from the active list
    (the job itself is the cancelled record; we don't show its constituent
    stones in the "stones" view). Individually-deleted stones are pulled from
    the DB by `DELETE /stones/{id}` so they don't appear here at all.
    """
    query = {}

    if user["role"] == "customer":
        user_client_id = user.get("client_id")
        if user_client_id:
            query["client_id"] = user_client_id
        else:
            return []
    elif user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")
    elif branch_id and user["role"] == "super_admin":
        query["branch_id"] = branch_id

    jobs = await db.jobs.find(query).to_list(1000)
    all_stones = []

    for job in jobs:
        job_id = str(job["_id"])
        job_number = job.get("job_number", 0)
        # Skip cancelled jobs entirely — their stones never show up in the
        # stones list. The job's own row still surfaces under /api/jobs with
        # its cancelled status badge.
        if job.get("status") == "cancelled":
            continue
        for stone in job.get("stones", []):
            # Legacy soft-cancelled stones from the pre-hard-delete era still
            # carry `cancelled: true` in the DB; ignore them here so they
            # appear deleted as the user expects.
            if stone.get("cancelled"):
                continue
            stone_data = {
                **stone,
                "job_id": job_id,
                "job_number": job_number,
                "client_name": job.get("client_name", ""),
                "branch_name": job.get("branch_name", ""),
            }
            all_stones.append(stone_data)

    all_stones.sort(key=lambda x: (-x.get("job_number", 0), x.get("position", 0)))
    return all_stones


@router.get("/stones/{stone_id}")
async def get_stone(stone_id: str, user: dict = Depends(require_admin)):
    """Get a specific stone by ID"""
    jobs = await db.jobs.find({"stones.id": stone_id}).to_list(1)
    if not jobs:
        raise HTTPException(status_code=404, detail="Stone not found")

    job = jobs[0]
    stone = next((s for s in job.get("stones", []) if s["id"] == stone_id), None)
    if not stone:
        raise HTTPException(status_code=404, detail="Stone not found")

    return {
        **stone,
        "job_id": str(job["_id"]),
        "job_number": job.get("job_number", 0),
        "client_name": job.get("client_name", ""),
        "branch_name": job.get("branch_name", ""),
    }


@router.put("/stones/{stone_id}/verbal")
async def update_stone_verbal(stone_id: str, data: VerbalFindingsUpdate, user: dict = Depends(require_admin)):
    """Update verbal findings for a stone"""
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")

    update_data = {"updated_at": datetime.utcnow()}

    if data.structured_findings:
        update_data["stones.$.verbal_findings"] = data.structured_findings.dict()
    elif data.verbal_findings is not None:
        update_data["stones.$.verbal_findings"] = data.verbal_findings

    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": update_data}
    )

    # Auto-bump job status to `verbal_uploaded` as soon as the first
    # stone in the job gets a verbal recorded. Per-stone verbals trickle
    # in throughout examination — the admin shouldn't have to flip the
    # job status by hand. We only bump from earlier statuses (draft,
    # stones_accepted, sent_to_lab); a job that already moved past
    # verbal_uploaded (e.g. stones_returned, cert_uploaded) must NOT
    # regress here. Soft-fail by design — verbal save succeeded already.
    JOB_STATUSES_BEFORE_VERBAL = {"draft", "stones_accepted", "sent_to_lab"}
    if job.get("status") in JOB_STATUSES_BEFORE_VERBAL:
        try:
            now = datetime.utcnow()
            await db.jobs.update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "verbal_uploaded", "updated_at": now}},
            )
            await log_activity(
                Action.JOB_STATUS_CHANGED,
                actor=user,
                job_id=str(job["_id"]),
                branch_id=job.get("branch_id"),
                summary=f"Job #{job.get('job_number', '?')} \u00b7 {job.get('status')} \u2192 verbal_uploaded (auto)",
                metadata={"from": job.get("status"), "to": "verbal_uploaded", "auto": True},
            )
        except Exception:  # noqa: BLE001
            logger.exception("Auto-bump to verbal_uploaded failed for job %s", job["_id"])

    await log_activity(
        Action.STONE_VERBAL_ENTERED,
        actor=user,
        job_id=str(job["_id"]),
        stone_id=stone_id,
        branch_id=job.get("branch_id"),
        summary=f"Job #{job.get('job_number', '?')} \u00b7 Stone {stone_id[-6:]}",
    )

    return {"message": "Verbal findings updated successfully"}


@router.put("/stones/{stone_id}/fees")
async def update_stone_fees(stone_id: str, data: StoneFeeUpdate, user: dict = Depends(require_admin)):
    """Update actual fee, color stability test, and/or mounted status for a stone (or parcel).

    Parcels behave differently for CS: the charge is `cs_fee * stone_count`
    (per-parcel toggle applied N times). Mounted on a parcel is a single
    charge (`mounted_fee`), same as a non-grouped single stone. Parcels are
    never in a certificate_group, so the group-mounted-dedup logic is skipped.
    """
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")

    stone = next((s for s in job.get('stones', []) if s.get('id') == stone_id), None)
    if not stone:
        raise HTTPException(status_code=404, detail="Stone not found")

    cs_fee = await get_color_stability_fee_from_db()
    mounted_fee = await get_mounted_fee_from_db()
    stone_is_parcel = stone.get("kind") == "parcel"
    parcel_count = max(1, int(stone.get("stone_count") or 1)) if stone_is_parcel else 1

    update_data = {"updated_at": datetime.utcnow()}

    # Handle color stability test toggle. Parcels are charged `cs_fee * N`.
    if data.color_stability_test is not None:
        update_data["stones.$.color_stability_test"] = data.color_stability_test
        current_cst = stone.get('color_stability_test', False)
        cs_delta = cs_fee * parcel_count
        if data.color_stability_test and not current_cst:
            update_data["stones.$.fee"] = stone.get('fee', 0) + cs_delta
        elif not data.color_stability_test and current_cst:
            update_data["stones.$.fee"] = max(0, stone.get('fee', 0) - cs_delta)

    # Handle mounted toggle. Parcels: single charge, no group propagation.
    if data.mounted is not None:
        current_mounted = stone.get('mounted', False)
        cert_group = stone.get('certificate_group')

        if data.mounted != current_mounted:
            if stone_is_parcel or cert_group is None:
                # No group propagation: apply once to this row only.
                base_fee = update_data.get("stones.$.fee", stone.get('fee', 0))
                if data.mounted:
                    update_data["stones.$.fee"] = base_fee + mounted_fee
                else:
                    update_data["stones.$.fee"] = max(0, base_fee - mounted_fee)
                update_data["stones.$.mounted"] = data.mounted
            else:
                group_stones = [s for s in job.get('stones', []) if s.get('certificate_group') == cert_group]

                # Check if the group already had the mounted fee applied
                group_already_mounted = any(s.get('mounted', False) for s in group_stones)

                # Update mounted flag AND fee on ALL stones in the group
                for s in group_stones:
                    stone_update = {"stones.$.mounted": data.mounted}
                    if data.mounted and not group_already_mounted:
                        stone_update["stones.$.fee"] = s.get('fee', 0) + mounted_fee
                    elif not data.mounted and group_already_mounted:
                        stone_update["stones.$.fee"] = max(0, s.get('fee', 0) - mounted_fee)
                    await db.jobs.update_one(
                        {"_id": job["_id"], "stones.id": s["id"]},
                        {"$set": stone_update}
                    )

    # Handle actual fee
    if data.actual_fee is not None:
        update_data["stones.$.actual_fee"] = data.actual_fee

    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": update_data}
    )

    # Recalculate job totals from the active (non-cancelled) stones only.
    # Cancelled stones must never contribute to fees/value/count. Mounted
    # fee is counted once per certificate group via the shared helper.
    updated_job_for_calc = await db.jobs.find_one({"_id": job["_id"]})
    active = active_stones(updated_job_for_calc)
    totals = recompute_job_totals(active, mounted_fee=mounted_fee)

    await db.jobs.update_one(
        {"_id": job["_id"]},
        {"$set": totals}
    )

    # Return the updated job total for the frontend
    updated_job = await db.jobs.find_one({"_id": job["_id"]})
    updated_stone = next((s for s in updated_job.get('stones', []) if s.get('id') == stone_id), None)

    await log_activity(
        Action.STONE_FEES_UPDATED,
        actor=user,
        job_id=str(job["_id"]),
        stone_id=stone_id,
        branch_id=job.get("branch_id"),
        summary=f"Job #{job.get('job_number', '?')} \u00b7 fees updated",
    )

    return {
        "message": "Stone fees updated successfully",
        "stone": updated_stone,
        "total_fee": updated_job.get("total_fee", 0)
    }


@router.put("/stones/group/certificate-scan")
async def upload_group_certificate_scan(data: GroupCertificateScanUpload, user: dict = Depends(require_admin)):
    """Upload certificate scan for all stones in a certificate group"""
    job = await db.jobs.find_one({"_id": ObjectId(data.job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stones_in_group = [s for s in job.get("stones", []) if s.get("certificate_group") == data.certificate_group]
    if not stones_in_group:
        raise HTTPException(status_code=404, detail="No stones found in this certificate group")

    for stone in stones_in_group:
        await db.jobs.update_one(
            {"_id": job["_id"], "stones.id": stone["id"]},
            {"$set": {"stones.$.certificate_scan_url": data.file_data}}
        )

    await db.jobs.update_one(
        {"_id": job["_id"]},
        {"$set": {"updated_at": datetime.utcnow()}}
    )

    await log_activity(
        Action.STONE_CERT_UPLOADED,
        actor=user,
        job_id=str(job["_id"]),
        branch_id=job.get("branch_id"),
        summary=f"Job #{job.get('job_number', '?')} \u00b7 group {data.certificate_group} ({len(stones_in_group)} stones)",
        metadata={"certificate_group": data.certificate_group, "stone_count": len(stones_in_group)},
    )

    return {"message": f"Certificate scan uploaded for {len(stones_in_group)} stones in group {data.certificate_group}"}


@router.put("/stones/{stone_id}/certificate-scan")
async def upload_stone_certificate_scan(stone_id: str, data: CertificateScanUpload, user: dict = Depends(require_admin)):
    """Upload certificate scan for a single stone"""
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")

    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": {"stones.$.certificate_scan_url": data.file_data, "updated_at": datetime.utcnow()}}
    )

    await log_activity(
        Action.STONE_CERT_UPLOADED,
        actor=user,
        job_id=str(job["_id"]),
        stone_id=stone_id,
        branch_id=job.get("branch_id"),
        summary=f"Job #{job.get('job_number', '?')} \u00b7 single-stone cert",
    )

    return {"message": "Certificate scan uploaded successfully", "filename": data.filename}



@router.patch("/stones/{stone_id}/cancel")
@router.delete("/stones/{stone_id}")
async def delete_stone(stone_id: str, user: dict = Depends(require_admin)):
    """Hard-delete a stone from its parent job.

    Earlier we kept cancelled stones on the job as a soft-deletion audit
    trail, but the UX wart of "X cancelled hidden" appearing on every job
    + the steady stream of bugs where cancelled stones leaked into totals
    convinced us to switch to plain hard-deletion. The PATCH /cancel route
    is kept as an alias so existing frontend calls (and integrations) keep
    working transparently.

    Job totals (`total_stones / total_value / total_fee`) are recomputed
    from the surviving stones.
    """
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")

    new_stones = [s for s in job.get("stones", []) if s.get("id") != stone_id]
    # Reassign contiguous positions over the surviving stones so the order
    # number on receipts / memos stays sensible after a delete.
    for idx, s in enumerate(sorted(new_stones, key=lambda x: x.get("position", 0)), start=1):
        s["position"] = idx
    totals = recompute_job_totals(new_stones)

    await db.jobs.update_one(
        {"_id": job["_id"]},
        {"$set": {
            "stones": new_stones,
            **totals,
            "updated_at": datetime.utcnow(),
        }},
    )

    target = next((s for s in job.get("stones", []) if s.get("id") == stone_id), None)
    await log_activity(
        Action.STONE_CANCELLED,
        actor=user,
        job_id=str(job["_id"]),
        stone_id=stone_id,
        branch_id=job.get("branch_id"),
        summary=f"Job #{job.get('job_number', '?')} \u00b7 stone {(target or {}).get('sku') or stone_id[-6:]} removed",
    )

    return {"message": "Stone deleted", "totals": totals}
