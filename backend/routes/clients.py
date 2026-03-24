from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import uuid
import os
import logging

import resend

from database import db
from auth import get_current_user, require_admin
from models import ClientCreate, ClientUpdate, ClientResponse

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")

router = APIRouter()


@router.post("/clients", response_model=ClientResponse)
async def create_client(client: ClientCreate, user: dict = Depends(require_admin)):
    client_doc = {
        **client.dict(),
        "created_at": datetime.utcnow()
    }
    result = await db.clients.insert_one(client_doc)
    client_id = str(result.inserted_id)

    # Auto-create customer user account if no user with this email exists
    email_lower = client.email.lower()
    existing_user = await db.users.find_one({"email": email_lower})
    if not existing_user:
        from auth import get_password_hash
        setup_token = str(uuid.uuid4())
        user_doc = {
            "email": email_lower,
            "password_hash": "",
            "full_name": client.name,
            "role": "customer",
            "branch_id": client.branch_id,
            "client_id": client_id,
            "phone": client.phone,
            "email_verified": False,
            "verification_token": None,
            "two_factor_enabled": False,
            "two_factor_secret": None,
            "setup_token": setup_token,
            "setup_token_created_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await db.users.insert_one(user_doc)

        # Send setup email via Resend
        if resend.api_key and FRONTEND_URL:
            try:
                setup_url = f"{FRONTEND_URL}/setup-password?token={setup_token}"
                html_body = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: #141417; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">Bashari Lab-Direct</h1>
                        <p style="color: #bcccdc; margin: 5px 0 0;">Lab Logistics & ERP System</p>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                        <h2 style="color: #141417; margin-top: 0;">Welcome, {client.name}!</h2>
                        <p style="color: #334e68; line-height: 1.6;">
                            Your account has been created on the Bashari Lab-Direct system. You can now track your gemstone testing jobs, view stone details, and stay updated on your orders.
                        </p>
                        <p style="color: #334e68; line-height: 1.6;">
                            Please click the button below to set up your password and access your account:
                        </p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{setup_url}" style="background: #141417; color: #FFFFFF; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                                Set Up Your Password
                            </a>
                        </div>
                        <p style="color: #627d98; font-size: 13px; line-height: 1.5;">
                            This link will expire in 30 days. If you have any questions, please contact your account manager.
                        </p>
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        <p style="color: #9fb3c8; font-size: 12px; text-align: center;">
                            Bashari Lab-Direct
                        </p>
                    </div>
                </div>
                """
                welcome_branch = await db.branches.find_one({"_id": ObjectId(client.branch_id)})
                wb_email = welcome_branch.get("email") if welcome_branch else None
                wb_sender = welcome_branch.get("sender_name", welcome_branch.get("name", "GRS")) if welcome_branch else "GRS"
                welcome_sender = f"{wb_sender} <{wb_email}>" if wb_email else SENDER_EMAIL

                resend.Emails.send({
                    "from": welcome_sender,
                    "reply_to": welcome_sender,
                    "to": [email_lower],
                    "subject": "Welcome to Bashari Lab-Direct - Set Up Your Account",
                    "html": html_body,
                })
                logger.info(f"Setup email sent to {email_lower}")
            except Exception as e:
                logger.error(f"Failed to send setup email to {email_lower}: {e}")

    return ClientResponse(id=client_id, **client.dict(), created_at=client_doc["created_at"])


@router.get("/clients", response_model=List[ClientResponse])
async def get_clients(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if user["role"] == "customer":
        return []

    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    elif user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")

    clients = await db.clients.find(query).to_list(1000)
    return [ClientResponse(id=str(c["_id"]), **{k: v for k, v in c.items() if k != "_id"}) for c in clients]


@router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "customer":
        user_client_id = user.get("client_id")
        if not user_client_id or user_client_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")

    client = await db.clients.find_one({"_id": ObjectId(client_id)})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientResponse(id=str(client["_id"]), **{k: v for k, v in client.items() if k != "_id"})


@router.put("/clients/{client_id}", response_model=ClientResponse)
async def update_client(client_id: str, client_update: ClientUpdate, user: dict = Depends(require_admin)):
    """Update client details"""
    client = await db.clients.find_one({"_id": ObjectId(client_id)})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    update_data = {k: v for k, v in client_update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    update_data["updated_at"] = datetime.utcnow()

    await db.clients.update_one(
        {"_id": ObjectId(client_id)},
        {"$set": update_data}
    )

    updated = await db.clients.find_one({"_id": ObjectId(client_id)})
    return ClientResponse(id=str(updated["_id"]), **{k: v for k, v in updated.items() if k != "_id"})
