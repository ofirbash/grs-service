from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime, timedelta
from bson import ObjectId
import uuid
import pyotp
import qrcode
from io import BytesIO
import base64

import os
import logging
import resend

from database import db
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user
)

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
from models import (
    UserCreate, UserLogin, UserResponse, TokenResponse, SetupPasswordRequest
)

router = APIRouter()


@router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user_data.password)
    verification_token = str(uuid.uuid4())

    user_doc = {
        "email": user_data.email.lower(),
        "password_hash": hashed_password,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "branch_id": user_data.branch_id,
        "phone": user_data.phone,
        "email_verified": False,
        "verification_token": verification_token,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    access_token = create_access_token({"sub": user_id, "email": user_data.email, "role": user_data.role})

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[MOCK EMAIL] Verification email sent to {user_data.email} with token: {verification_token}")

    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            full_name=user_data.full_name,
            role=user_data.role,
            branch_id=user_data.branch_id,
            phone=user_data.phone,
            email_verified=False,
            two_factor_enabled=False,
            created_at=user_doc["created_at"]
        )
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("two_factor_enabled") and user.get("two_factor_secret"):
        if not credentials.totp_code:
            return TokenResponse(
                access_token="",
                user=UserResponse(
                    id=str(user["_id"]),
                    email=user["email"],
                    full_name=user["full_name"],
                    role=user["role"],
                    branch_id=user.get("branch_id"),
                    phone=user.get("phone"),
                    email_verified=user.get("email_verified", False),
                    two_factor_enabled=True,
                    created_at=user["created_at"]
                ),
                requires_2fa=True
            )

        totp = pyotp.TOTP(user["two_factor_secret"])
        if not totp.verify(credentials.totp_code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

    user_id = str(user["_id"])
    access_token = create_access_token({"sub": user_id, "email": user["email"], "role": user["role"]})

    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user["email"],
            full_name=user["full_name"],
            role=user["role"],
            branch_id=user.get("branch_id"),
            client_id=user.get("client_id"),
            phone=user.get("phone"),
            email_verified=user.get("email_verified", False),
            two_factor_enabled=user.get("two_factor_enabled", False),
            created_at=user["created_at"]
        )
    )


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        branch_id=user.get("branch_id"),
        client_id=user.get("client_id"),
        phone=user.get("phone"),
        email_verified=user.get("email_verified", False),
        two_factor_enabled=user.get("two_factor_enabled", False),
        created_at=user["created_at"]
    )


@router.post("/auth/verify-email/{token}")
async def verify_email(token: str):
    user = await db.users.find_one({"verification_token": token})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"email_verified": True, "verification_token": None}}
    )
    return {"message": "Email verified successfully"}


@router.post("/auth/setup-2fa")
async def setup_2fa(user: dict = Depends(get_current_user)):
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(user["email"], issuer_name="Bashari Lab")

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"two_factor_secret": secret}}
    )

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "provisioning_uri": provisioning_uri
    }


@router.post("/auth/enable-2fa")
async def enable_2fa(totp_code: str = Body(..., embed=True), user: dict = Depends(get_current_user)):
    if not user.get("two_factor_secret"):
        raise HTTPException(status_code=400, detail="2FA not set up. Call /auth/setup-2fa first")

    totp = pyotp.TOTP(user["two_factor_secret"])
    if not totp.verify(totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"two_factor_enabled": True}}
    )

    return {"message": "2FA enabled successfully"}


@router.post("/auth/disable-2fa")
async def disable_2fa(totp_code: str = Body(..., embed=True), user: dict = Depends(get_current_user)):
    if not user.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    totp = pyotp.TOTP(user["two_factor_secret"])
    if not totp.verify(totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"two_factor_enabled": False, "two_factor_secret": None}}
    )

    return {"message": "2FA disabled successfully"}


@router.post("/auth/setup-password")
async def setup_password(data: SetupPasswordRequest):
    """Set password for a new customer account using the setup token"""
    user = await db.users.find_one({"setup_token": data.token})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired setup link")

    token_created = user.get("setup_token_created_at")
    if token_created:
        expiry = token_created + timedelta(days=30)
        if datetime.utcnow() > expiry:
            raise HTTPException(status_code=400, detail="Setup link has expired. Please contact your administrator.")

    hashed_password = get_password_hash(data.password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "password_hash": hashed_password,
            "email_verified": True,
            "setup_token": None,
            "setup_token_created_at": None,
            "updated_at": datetime.utcnow()
        }}
    )

    user_id = str(user["_id"])
    access_token = create_access_token({"sub": user_id, "email": user["email"], "role": user["role"]})

    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user["email"],
            full_name=user["full_name"],
            role=user["role"],
            branch_id=user.get("branch_id"),
            client_id=user.get("client_id"),
            phone=user.get("phone"),
            email_verified=True,
            two_factor_enabled=False,
            created_at=user["created_at"]
        )
    )


@router.post("/auth/admin-reset-password/{user_id}")
async def admin_reset_password(user_id: str, user: dict = Depends(get_current_user)):
    """Admin initiates a password reset for a user. Accepts user_id or client_id."""
    if user.get("role") not in ["super_admin", "branch_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Try finding by user_id first, then by client_id
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        # Maybe user_id is actually a client_id — find the user linked to this client
        target = await db.users.find_one({"client_id": user_id})
    if not target:
        # Last resort: find client by id, then find user by email
        client_doc = await db.clients.find_one({"_id": ObjectId(user_id)})
        if client_doc:
            target = await db.users.find_one({"email": client_doc["email"].lower()})
    if not target:
        raise HTTPException(status_code=404, detail="No user account found for this client. Please send a welcome email first to create their account.")

    setup_token = str(uuid.uuid4())
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "setup_token": setup_token,
            "setup_token_created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }}
    )

    reset_url = f"{FRONTEND_URL}/setup-password?token={setup_token}" if FRONTEND_URL else ""

    email_sent = False
    try:
        if resend.api_key and reset_url:
            resend.Emails.send({
                "from": SENDER_EMAIL,
                "to": [target["email"]],
                "subject": "Bashari Lab-Direct - Password Reset",
                "html": f"""
                <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                    <h2 style="color:#141417;">Password Reset</h2>
                    <p>Hello {target.get('full_name', '')},</p>
                    <p>An administrator has initiated a password reset for your account.</p>
                    <p>Please click the button below to set a new password:</p>
                    <a href="{reset_url}" style="display:inline-block;background:#141417;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Reset Password</a>
                    <p style="color:#666;font-size:12px;">This link expires in 30 days.</p>
                </div>
                """
            })
            email_sent = True
    except Exception as e:
        logger.error(f"Failed to send reset email: {e}")

    return {
        "message": f"Password reset initiated for {target['email']}",
        "reset_url": reset_url,
        "email_sent": email_sent,
    }


@router.post("/auth/forgot-password")
async def forgot_password(email: str = Body(..., embed=True)):
    """Public endpoint - initiates password reset for a user by email."""
    user = await db.users.find_one({"email": email.lower()})
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If an account exists with that email, a reset link has been sent."}

    setup_token = str(uuid.uuid4())
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "setup_token": setup_token,
            "setup_token_created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }}
    )

    reset_url = f"{FRONTEND_URL}/setup-password?token={setup_token}" if FRONTEND_URL else ""

    try:
        if resend.api_key and reset_url:
            resend.Emails.send({
                "from": SENDER_EMAIL,
                "to": [user["email"]],
                "subject": "Bashari Lab-Direct - Password Reset",
                "html": f"""
                <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                    <h2 style="color:#141417;">Password Reset</h2>
                    <p>Hello {user.get('full_name', '')},</p>
                    <p>We received a request to reset your password.</p>
                    <p>Click the button below to set a new password:</p>
                    <a href="{reset_url}" style="display:inline-block;background:#141417;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Reset Password</a>
                    <p style="color:#666;font-size:12px;">If you didn't request this, you can safely ignore this email. This link expires in 30 days.</p>
                </div>
                """
            })
            logger.info(f"Password reset email sent to {user['email']}")
    except Exception as e:
        logger.error(f"Failed to send forgot-password email: {e}")

    return {"message": "If an account exists with that email, a reset link has been sent."}
