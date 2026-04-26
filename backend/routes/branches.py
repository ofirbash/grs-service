from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
from bson import ObjectId

from database import db
from auth import get_current_user, require_super_admin
from models import BranchCreate, BranchResponse

router = APIRouter()


@router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, user: dict = Depends(require_super_admin)):
    branch_doc = {
        **branch.dict(),
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    result = await db.branches.insert_one(branch_doc)
    return BranchResponse(id=str(result.inserted_id), **branch.dict())


@router.get("/branches", response_model=List[BranchResponse])
async def get_branches(user: dict = Depends(get_current_user)):
    branches = await db.branches.find({"is_active": True}).to_list(100)
    return [BranchResponse(id=str(b["_id"]), **{k: v for k, v in b.items() if k != "_id"}) for b in branches]


@router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, user: dict = Depends(get_current_user)):
    branch = await db.branches.find_one({"_id": ObjectId(branch_id)})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return BranchResponse(id=str(branch["_id"]), **{k: v for k, v in branch.items() if k != "_id"})


@router.put("/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(branch_id: str, branch: BranchCreate, user: dict = Depends(require_super_admin)):
    result = await db.branches.update_one(
        {"_id": ObjectId(branch_id)},
        {"$set": {**branch.dict(), "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    updated = await db.branches.find_one({"_id": ObjectId(branch_id)})
    return BranchResponse(id=str(updated["_id"]), **{k: v for k, v in updated.items() if k != "_id"})


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, user: dict = Depends(require_super_admin)):
    """Soft-delete a branch: marks `is_active=False`, hides it from dropdowns and lists.
    Existing clients/jobs/users keep their `branch_id` references intact, so historical
    records remain readable. The branch can be restored by flipping the flag in Mongo
    if ever needed.
    """
    result = await db.branches.update_one(
        {"_id": ObjectId(branch_id)},
        {"$set": {"is_active": False, "deactivated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"success": True, "branch_id": branch_id}
