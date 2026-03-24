from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

from database import db
from auth import get_current_user, require_admin
from models import (
    ShipmentCreate, ShipmentUpdate, ShipmentJobsUpdate, ShipmentResponse
)

SHIPMENT_TYPES = ["send_stones_to_lab", "stones_from_lab", "certificates_from_lab"]
SHIPMENT_STATUSES = ["pending", "in_transit", "delivered", "cancelled"]
JOB_STATUSES = ["draft", "stones_accepted", "sent_to_lab", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done"]
COURIERS = ["UPS", "FedEx", "DHL", "TNT", "Aramex", "Local Courier", "Hand Carry", "Other"]

router = APIRouter()


async def build_shipment_response(shipment: dict) -> ShipmentResponse:
    """Build ShipmentResponse from a shipment document"""
    creator = await db.users.find_one({"_id": ObjectId(shipment["created_by"])})
    creator_name = creator["full_name"] if creator else "Unknown"

    jobs_data = []
    for job_id in shipment.get("job_ids", []):
        try:
            job = await db.jobs.find_one({"_id": ObjectId(job_id)})
            if job:
                client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
                jobs_data.append({
                    "id": str(job["_id"]),
                    "job_number": job["job_number"],
                    "client_name": client.get("name") if client else "N/A",
                    "status": job["status"],
                    "total_stones": job["total_stones"],
                    "total_value": job["total_value"]
                })
        except:
            pass

    return ShipmentResponse(
        id=str(shipment["_id"]),
        shipment_number=shipment["shipment_number"],
        shipment_type=shipment["shipment_type"],
        courier=shipment["courier"],
        source_address=shipment["source_address"],
        destination_address=shipment["destination_address"],
        tracking_number=shipment.get("tracking_number"),
        date_sent=shipment.get("date_sent"),
        status=shipment["status"],
        job_ids=shipment.get("job_ids", []),
        jobs=jobs_data,
        total_jobs=shipment.get("total_jobs", 0),
        total_stones=shipment.get("total_stones", 0),
        total_value=shipment.get("total_value", 0),
        notes=shipment.get("notes"),
        created_by=creator_name,
        created_at=shipment["created_at"],
        updated_at=shipment["updated_at"]
    )


@router.post("/shipments", response_model=ShipmentResponse)
async def create_shipment(shipment: ShipmentCreate, user: dict = Depends(require_admin)):
    last_shipment = await db.shipments.find_one(sort=[("shipment_number", -1)])
    shipment_number = (last_shipment.get("shipment_number", 0) if last_shipment else 0) + 1

    total_stones = 0
    total_value = 0.0
    valid_job_ids = []

    for job_id in shipment.job_ids:
        try:
            job = await db.jobs.find_one({"_id": ObjectId(job_id)})
            if job:
                valid_job_ids.append(job_id)
                total_stones += job.get("total_stones", 0)
                total_value += job.get("total_value", 0)
        except:
            pass

    shipment_doc = {
        "shipment_number": shipment_number,
        "shipment_type": shipment.shipment_type,
        "courier": shipment.courier,
        "source_address": shipment.source_address,
        "destination_address": shipment.destination_address,
        "tracking_number": shipment.tracking_number,
        "date_sent": shipment.date_sent or datetime.utcnow(),
        "status": "pending",
        "job_ids": valid_job_ids,
        "total_jobs": len(valid_job_ids),
        "total_stones": total_stones,
        "total_value": total_value,
        "notes": shipment.notes,
        "created_by": str(user["_id"]),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.shipments.insert_one(shipment_doc)
    shipment_id = str(result.inserted_id)

    if valid_job_ids:
        for job_id in valid_job_ids:
            await db.jobs.update_one(
                {"_id": ObjectId(job_id)},
                {
                    "$push": {"shipment_ids": shipment_id},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )

    return ShipmentResponse(
        id=shipment_id,
        shipment_number=shipment_number,
        shipment_type=shipment.shipment_type,
        courier=shipment.courier,
        source_address=shipment.source_address,
        destination_address=shipment.destination_address,
        tracking_number=shipment.tracking_number,
        date_sent=shipment_doc["date_sent"],
        status="pending",
        job_ids=valid_job_ids,
        total_jobs=len(valid_job_ids),
        total_stones=total_stones,
        total_value=total_value,
        notes=shipment.notes,
        created_by=user["full_name"],
        created_at=shipment_doc["created_at"],
        updated_at=shipment_doc["updated_at"]
    )


@router.get("/shipments", response_model=List[ShipmentResponse])
async def get_shipments(
    status: Optional[str] = None,
    courier: Optional[str] = None,
    branch_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    if user["role"] == "customer":
        return []

    query = {}
    if status:
        query["status"] = status
    if courier:
        query["courier"] = courier

    filter_branch = None
    if user["role"] == "branch_admin":
        filter_branch = user.get("branch_id")
    elif branch_id and user["role"] == "super_admin":
        filter_branch = branch_id

    if filter_branch:
        branch_jobs = await db.jobs.find({"branch_id": filter_branch}, {"_id": 1}).to_list(10000)
        branch_job_ids = [str(j["_id"]) for j in branch_jobs]
        query["job_ids"] = {"$elemMatch": {"$in": branch_job_ids}}

    shipments = await db.shipments.find(query).sort("created_at", -1).to_list(1000)

    response = []
    for shipment in shipments:
        response.append(await build_shipment_response(shipment))

    return response


@router.get("/shipments/config/options")
async def get_shipment_options(user: dict = Depends(get_current_user)):
    """Get available options for shipment creation (types, couriers, addresses)"""
    branches = await db.branches.find({"is_active": True}).to_list(100)
    addresses = await db.addresses.find().to_list(1000)

    address_options = [b["name"] for b in branches]
    address_options.extend([a["name"] for a in addresses])

    return {
        "shipment_types": SHIPMENT_TYPES,
        "couriers": COURIERS,
        "statuses": SHIPMENT_STATUSES,
        "job_statuses": JOB_STATUSES,
        "address_options": sorted(list(set(address_options)))
    }


@router.get("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def get_shipment(shipment_id: str, user: dict = Depends(get_current_user)):
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return await build_shipment_response(shipment)


@router.put("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def update_shipment(shipment_id: str, update: ShipmentUpdate, user: dict = Depends(require_admin)):
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()

    if "status" in update_data and update_data["status"] not in SHIPMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {SHIPMENT_STATUSES}")

    await db.shipments.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": update_data}
    )

    return await get_shipment(shipment_id, user)


@router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(
    shipment_id: str,
    status: str = Body(..., embed=True),
    cascade_to_jobs: bool = Body(True, embed=True),
    user: dict = Depends(require_admin)
):
    """Update shipment status with optional cascade to all contained jobs"""
    if status not in SHIPMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {SHIPMENT_STATUSES}")

    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    await db.shipments.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": {"status": status, "updated_at": datetime.utcnow()}}
    )

    jobs_updated = 0
    if cascade_to_jobs and shipment.get("job_ids"):
        shipment_type = shipment.get("shipment_type", "")

        if shipment_type == "send_stones_to_lab":
            status_mapping = {
                "pending": "stones_accepted",
                "in_transit": "sent_to_lab",
                "delivered": "sent_to_lab",
                "cancelled": "stones_accepted"
            }
        elif shipment_type == "stones_from_lab":
            status_mapping = {
                "pending": "verbal_uploaded",
                "in_transit": "stones_returned",
                "delivered": "stones_returned",
                "cancelled": "verbal_uploaded"
            }
        elif shipment_type == "certificates_from_lab":
            status_mapping = {
                "pending": "cert_uploaded",
                "in_transit": "cert_returned",
                "delivered": "cert_returned",
                "cancelled": "cert_uploaded"
            }
        else:
            status_mapping = {
                "pending": "stones_accepted",
                "in_transit": "sent_to_lab",
                "delivered": "sent_to_lab",
                "cancelled": "stones_accepted"
            }

        job_status = status_mapping.get(status, "stones_accepted")

        for job_id in shipment["job_ids"]:
            try:
                result = await db.jobs.update_one(
                    {"_id": ObjectId(job_id)},
                    {"$set": {"status": job_status, "updated_at": datetime.utcnow()}}
                )
                if result.modified_count > 0:
                    jobs_updated += 1
            except:
                pass

    return {
        "message": f"Shipment status updated to '{status}'",
        "jobs_updated": jobs_updated if cascade_to_jobs else 0
    }


@router.put("/shipments/{shipment_id}/jobs", response_model=ShipmentResponse)
async def update_shipment_jobs(
    shipment_id: str,
    jobs_update: ShipmentJobsUpdate,
    user: dict = Depends(require_admin)
):
    """Add or replace jobs in a shipment"""
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    old_job_ids = set(shipment.get("job_ids", []))
    new_job_ids = set(jobs_update.job_ids)

    jobs_to_add = new_job_ids - old_job_ids
    jobs_to_remove = old_job_ids - new_job_ids

    for job_id in jobs_to_remove:
        try:
            await db.jobs.update_one(
                {"_id": ObjectId(job_id)},
                {
                    "$pull": {"shipment_ids": shipment_id},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
        except:
            pass

    total_stones = 0
    total_value = 0.0
    valid_job_ids = []

    for job_id in jobs_update.job_ids:
        try:
            job = await db.jobs.find_one({"_id": ObjectId(job_id)})
            if job:
                valid_job_ids.append(job_id)
                total_stones += job.get("total_stones", 0)
                total_value += job.get("total_value", 0)
                if job_id in jobs_to_add:
                    await db.jobs.update_one(
                        {"_id": ObjectId(job_id)},
                        {
                            "$addToSet": {"shipment_ids": shipment_id},
                            "$set": {"updated_at": datetime.utcnow()}
                        }
                    )
        except:
            pass

    await db.shipments.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": {
            "job_ids": valid_job_ids,
            "total_jobs": len(valid_job_ids),
            "total_stones": total_stones,
            "total_value": total_value,
            "updated_at": datetime.utcnow()
        }}
    )

    return await get_shipment(shipment_id, user)


@router.delete("/shipments/{shipment_id}")
async def delete_shipment(shipment_id: str, user: dict = Depends(require_admin)):
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    for job_id in shipment.get("job_ids", []):
        try:
            await db.jobs.update_one(
                {"_id": ObjectId(job_id)},
                {"$unset": {"shipment_id": ""}, "$set": {"updated_at": datetime.utcnow()}}
            )
        except:
            pass

    await db.shipments.delete_one({"_id": ObjectId(shipment_id)})

    return {"message": "Shipment deleted successfully"}
