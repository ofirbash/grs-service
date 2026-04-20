from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

from database import db
from auth import get_current_user, require_admin, require_super_admin, get_password_hash
from models import UserResponse, AdminUserCreate, AdminUserUpdate

router = APIRouter()


@router.get("/users", response_model=List[UserResponse])
async def get_users(user: dict = Depends(require_super_admin)):
    users = await db.users.find({"role": {"$in": ["super_admin", "branch_admin"]}}).to_list(1000)
    return [
        UserResponse(
            id=str(u["_id"]),
            email=u["email"],
            full_name=u["full_name"],
            role=u["role"],
            branch_id=u.get("branch_id"),
            phone=u.get("phone"),
            email_verified=u.get("email_verified", False),
            two_factor_enabled=u.get("two_factor_enabled", False),
            created_at=u["created_at"]
        )
        for u in users
    ]


@router.post("/users/admin")
async def create_admin_user(data: AdminUserCreate, user: dict = Depends(require_super_admin)):
    """Create a new admin user (super_admin or branch_admin)"""
    if data.role not in ["super_admin", "branch_admin"]:
        raise HTTPException(status_code=400, detail="Role must be super_admin or branch_admin")
    if data.role == "branch_admin" and not data.branch_id:
        raise HTTPException(status_code=400, detail="Branch is required for branch_admin")

    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": data.email.lower(),
        "password_hash": get_password_hash(data.password),
        "full_name": data.full_name,
        "role": data.role,
        "branch_id": data.branch_id if data.role == "branch_admin" else None,
        "phone": data.phone,
        "email_verified": True,
        "verification_token": None,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.users.insert_one(user_doc)
    return UserResponse(
        id=str(result.inserted_id),
        email=user_doc["email"],
        full_name=user_doc["full_name"],
        role=user_doc["role"],
        branch_id=user_doc["branch_id"],
        phone=user_doc["phone"],
        email_verified=True,
        two_factor_enabled=False,
        created_at=user_doc["created_at"]
    )


@router.put("/users/{user_id}")
async def update_admin_user(user_id: str, data: AdminUserUpdate, user: dict = Depends(require_super_admin)):
    """Update an admin user's details"""
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    update_data: dict = {"updated_at": datetime.utcnow()}
    if data.full_name is not None:
        update_data["full_name"] = data.full_name
    if data.role is not None:
        if data.role not in ["super_admin", "branch_admin"]:
            raise HTTPException(status_code=400, detail="Role must be super_admin or branch_admin")
        update_data["role"] = data.role
    if data.branch_id is not None:
        update_data["branch_id"] = data.branch_id
    if data.role == "super_admin":
        update_data["branch_id"] = None
    if data.phone is not None:
        update_data["phone"] = data.phone
    if data.password:
        update_data["password_hash"] = get_password_hash(data.password)

    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})

    updated = await db.users.find_one({"_id": ObjectId(user_id)})
    return UserResponse(
        id=str(updated["_id"]),
        email=updated["email"],
        full_name=updated["full_name"],
        role=updated["role"],
        branch_id=updated.get("branch_id"),
        phone=updated.get("phone"),
        email_verified=updated.get("email_verified", False),
        two_factor_enabled=updated.get("two_factor_enabled", False),
        created_at=updated["created_at"]
    )


@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str = Body(..., embed=True), user: dict = Depends(require_super_admin)):
    if role not in ["super_admin", "branch_admin", "customer"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    result = await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"role": role, "updated_at": datetime.utcnow()}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "Role updated successfully"}


@router.delete("/users/{user_id}")
async def delete_admin_user(user_id: str, user: dict = Depends(require_super_admin)):
    """Delete an admin user. Cannot delete yourself."""
    if str(user["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target["role"] not in ["super_admin", "branch_admin"]:
        raise HTTPException(status_code=400, detail="Can only delete admin users")

    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"message": f"Admin user {target['email']} deleted successfully"}
