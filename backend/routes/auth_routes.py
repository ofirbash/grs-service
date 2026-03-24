from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime, timedelta
from bson import ObjectId
import uuid
import pyotp
import qrcode
from io import BytesIO
import base64

from database import db
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user
)
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
