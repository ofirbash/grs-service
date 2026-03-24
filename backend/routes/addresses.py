from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from bson import ObjectId

from database import db
from auth import get_current_user, require_admin
from models import AddressCreate, AddressUpdate

router = APIRouter()


@router.get("/addresses")
async def get_addresses(user: dict = Depends(get_current_user)):
    """Get all addresses"""
    addresses = await db.addresses.find().sort("name", 1).to_list(1000)
    return [{"id": str(a["_id"]), "name": a["name"], "address": a.get("address", ""), "email": a.get("email", ""), "phone": a.get("phone", "")} for a in addresses]


@router.post("/addresses")
async def create_address(data: AddressCreate, user: dict = Depends(require_admin)):
    """Create a new address"""
    existing = await db.addresses.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="Address with this name already exists")
    doc = {"name": data.name, "address": data.address, "email": data.email, "phone": data.phone, "created_at": datetime.utcnow()}
    result = await db.addresses.insert_one(doc)
    return {"id": str(result.inserted_id), "name": data.name, "address": data.address, "email": data.email, "phone": data.phone}


@router.put("/addresses/{address_id}")
async def update_address(address_id: str, data: AddressUpdate, user: dict = Depends(require_admin)):
    """Update an address"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    result = await db.addresses.update_one(
        {"_id": ObjectId(address_id)},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    updated = await db.addresses.find_one({"_id": ObjectId(address_id)})
    return {"id": address_id, "name": updated["name"], "address": updated.get("address", ""), "email": updated.get("email", ""), "phone": updated.get("phone", "")}


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: dict = Depends(require_admin)):
    """Delete an address"""
    result = await db.addresses.delete_one({"_id": ObjectId(address_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"message": "Address deleted"}
