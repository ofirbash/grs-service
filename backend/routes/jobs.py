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
from pricing import get_pricing_brackets_from_db, get_color_stability_fee_from_db, calculate_stone_fee_from_brackets
from utils import generate_sku

FRONTEND_URL = os.getenv("FRONTEND_URL", "")

router = APIRouter()


async def build_job_response(job: dict) -> JobResponse:
    """Build a JobResponse from a job document, enriching with client/branch/shipment data"""
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})

    shipment_info = None
    shipment_ids = job.get("shipment_ids", [])
    if not shipment_ids and job.get("shipment_id"):
        shipment_ids = [job.get("shipment_id")]

    if shipment_ids:
        latest_shipment_id = shipment_ids[-1]
        try:
            shipment = await db.shipments.find_one({"_id": ObjectId(latest_shipment_id)})
            if shipment:
                shipment_info = {
                    "id": str(shipment["_id"]),
                    "shipment_number": shipment["shipment_number"],
                    "shipment_type": shipment["shipment_type"],
                    "courier": shipment["courier"],
                    "tracking_number": shipment.get("tracking_number"),
                    "source_address": shipment["source_address"],
                    "destination_address": shipment["destination_address"],
                    "status": shipment["status"],
                    "date_sent": shipment.get("date_sent").isoformat() if shipment.get("date_sent") else None
                }
        except:
            pass

    return JobResponse(
        id=str(job["_id"]),
        job_number=job["job_number"],
        client_id=job["client_id"],
        client_name=client.get("name") if client else None,
        branch_id=job["branch_id"],
        branch_name=branch.get("name") if branch else None,
        service_type=job["service_type"],
        status=job["status"],
        notes=job.get("notes"),
        stones=[StoneResponse(**s) for s in job.get("stones", [])],
        verbal_findings=[VerbalFindingResponse(**vf) for vf in job.get("verbal_findings", [])],
        notification_log=[NotificationLog(**nl) for nl in job.get("notification_log", [])],
        total_stones=job["total_stones"],
        total_value=job["total_value"],
        total_fee=job["total_fee"],
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
        payment_url=f"{FRONTEND_URL}/pay?token={job['payment_token']}" if job.get("payment_token") and FRONTEND_URL else None,
        created_at=job["created_at"],
        updated_at=job["updated_at"]
    )


@router.post("/jobs", response_model=JobResponse)
async def create_job(job: JobCreate, user: dict = Depends(require_admin)):
    client = await db.clients.find_one({"_id": ObjectId(job.client_id)})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    last_job = await db.jobs.find_one(sort=[("job_number", -1)])
    job_number = (last_job.get("job_number", 0) if last_job else 0) + 1

    stones = []
    position = 1
    total_value = 0
    total_fee = 0

    db_brackets = await get_pricing_brackets_from_db()
    cs_fee = await get_color_stability_fee_from_db()

    for cert_unit in job.certificate_units:
        for stone_data in cert_unit.stones:
            sku = generate_sku(stone_data.stone_type, stone_data.weight, job_number, position)
            fee = calculate_stone_fee_from_brackets(stone_data.value, job.service_type, stone_data.color_stability_test, db_brackets, cs_fee)

            stone = {
                "id": str(uuid.uuid4()),
                "sku": sku,
                "stone_type": stone_data.stone_type,
                "weight": stone_data.weight,
                "shape": stone_data.shape,
                "value": stone_data.value,
                "color_stability_test": stone_data.color_stability_test,
                "fee": fee,
                "position": position,
                "certificate_scan": None
            }
            stones.append(stone)
            total_value += stone_data.value
            total_fee += fee
            position += 1

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
        "total_stones": len(stones),
        "total_value": total_value,
        "total_fee": total_fee,
        "created_by": str(user["_id"]),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.jobs.insert_one(job_doc)
    branch = await db.branches.find_one({"_id": ObjectId(job.branch_id)})

    return JobResponse(
        id=str(result.inserted_id),
        job_number=job_number,
        client_id=job.client_id,
        client_name=client.get("name"),
        branch_id=job.branch_id,
        branch_name=branch.get("name") if branch else None,
        service_type=job.service_type,
        status="draft",
        notes=job.notes,
        stones=[StoneResponse(**s) for s in stones],
        verbal_findings=[],
        notification_log=[],
        total_stones=len(stones),
        total_value=total_value,
        total_fee=total_fee,
        created_at=job_doc["created_at"],
        updated_at=job_doc["updated_at"]
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
    valid_statuses = ["draft", "stones_accepted", "sent_to_lab", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    result = await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": status_update.status, "updated_at": datetime.utcnow()}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")

    return await get_job(job_id, user)


@router.put("/jobs/{job_id}/group-stones")
async def group_stones_for_certificate(job_id: str, group_update: StoneGroupUpdate, user: dict = Depends(require_admin)):
    """Group stones together for a single certificate (max 30 per group)"""
    if len(group_update.stone_ids) > 30:
        raise HTTPException(status_code=400, detail="Maximum 30 stones per certificate group")

    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stones = job.get("stones", [])
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
    """Add a new stone to an existing job"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing_stones = job.get("stones", [])
    next_position = len(existing_stones) + 1

    db_brackets = await get_pricing_brackets_from_db()
    cs_fee = await get_color_stability_fee_from_db()
    fee = calculate_stone_fee_from_brackets(stone.value, job.get("service_type", "Normal"), stone.color_stability_test, db_brackets, cs_fee)

    sku = generate_sku(stone.stone_type, stone.weight, job["job_number"], next_position)

    new_stone = {
        "id": str(uuid.uuid4()),
        "sku": sku,
        "stone_type": stone.stone_type,
        "weight": stone.weight,
        "shape": stone.shape,
        "value": stone.value,
        "color_stability_test": stone.color_stability_test,
        "fee": fee,
        "position": next_position,
        "certificate_group": None
    }

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$push": {"stones": new_stone},
            "$inc": {
                "total_stones": 1,
                "total_value": stone.value,
                "total_fee": fee
            },
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    return {"message": "Stone added successfully", "stone": new_stone}


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
        valid_statuses = ["draft", "stones_accepted", "sent_to_lab", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done"]
        if job_update.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        update_data["status"] = job_update.status

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": update_data}
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
