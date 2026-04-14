from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime
from bson import ObjectId

from database import db
from auth import get_current_user, require_admin
from models import (
    VerbalFindingsUpdate, StoneFeeUpdate,
    GroupCertificateScanUpload, CertificateScanUpload
)
from pricing import get_color_stability_fee_from_db, get_mounted_fee_from_db

router = APIRouter()


@router.get("/stones")
async def get_all_stones(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get all stones across all jobs with job info"""
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
        for stone in job.get("stones", []):
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

    return {"message": "Verbal findings updated successfully"}


@router.put("/stones/{stone_id}/fees")
async def update_stone_fees(stone_id: str, data: StoneFeeUpdate, user: dict = Depends(require_admin)):
    """Update actual fee, color stability test, and/or mounted status for a stone"""
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")

    stone = next((s for s in job.get('stones', []) if s.get('id') == stone_id), None)
    if not stone:
        raise HTTPException(status_code=404, detail="Stone not found")

    cs_fee = await get_color_stability_fee_from_db()
    mounted_fee = await get_mounted_fee_from_db()

    update_data = {"updated_at": datetime.utcnow()}
    fee_adjustment = 0

    # Handle color stability test toggle
    if data.color_stability_test is not None:
        update_data["stones.$.color_stability_test"] = data.color_stability_test
        current_cst = stone.get('color_stability_test', False)
        if data.color_stability_test and not current_cst:
            fee_adjustment += cs_fee
            new_fee = stone.get('fee', 0) + cs_fee
            update_data["stones.$.fee"] = new_fee
        elif not data.color_stability_test and current_cst:
            fee_adjustment -= cs_fee
            new_fee = max(0, stone.get('fee', 0) - cs_fee)
            update_data["stones.$.fee"] = new_fee

    # Handle mounted toggle
    if data.mounted is not None:
        update_data["stones.$.mounted"] = data.mounted
        current_mounted = stone.get('mounted', False)

        if data.mounted and not current_mounted:
            # Check if mounted fee already applies via another stone in same cert group
            cert_group = stone.get('certificate_group')
            should_add_fee = True

            if cert_group is not None:
                # Check if any OTHER stone in this group is already mounted
                for s in job.get('stones', []):
                    if s.get('id') != stone_id and s.get('certificate_group') == cert_group and s.get('mounted'):
                        should_add_fee = False
                        break

            if should_add_fee:
                fee_adjustment += mounted_fee
                current_fee = update_data.get("stones.$.fee", stone.get('fee', 0))
                update_data["stones.$.fee"] = current_fee + mounted_fee

        elif not data.mounted and current_mounted:
            # Check if any OTHER stone in same cert group is still mounted
            cert_group = stone.get('certificate_group')
            should_remove_fee = True

            if cert_group is not None:
                for s in job.get('stones', []):
                    if s.get('id') != stone_id and s.get('certificate_group') == cert_group and s.get('mounted'):
                        should_remove_fee = False
                        break

            if should_remove_fee:
                fee_adjustment -= mounted_fee
                current_fee = update_data.get("stones.$.fee", stone.get('fee', 0))
                update_data["stones.$.fee"] = max(0, current_fee - mounted_fee)

    # Handle actual fee
    if data.actual_fee is not None:
        update_data["stones.$.actual_fee"] = data.actual_fee

    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": update_data}
    )

    # Update job total_fee
    if fee_adjustment != 0:
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$inc": {"total_fee": fee_adjustment}}
        )

    # Return the updated job total for the frontend
    updated_job = await db.jobs.find_one({"_id": job["_id"]})
    updated_stone = next((s for s in updated_job.get('stones', []) if s.get('id') == stone_id), None)

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

    return {"message": "Certificate scan uploaded successfully", "filename": data.filename}
