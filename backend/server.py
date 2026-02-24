from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Form, Body, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Union
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
import pyotp
import qrcode
from io import BytesIO
import base64
from bson import ObjectId
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
import urllib.request
import time
import cloudinary
import cloudinary.utils
import cloudinary.uploader
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Cloudinary configuration
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

# Resend email configuration
resend.api_key = os.getenv("RESEND_API_KEY", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'bashari_erp')]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'bashari-secret-key-2024-secure')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Logo URLs
FULL_LOGO_URL = "https://customer-assets.emergentagent.com/job_stone-erp-mobile/artifacts/38z41zb2_bashari%20logo.png"
SQUARE_LOGO_URL = "https://customer-assets.emergentagent.com/job_stone-erp-mobile/artifacts/q4uw8qjo_bashari%20logo%20favicon.png"

# Create the main app
app = FastAPI(title="Bashari Lab Logistics ERP")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== HELPER FUNCTIONS ==============

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=JWT_EXPIRATION_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") not in ["super_admin", "branch_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def require_super_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user

# ============== PYDANTIC MODELS ==============

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "customer"  # super_admin, branch_admin, customer
    branch_id: Optional[str] = None
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    branch_id: Optional[str] = None
    client_id: Optional[str] = None  # For customer role - links to their client
    phone: Optional[str] = None
    email_verified: bool = False
    two_factor_enabled: bool = False
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    requires_2fa: bool = False

# Branch Models
class BranchCreate(BaseModel):
    name: str  # e.g., "Israel", "USA"
    code: str  # e.g., "IL", "US"
    address: str
    return_address: str
    phone: Optional[str] = None
    email: Optional[str] = None

class BranchResponse(BaseModel):
    id: str
    name: str
    code: str
    address: str
    return_address: str
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True

# Client Models
class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    secondary_email: Optional[EmailStr] = None
    secondary_phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    branch_id: str
    notes: Optional[str] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    secondary_email: Optional[EmailStr] = None
    secondary_phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    branch_id: Optional[str] = None
    notes: Optional[str] = None

class ClientResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    secondary_email: Optional[str] = None
    secondary_phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    branch_id: str
    notes: Optional[str] = None
    created_at: datetime

# Stone Models
class StoneCreate(BaseModel):
    stone_type: str  # Ruby, Sapphire, Emerald, etc.
    weight: float  # in carats
    shape: str = "Other"  # Optional, defaults to "Other"
    value: float  # USD value
    color_stability_test: bool = False

class StoneResponse(BaseModel):
    id: str
    sku: str
    stone_type: str
    weight: float
    shape: str
    value: float
    color_stability_test: bool
    fee: float
    position: int
    certificate_group: Optional[int] = None
    verbal_findings: Optional[Union[str, Dict[str, Any]]] = None  # Can be string or structured dict
    certificate_scan_url: Optional[str] = None
    job_id: Optional[str] = None
    job_number: Optional[int] = None

# Verbal Findings Models
class VerbalFindingCreate(BaseModel):
    stone_id: str
    report_number: str
    identification: str
    comment: Optional[str] = None
    origin: Optional[str] = None
    color: Optional[str] = None

class VerbalFindingResponse(BaseModel):
    id: str
    stone_id: str
    report_number: str
    identification: str
    comment: Optional[str] = None
    origin: Optional[str] = None
    color: Optional[str] = None
    created_at: datetime

# Certificate Unit Models
class CertificateUnitCreate(BaseModel):
    stones: List[StoneCreate]  # 1-30 stones per unit

# Job Models
class JobCreate(BaseModel):
    client_id: str
    branch_id: str
    service_type: str  # Express, Normal, Recheck
    notes: Optional[str] = None
    certificate_units: List[CertificateUnitCreate]

class JobStatusUpdate(BaseModel):
    status: str  # received, transit, lab_hk, verbal_results, return_transit, ready_scanned, delivered

class NotificationLog(BaseModel):
    id: str
    notification_type: str
    sent_at: datetime
    sent_by: str
    message: Optional[str] = None

class JobResponse(BaseModel):
    id: str
    job_number: int
    client_id: str
    client_name: Optional[str] = None
    branch_id: str
    branch_name: Optional[str] = None
    service_type: str
    status: str
    notes: Optional[str] = None
    stones: List[StoneResponse]
    verbal_findings: List[VerbalFindingResponse]
    notification_log: List[NotificationLog]
    total_stones: int
    total_value: float
    total_fee: float
    shipment_ids: List[str] = []  # Jobs can be in multiple shipments
    shipment_info: Optional[Dict[str, Any]] = None
    signed_memo_url: Optional[str] = None
    signed_memo_filename: Optional[str] = None
    lab_invoice_url: Optional[str] = None
    lab_invoice_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# Document Upload Model
class DocumentUpload(BaseModel):
    job_id: str
    stone_id: Optional[str] = None
    document_type: str  # certificate_scan, signed_memo, etc.
    file_base64: str
    filename: str

# Shipment Models
class ShipmentCreate(BaseModel):
    shipment_type: str  # stones_for_testing, certificates, stones_after_testing
    courier: str  # UPS, FedEx, DHL, etc.
    source_address: str  # e.g., "Israel Office"
    destination_address: str  # e.g., "HK Lab"
    tracking_number: Optional[str] = None
    date_sent: Optional[datetime] = None
    job_ids: List[str] = []  # Jobs included in this shipment
    notes: Optional[str] = None

class ShipmentUpdate(BaseModel):
    shipment_type: Optional[str] = None
    courier: Optional[str] = None
    source_address: Optional[str] = None
    destination_address: Optional[str] = None
    tracking_number: Optional[str] = None
    date_sent: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class ShipmentJobsUpdate(BaseModel):
    job_ids: List[str]

class ShipmentResponse(BaseModel):
    id: str
    shipment_number: int
    shipment_type: str
    courier: str
    source_address: str
    destination_address: str
    tracking_number: Optional[str] = None
    date_sent: Optional[datetime] = None
    status: str
    job_ids: List[str]
    jobs: Optional[List[Dict[str, Any]]] = None  # Populated job details
    total_jobs: int
    total_stones: int
    total_value: float
    notes: Optional[str] = None
    created_by: str
    created_at: datetime
    updated_at: datetime

# Pricing Configuration
class PricingBracket(BaseModel):
    min_value: float
    max_value: float
    express_fee: float
    normal_fee: float
    recheck_fee: float

class PricingConfigResponse(BaseModel):
    brackets: List[PricingBracket]
    color_stability_fee: float

# ============== STONE TYPE CODES ==============
STONE_TYPE_CODES = {
    "Ruby": "RU",
    "Sapphire": "SA",
    "Emerald": "EM",
    "Diamond": "DI",
    "Alexandrite": "AL",
    "Spinel": "SP",
    "Padparadscha": "PA",
    "Paraiba": "PR",
    "Tanzanite": "TZ",
    "Other": "OT"
}

# ============== PRICING ENGINE ==============
PRICING_BRACKETS = [
    {"min": 0, "max": 9999.99, "express": 120, "normal": 80, "recheck": 40},
    {"min": 10000, "max": 49999.99, "express": 200, "normal": 150, "recheck": 75},
    {"min": 50000, "max": 199999.99, "express": 350, "normal": 250, "recheck": 125},
    {"min": 200000, "max": 9999999.99, "express": 500, "normal": 400, "recheck": 200},
]
COLOR_STABILITY_FEE = 50

def calculate_stone_fee(value: float, service_type: str, color_stability_test: bool) -> float:
    """Calculate fee for a single stone based on value bracket and service type"""
    fee = 0
    service_key = service_type.lower()
    
    for bracket in PRICING_BRACKETS:
        if bracket["min"] <= value <= bracket["max"]:
            if service_key == "express":
                fee = bracket["express"]
            elif service_key == "normal":
                fee = bracket["normal"]
            else:  # recheck
                fee = bracket["recheck"]
            break
    
    if color_stability_test:
        fee += COLOR_STABILITY_FEE
    
    return fee

def generate_sku(stone_type: str, weight: float, job_id: int, position: int) -> str:
    """Generate auto-SKU: [StoneTypeCode][WeightWithoutDecimal]J[JobID][StonePosition]
    Weight is formatted to 2 decimal places before removing the decimal point.
    Example: 2.50 -> "250", 2.5 -> "250", 3.0 -> "300"
    """
    type_code = STONE_TYPE_CODES.get(stone_type, "OT")
    # Format weight to 2 decimal places to preserve trailing zeros
    weight_formatted = f"{weight:.2f}"
    weight_str = weight_formatted.replace(".", "")
    position_str = str(position).zfill(2)
    return f"{type_code}{weight_str}J{job_id}{position_str}"

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = get_password_hash(user_data.password)
    
    # Generate verification token
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
    
    # Create access token
    access_token = create_access_token({"sub": user_id, "email": user_data.email, "role": user_data.role})
    
    # Log email verification (mock for MVP)
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

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if 2FA is enabled
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
        
        # Verify TOTP
        totp = pyotp.TOTP(user["two_factor_secret"])
        if not totp.verify(credentials.totp_code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
    
    # Create access token
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

@api_router.get("/auth/me", response_model=UserResponse)
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

@api_router.post("/auth/verify-email/{token}")
async def verify_email(token: str):
    user = await db.users.find_one({"verification_token": token})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"email_verified": True, "verification_token": None}}
    )
    return {"message": "Email verified successfully"}

@api_router.post("/auth/setup-2fa")
async def setup_2fa(user: dict = Depends(get_current_user)):
    # Generate TOTP secret
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    
    # Generate QR code URI
    provisioning_uri = totp.provisioning_uri(user["email"], issuer_name="Bashari Lab")
    
    # Generate QR code image as base64
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Store secret temporarily (not enabled yet)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"two_factor_secret": secret}}
    )
    
    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "provisioning_uri": provisioning_uri
    }

@api_router.post("/auth/enable-2fa")
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

@api_router.post("/auth/disable-2fa")
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

# ============== BRANCH ENDPOINTS ==============

@api_router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, user: dict = Depends(require_super_admin)):
    branch_doc = {
        **branch.dict(),
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    result = await db.branches.insert_one(branch_doc)
    return BranchResponse(id=str(result.inserted_id), **branch.dict())

@api_router.get("/branches", response_model=List[BranchResponse])
async def get_branches(user: dict = Depends(get_current_user)):
    branches = await db.branches.find({"is_active": True}).to_list(100)
    return [BranchResponse(id=str(b["_id"]), **{k: v for k, v in b.items() if k != "_id"}) for b in branches]

@api_router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, user: dict = Depends(get_current_user)):
    branch = await db.branches.find_one({"_id": ObjectId(branch_id)})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return BranchResponse(id=str(branch["_id"]), **{k: v for k, v in branch.items() if k != "_id"})

@api_router.put("/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(branch_id: str, branch: BranchCreate, user: dict = Depends(require_super_admin)):
    result = await db.branches.update_one(
        {"_id": ObjectId(branch_id)},
        {"$set": {**branch.dict(), "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    updated = await db.branches.find_one({"_id": ObjectId(branch_id)})
    return BranchResponse(id=str(updated["_id"]), **{k: v for k, v in updated.items() if k != "_id"})

# ============== CLIENT ENDPOINTS ==============

@api_router.post("/clients", response_model=ClientResponse)
async def create_client(client: ClientCreate, user: dict = Depends(require_admin)):
    client_doc = {
        **client.dict(),
        "created_at": datetime.utcnow()
    }
    result = await db.clients.insert_one(client_doc)
    return ClientResponse(id=str(result.inserted_id), **client.dict(), created_at=client_doc["created_at"])

@api_router.get("/clients", response_model=List[ClientResponse])
async def get_clients(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    # Customers cannot view clients list
    if user["role"] == "customer":
        return []
    
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    elif user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")
    
    clients = await db.clients.find(query).to_list(1000)
    return [ClientResponse(id=str(c["_id"]), **{k: v for k, v in c.items() if k != "_id"}) for c in clients]

@api_router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str, user: dict = Depends(get_current_user)):
    # Customers can only view their own client
    if user["role"] == "customer":
        user_client_id = user.get("client_id")
        if not user_client_id or user_client_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    client = await db.clients.find_one({"_id": ObjectId(client_id)})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientResponse(id=str(client["_id"]), **{k: v for k, v in client.items() if k != "_id"})

@api_router.put("/clients/{client_id}", response_model=ClientResponse)
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

# ============== JOB ENDPOINTS ==============

@api_router.post("/jobs", response_model=JobResponse)
async def create_job(job: JobCreate, user: dict = Depends(require_admin)):
    # Validate client exists
    client = await db.clients.find_one({"_id": ObjectId(job.client_id)})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get next job number
    last_job = await db.jobs.find_one(sort=[("job_number", -1)])
    job_number = (last_job.get("job_number", 0) if last_job else 0) + 1
    
    # Process stones
    stones = []
    position = 1
    total_value = 0
    total_fee = 0
    
    for cert_unit in job.certificate_units:
        for stone_data in cert_unit.stones:
            sku = generate_sku(stone_data.stone_type, stone_data.weight, job_number, position)
            fee = calculate_stone_fee(stone_data.value, job.service_type, stone_data.color_stability_test)
            
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
    
    # Get branch name
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

@api_router.get("/jobs", response_model=List[JobResponse])
async def get_jobs(
    branch_id: Optional[str] = None,
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    
    if user["role"] == "customer":
        # Customers only see jobs for their associated client
        user_client_id = user.get("client_id")
        if user_client_id:
            query["client_id"] = user_client_id
        else:
            # Fallback: try to find client by email
            client = await db.clients.find_one({"email": user["email"]})
            if client:
                query["client_id"] = str(client["_id"])
            else:
                return []  # No client associated, return empty
    elif user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")
    
    if branch_id and user["role"] == "super_admin":
        query["branch_id"] = branch_id
    if client_id and user["role"] != "customer":  # Customers can't override client filter
        query["client_id"] = client_id
    if status:
        query["status"] = status
    
    jobs = await db.jobs.find(query).sort("created_at", -1).to_list(1000)
    
    response = []
    for job in jobs:
        client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
        branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})
        
        # Get latest shipment info if job is in any shipments
        shipment_info = None
        shipment_ids = job.get("shipment_ids", [])
        # Also check for legacy shipment_id field
        if not shipment_ids and job.get("shipment_id"):
            shipment_ids = [job.get("shipment_id")]
        
        if shipment_ids:
            # Get the latest shipment
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
        
        response.append(JobResponse(
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
            created_at=job["created_at"],
            updated_at=job["updated_at"]
        ))
    
    return response

@api_router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})
    
    # Get latest shipment info if job is in any shipments
    shipment_info = None
    shipment_ids = job.get("shipment_ids", [])
    # Also check for legacy shipment_id field
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
        created_at=job["created_at"],
        updated_at=job["updated_at"]
    )

@api_router.put("/jobs/{job_id}/status", response_model=JobResponse)
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

class StoneGroupUpdate(BaseModel):
    stone_ids: List[str]
    group_number: int

@api_router.put("/jobs/{job_id}/group-stones")
async def group_stones_for_certificate(job_id: str, group_update: StoneGroupUpdate, user: dict = Depends(require_admin)):
    """Group stones together for a single certificate (max 30 per group)"""
    if len(group_update.stone_ids) > 30:
        raise HTTPException(status_code=400, detail="Maximum 30 stones per certificate group")
    
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Update the certificate_group for selected stones
    stones = job.get("stones", [])
    for stone in stones:
        if stone["id"] in group_update.stone_ids:
            stone["certificate_group"] = group_update.group_number
    
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"stones": stones, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": f"Grouped {len(group_update.stone_ids)} stones into certificate group {group_update.group_number}"}

class StoneUngroupUpdate(BaseModel):
    stone_ids: List[str]

@api_router.put("/jobs/{job_id}/ungroup-stones")
async def ungroup_stones(job_id: str, ungroup_update: StoneUngroupUpdate, user: dict = Depends(require_admin)):
    """Remove stones from their certificate group"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Remove the certificate_group for selected stones
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

class MemoUpload(BaseModel):
    filename: str
    file_data: str  # Base64 encoded or URL

@api_router.put("/jobs/{job_id}/memo")
async def upload_signed_memo(job_id: str, memo: MemoUpload, user: dict = Depends(require_admin)):
    """Upload a signed memo document to a job"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Store the memo URL (in production, would upload to cloud storage first)
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {
            "signed_memo_url": memo.file_data,
            "signed_memo_filename": memo.filename,
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "Memo uploaded successfully", "filename": memo.filename}

@api_router.put("/jobs/{job_id}/lab-invoice")
async def upload_lab_invoice(job_id: str, memo: MemoUpload, user: dict = Depends(require_admin)):
    """Upload a lab invoice document to a job (admin only)"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Store the lab invoice URL
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {
            "lab_invoice_url": memo.file_data,
            "lab_invoice_filename": memo.filename,
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "Lab invoice uploaded successfully", "filename": memo.filename}

class AddStoneRequest(BaseModel):
    stone_type: str
    weight: float
    shape: str = "Other"
    value: float
    color_stability_test: bool = False

@api_router.post("/jobs/{job_id}/stones")
async def add_stone_to_job(job_id: str, stone: AddStoneRequest, user: dict = Depends(require_admin)):
    """Add a new stone to an existing job"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get next position for stone
    existing_stones = job.get("stones", [])
    next_position = len(existing_stones) + 1
    
    # Calculate fee using the proper pricing brackets
    fee = calculate_stone_fee(stone.value, job.get("service_type", "Normal"), stone.color_stability_test)
    
    # Generate SKU
    sku = generate_sku(stone.stone_type, stone.weight, job["job_number"], next_position)
    
    # Create new stone document
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
    
    # Update job with new stone
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

# ==================== STONES ENDPOINTS ====================

@api_router.get("/stones")
async def get_all_stones(user: dict = Depends(get_current_user)):
    """Get all stones across all jobs with job info"""
    query = {}
    
    # Filter for customers - only their client's jobs
    if user["role"] == "customer":
        user_client_id = user.get("client_id")
        if user_client_id:
            query["client_id"] = user_client_id
        else:
            return []
    
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
    
    # Sort by job_number descending, then by position
    all_stones.sort(key=lambda x: (-x.get("job_number", 0), x.get("position", 0)))
    return all_stones

@api_router.get("/stones/{stone_id}")
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

# Structured Verbal Findings Model
class StructuredVerbalFindings(BaseModel):
    certificate_id: Optional[str] = None
    weight: Optional[float] = None
    identification: Optional[str] = None
    color: Optional[str] = None
    origin: Optional[str] = None
    comment: Optional[str] = None

class VerbalFindingsUpdate(BaseModel):
    verbal_findings: Optional[str] = None  # Legacy simple text field
    structured_findings: Optional[StructuredVerbalFindings] = None  # New structured fields

@api_router.put("/stones/{stone_id}/verbal")
async def update_stone_verbal(stone_id: str, data: VerbalFindingsUpdate, user: dict = Depends(require_admin)):
    """Update verbal findings for a stone"""
    # Find the job containing this stone
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")
    
    # Build update data
    update_data = {"updated_at": datetime.utcnow()}
    
    if data.structured_findings:
        # Use structured findings
        update_data["stones.$.verbal_findings"] = data.structured_findings.dict()
    elif data.verbal_findings is not None:
        # Legacy: simple text field
        update_data["stones.$.verbal_findings"] = data.verbal_findings
    
    # Update the stone's verbal findings
    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": update_data}
    )
    
    return {"message": "Verbal findings updated successfully"}

# ============== DROPDOWN SETTINGS ==============

class DropdownOption(BaseModel):
    value: str
    stone_types: List[str] = ["all"]  # "all" means available for all stone types

class DropdownSettingsUpdate(BaseModel):
    field_name: str  # identification, color, origin, comment
    options: List[DropdownOption]

class DropdownSettingsResponse(BaseModel):
    identification: List[DropdownOption]
    color: List[DropdownOption]
    origin: List[DropdownOption]
    comment: List[DropdownOption]

@api_router.get("/settings/dropdowns")
async def get_dropdown_settings(user: dict = Depends(get_current_user)):
    """Get all dropdown settings for verbal findings"""
    settings = await db.dropdown_settings.find_one({"type": "verbal_findings"})
    
    if not settings:
        # Return empty defaults
        return {
            "identification": [],
            "color": [],
            "origin": [],
            "comment": []
        }
    
    return {
        "identification": settings.get("identification", []),
        "color": settings.get("color", []),
        "origin": settings.get("origin", []),
        "comment": settings.get("comment", [])
    }

@api_router.put("/settings/dropdowns/{field_name}")
async def update_dropdown_settings(field_name: str, options: List[dict] = Body(...), user: dict = Depends(require_admin)):
    """Update dropdown options for a specific field with stone type mapping"""
    if field_name not in ["identification", "color", "origin", "comment"]:
        raise HTTPException(status_code=400, detail="Invalid field name")
    
    # Validate and format options
    dropdown_options = []
    for opt in options:
        if isinstance(opt, str):
            dropdown_options.append({"value": opt, "stone_types": ["all"]})
        elif isinstance(opt, dict):
            dropdown_options.append({
                "value": opt.get("value", ""),
                "stone_types": opt.get("stone_types", ["all"])
            })
    
    # Upsert the settings
    await db.dropdown_settings.update_one(
        {"type": "verbal_findings"},
        {"$set": {field_name: dropdown_options, "updated_at": datetime.utcnow()}},
        upsert=True
    )
    
    return {"message": f"{field_name} options updated successfully"}

@api_router.post("/settings/dropdowns/initialize")
async def initialize_dropdown_settings(user: dict = Depends(require_admin)):
    """Initialize dropdown settings with default values"""
    
    # Default values extracted from the PDFs
    default_settings = {
        "type": "verbal_findings",
        "identification": [
            {"value": "NATURAL RUBY", "stone_types": ["all"]},
            {"value": "NATURAL SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL EMERALD", "stone_types": ["all"]},
            {"value": "NATURAL SPINEL", "stone_types": ["all"]},
            {"value": "NATURAL TANZANITE", "stone_types": ["all"]},
            {"value": "NATURAL TOURMALINE", "stone_types": ["all"]},
            {"value": "NATURAL AQUAMARINE (-BERYL)", "stone_types": ["all"]},
            {"value": "NATURAL CHRYSOBERYL", "stone_types": ["all"]},
            {"value": "NATURAL CATS EYE CHRYSOBERYL", "stone_types": ["all"]},
            {"value": "NATURAL STAR RUBY", "stone_types": ["all"]},
            {"value": "NATURAL STAR SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PINK SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL YELLOW SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL ORANGE SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL FANCY SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL COLOR-CHANGING SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PURPLISH-PINK SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PINKISH ORANGE SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL GREENISH-BLUE SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PINKISH RED RUBY", "stone_types": ["all"]},
            {"value": "NATURAL GARNET (SPESSARTINE)", "stone_types": ["all"]},
            {"value": "NATURAL TOURMALINE (CUPRIAN-ELBAITE)", "stone_types": ["all"]},
            {"value": "NATURAL TOURMALINE (RUBELITE)", "stone_types": ["all"]},
            {"value": "NATURAL IMPERIAL TOPAZ", "stone_types": ["all"]},
            {"value": "NATURAL ZIRCON", "stone_types": ["all"]},
            {"value": "NATURAL KORNERUPINE", "stone_types": ["all"]},
            {"value": "TREATED RUBY", "stone_types": ["all"]},
            {"value": "TREATED SAPPHIRE", "stone_types": ["all"]},
            {"value": "TREATED TOURMALINE", "stone_types": ["all"]},
            {"value": "LEAD-GLASS TREATED NATURAL RUBY", "stone_types": ["all"]},
            {"value": "SYNTHETIC RUBY", "stone_types": ["all"]},
            {"value": "SYNTHETIC SAPPHIRE", "stone_types": ["all"]},
            {"value": "SYNTHETIC SPINEL", "stone_types": ["all"]},
            {"value": "SYNTHETIC ALEXANDRITE (-CHRYSOBERYL)", "stone_types": ["all"]},
            {"value": "GARNET TOPPED DOUBLET", "stone_types": ["all"]},
        ],
        "color": [
            {"value": "RED", "stone_types": ["all"]},
            {"value": "VIVID RED", "stone_types": ["all"]},
            {"value": "DEEP RED", "stone_types": ["all"]},
            {"value": "VIVID RED PIGEON BLOOD", "stone_types": ["all"]},
            {"value": "VIVID TO DEEP RED PIGEON BLOOD", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID RED PIGEON BLOOD", "stone_types": ["all"]},
            {"value": "PINKISH RED", "stone_types": ["all"]},
            {"value": "PURPLISH-PINK", "stone_types": ["all"]},
            {"value": "BLUE", "stone_types": ["all"]},
            {"value": "VIVID BLUE", "stone_types": ["all"]},
            {"value": "DEEP BLUE", "stone_types": ["all"]},
            {"value": "VIVID BLUE ROYAL BLUE", "stone_types": ["all"]},
            {"value": "VIVID TO DEEP BLUE ROYAL BLUE", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID BLUE ROYAL BLUE", "stone_types": ["all"]},
            {"value": "PASTEL BLUE", "stone_types": ["all"]},
            {"value": "VIOLETISH-BLUE", "stone_types": ["all"]},
            {"value": "GREENISH-BLUE", "stone_types": ["all"]},
            {"value": "GREENISH-BLUE PARAIBA", "stone_types": ["all"]},
            {"value": "GREEN", "stone_types": ["all"]},
            {"value": "VIVID GREEN", "stone_types": ["all"]},
            {"value": "VIVID GREEN MUZO GREEN", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID GREEN", "stone_types": ["all"]},
            {"value": "YELLOW", "stone_types": ["all"]},
            {"value": "VIVID YELLOW", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID YELLOW", "stone_types": ["all"]},
            {"value": "ORANGE", "stone_types": ["all"]},
            {"value": "VIVID ORANGE", "stone_types": ["all"]},
            {"value": "PINKISH ORANGE", "stone_types": ["all"]},
            {"value": "YELLOWISH-ORANGE", "stone_types": ["all"]},
            {"value": "PINK", "stone_types": ["all"]},
            {"value": "VIVID PINK", "stone_types": ["all"]},
            {"value": "PURPLE-RED", "stone_types": ["all"]},
            {"value": "PURPLISH-RED", "stone_types": ["all"]},
            {"value": "COLOR-CHANGING FROM BLUE TO PURPLE", "stone_types": ["all"]},
            {"value": "COLOR-CHANGING FROM VIOLETISH-BLUE TO PURPLE", "stone_types": ["all"]},
        ],
        "origin": [
            {"value": "NO ORIGIN", "stone_types": ["all"]},
            {"value": "BURMA (MYANMAR)", "stone_types": ["all"]},
            {"value": "BURMA (MOGOK)", "stone_types": ["all"]},
            {"value": "SRI LANKA", "stone_types": ["all"]},
            {"value": "MADAGASCAR", "stone_types": ["all"]},
            {"value": "MOZAMBIQUE", "stone_types": ["all"]},
            {"value": "THAILAND", "stone_types": ["all"]},
            {"value": "COLOMBIA", "stone_types": ["all"]},
            {"value": "ZAMBIA", "stone_types": ["all"]},
            {"value": "BRAZIL", "stone_types": ["all"]},
            {"value": "TANZANIA", "stone_types": ["all"]},
            {"value": "KASHMIR (INDIA)", "stone_types": ["all"]},
            {"value": "AFGHANISTAN (PANJSHIR)", "stone_types": ["all"]},
            {"value": "ETHIOPIA", "stone_types": ["all"]},
            {"value": "EAST-AFRICA", "stone_types": ["all"]},
            {"value": "URAL (RUSSIA)", "stone_types": ["all"]},
            {"value": "HIMALAYAN MOUNTAINS", "stone_types": ["all"]},
            {"value": "KANCHANABURI (THAILAND)", "stone_types": ["all"]},
            {"value": "UMBA (TANZANIA)", "stone_types": ["all"]},
        ],
        "comment": [
            {"value": "NONE", "stone_types": ["all"]},
            {"value": "NO INDICATION OF TREATMENT", "stone_types": ["all"]},
            {"value": "NO INDICATION OF THERMAL TREATMENT", "stone_types": ["all"]},
            {"value": "HEATED", "stone_types": ["all"]},
            {"value": "H(a)", "stone_types": ["all"]},
            {"value": "H(b)", "stone_types": ["all"]},
            {"value": "H, LIBS-tested", "stone_types": ["all"]},
            {"value": "H(a), LIBS-tested", "stone_types": ["all"]},
            {"value": "H(b), LIBS-tested", "stone_types": ["all"]},
            {"value": "INSIGNIFICANT", "stone_types": ["all"]},
            {"value": "MINOR", "stone_types": ["all"]},
            {"value": "MINOR TO MODERATE", "stone_types": ["all"]},
            {"value": "MODERATE", "stone_types": ["all"]},
            {"value": "MINOR TO MODERATE (HARDENED RESIN)", "stone_types": ["all"]},
            {"value": "NO HEATED", "stone_types": ["all"]},
            {"value": "NO HEATED (OIL)", "stone_types": ["all"]},
            {"value": "FTIR-tested", "stone_types": ["all"]},
            {"value": "PHT", "stone_types": ["all"]},
            {"value": "APPLICATION OF TREATMENT UNDETERMINABLE", "stone_types": ["all"]},
            {"value": "Heat-treated and clarity-enhanced with foreign substance", "stone_types": ["all"]},
            {"value": "H, Special comment see appendix", "stone_types": ["all"]},
            {"value": "NO COMMENT", "stone_types": ["all"]},
        ],
        "updated_at": datetime.utcnow()
    }
    
    # Check if settings already exist
    existing = await db.dropdown_settings.find_one({"type": "verbal_findings"})
    if existing:
        return {"message": "Settings already initialized", "action": "none"}
    
    await db.dropdown_settings.insert_one(default_settings)
    return {"message": "Dropdown settings initialized successfully"}

class GroupCertificateScanUpload(BaseModel):
    job_id: str
    certificate_group: int
    filename: str
    file_data: str  # Base64 encoded

@api_router.put("/stones/group/certificate-scan")
async def upload_group_certificate_scan(data: GroupCertificateScanUpload, user: dict = Depends(require_admin)):
    """Upload certificate scan for all stones in a certificate group"""
    job = await db.jobs.find_one({"_id": ObjectId(data.job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Find all stones in the certificate group
    stones_in_group = [s for s in job.get("stones", []) if s.get("certificate_group") == data.certificate_group]
    if not stones_in_group:
        raise HTTPException(status_code=404, detail="No stones found in this certificate group")
    
    # Update all stones in the group with the same certificate scan
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

class CertificateScanUpload(BaseModel):
    filename: str
    file_data: str  # Base64 encoded

@api_router.put("/stones/{stone_id}/certificate-scan")
async def upload_stone_certificate_scan(stone_id: str, data: CertificateScanUpload, user: dict = Depends(require_admin)):
    """Upload certificate scan for a single stone"""
    job = await db.jobs.find_one({"stones.id": stone_id})
    if not job:
        raise HTTPException(status_code=404, detail="Stone not found")
    
    # Store the certificate scan URL (base64 data in this case)
    await db.jobs.update_one(
        {"_id": job["_id"], "stones.id": stone_id},
        {"$set": {"stones.$.certificate_scan_url": data.file_data, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Certificate scan uploaded successfully", "filename": data.filename}

# ==================== END STONES ENDPOINTS ====================

class JobUpdate(BaseModel):
    notes: Optional[str] = None
    status: Optional[str] = None

@api_router.put("/jobs/{job_id}", response_model=JobResponse)
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

# ============== SHIPMENT ENDPOINTS ==============

# Shipment types and statuses
SHIPMENT_TYPES = ["send_stones_to_lab", "stones_from_lab", "certificates_from_lab"]
SHIPMENT_STATUSES = ["pending", "in_transit", "delivered", "cancelled"]
JOB_STATUSES = ["draft", "stones_accepted", "sent_to_lab", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done"]
COURIERS = ["UPS", "FedEx", "DHL", "TNT", "Aramex", "Local Courier", "Hand Carry", "Other"]

@api_router.post("/shipments", response_model=ShipmentResponse)
async def create_shipment(shipment: ShipmentCreate, user: dict = Depends(require_admin)):
    # Get next shipment number
    last_shipment = await db.shipments.find_one(sort=[("shipment_number", -1)])
    shipment_number = (last_shipment.get("shipment_number", 0) if last_shipment else 0) + 1
    
    # Validate job_ids exist
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
            pass  # Skip invalid ObjectIds
    
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
    
    # Update jobs - add this shipment_id to their shipment_ids list
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

@api_router.get("/shipments", response_model=List[ShipmentResponse])
async def get_shipments(
    status: Optional[str] = None,
    courier: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    # Customers cannot view shipments
    if user["role"] == "customer":
        return []
    
    query = {}
    if status:
        query["status"] = status
    if courier:
        query["courier"] = courier
    
    shipments = await db.shipments.find(query).sort("created_at", -1).to_list(1000)
    
    response = []
    for shipment in shipments:
        # Get creator name
        creator = await db.users.find_one({"_id": ObjectId(shipment["created_by"])})
        creator_name = creator["full_name"] if creator else "Unknown"
        
        # Get job summaries
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
        
        response.append(ShipmentResponse(
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
        ))
    
    return response

@api_router.get("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def get_shipment(shipment_id: str, user: dict = Depends(get_current_user)):
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    # Get creator name
    creator = await db.users.find_one({"_id": ObjectId(shipment["created_by"])})
    creator_name = creator["full_name"] if creator else "Unknown"
    
    # Get job summaries
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

@api_router.put("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def update_shipment(shipment_id: str, update: ShipmentUpdate, user: dict = Depends(require_admin)):
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    # Validate status if provided
    if "status" in update_data and update_data["status"] not in SHIPMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {SHIPMENT_STATUSES}")
    
    await db.shipments.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": update_data}
    )
    
    return await get_shipment(shipment_id, user)

@api_router.put("/shipments/{shipment_id}/status")
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
    
    # Update shipment status
    await db.shipments.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": {"status": status, "updated_at": datetime.utcnow()}}
    )
    
    # Cascade status to jobs if requested
    jobs_updated = 0
    if cascade_to_jobs and shipment.get("job_ids"):
        # Map shipment status to job status based on shipment type
        shipment_type = shipment.get("shipment_type", "")
        
        # Different status mappings based on shipment type
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

@api_router.put("/shipments/{shipment_id}/jobs", response_model=ShipmentResponse)
async def update_shipment_jobs(
    shipment_id: str, 
    jobs_update: ShipmentJobsUpdate, 
    user: dict = Depends(require_admin)
):
    """Add or replace jobs in a shipment"""
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    # Get currently assigned job_ids
    old_job_ids = set(shipment.get("job_ids", []))
    new_job_ids = set(jobs_update.job_ids)
    
    # Find jobs to add (new jobs not in old list)
    jobs_to_add = new_job_ids - old_job_ids
    # Find jobs to remove (old jobs not in new list)
    jobs_to_remove = old_job_ids - new_job_ids
    
    # Remove this shipment from jobs being removed
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
    
    # Validate new job_ids and calculate totals
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
                # Add shipment to job if not already present
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
    
    # Update shipment
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

@api_router.delete("/shipments/{shipment_id}")
async def delete_shipment(shipment_id: str, user: dict = Depends(require_admin)):
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    # Remove shipment_id from all associated jobs
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

@api_router.get("/shipments/config/options")
async def get_shipment_options(user: dict = Depends(get_current_user)):
    """Get available options for shipment creation (types, couriers, addresses)"""
    # Get all branches for address options
    branches = await db.branches.find({"is_active": True}).to_list(100)
    address_options = [b["name"] for b in branches]
    address_options.extend(["HK Lab", "GRS Switzerland", "Customer"])
    
    return {
        "shipment_types": SHIPMENT_TYPES,
        "couriers": COURIERS,
        "statuses": SHIPMENT_STATUSES,
        "job_statuses": JOB_STATUSES,
        "address_options": list(set(address_options))
    }

# ============== VERBAL FINDINGS ENDPOINTS ==============

@api_router.post("/jobs/{job_id}/verbal-findings", response_model=JobResponse)
async def add_verbal_finding(job_id: str, finding: VerbalFindingCreate, user: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Verify stone exists in job
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

# ============== NOTIFICATION ENDPOINTS ==============

# Email notification types mapped to job statuses
EMAIL_NOTIFICATION_TYPES = {
    "stones_accepted": {
        "status": "stones_accepted",
        "subject": "Job #{job_number}: Stones Received - GRS Global",
        "description": "Initial drop-off confirmation with stones table and fees"
    },
    "verbal_uploaded": {
        "status": "verbal_uploaded",
        "subject": "Job #{job_number} - Certificate #{cert_id}: Verbal Results - GRS Global",
        "description": "Lab findings with verbal results table"
    },
    "stones_returned": {
        "status": "stones_returned",
        "subject": "Job #{job_number}: Stones Ready for Collection - GRS Global",
        "description": "Notice that stones have returned to office"
    },
    "cert_uploaded": {
        "status": "cert_uploaded",
        "subject": "Job #{job_number}: Certificate Scans Available - GRS Global",
        "description": "Digital certificate scans with download links"
    },
    "cert_returned": {
        "status": "cert_returned",
        "subject": "Job #{job_number}: Physical Certificates Ready - GRS Global",
        "description": "Final collection notice for physical certificates"
    }
}

class EmailPreviewRequest(BaseModel):
    notification_type: str
    recipient_email: Optional[str] = None

class SendEmailRequest(BaseModel):
    notification_type: str
    recipient_email: str
    custom_message: Optional[str] = None

def generate_stones_table_html(stones: list, include_fees: bool = False) -> str:
    """Generate HTML table for stones. Optionally include fees column."""
    rows = ""
    total_fee = 0
    for stone in stones:
        fee = stone.get('fee', 0)
        total_fee += fee
        fee_cell = f'<td style="padding: 12px; text-align: right;">${fee:,.2f}</td>' if include_fees else ''
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 12px; text-align: left;">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('shape', 'N/A')}</td>
            <td style="padding: 12px; text-align: right;">${stone.get('value', 0):,.2f}</td>
            {fee_cell}
        </tr>"""
    
    # Add total row if fees are included
    total_row = ""
    if include_fees:
        total_row = f"""
        <tr style="background-color: #f3f4f6; font-weight: bold;">
            <td colspan="5" style="padding: 12px; text-align: right;">Total Fee:</td>
            <td style="padding: 12px; text-align: right;">${total_fee:,.2f}</td>
        </tr>"""
    
    fee_header = '<th style="padding: 12px; text-align: right;">Fee</th>' if include_fees else ''
    
    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #102a43; color: white;">
                <th style="padding: 12px; text-align: left;">SKU</th>
                <th style="padding: 12px; text-align: left;">Weight</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: left;">Shape</th>
                <th style="padding: 12px; text-align: right;">Value</th>
                {fee_header}
            </tr>
        </thead>
        <tbody>{rows}{total_row}</tbody>
    </table>"""

def generate_verbal_results_table_html(stones: list, verbal_findings: list) -> str:
    """Generate HTML table for verbal results with full verbal data per stone"""
    rows = ""
    for stone in stones:
        vf = next((v for v in verbal_findings if v.get("stone_id") == stone.get("id")), None)
        
        # Get verbal data or defaults
        identification = vf.get('identification', 'Pending') if vf else 'Pending'
        color = vf.get('color', '-') if vf else '-'
        origin = vf.get('origin', '-') if vf else '-'
        treatment = vf.get('treatment', '-') if vf else '-'
        comment = vf.get('comment', '') if vf else ''
        
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 12px; text-align: left;">{identification}</td>
            <td style="padding: 12px; text-align: left;">{color}</td>
            <td style="padding: 12px; text-align: left;">{origin}</td>
            <td style="padding: 12px; text-align: left;">{treatment}</td>
            <td style="padding: 12px; text-align: left; font-size: 12px;">{comment}</td>
        </tr>"""
    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #102a43; color: white;">
                <th style="padding: 12px; text-align: left;">SKU</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: left;">Weight</th>
                <th style="padding: 12px; text-align: left;">Identification</th>
                <th style="padding: 12px; text-align: left;">Color</th>
                <th style="padding: 12px; text-align: left;">Origin</th>
                <th style="padding: 12px; text-align: left;">Treatment</th>
                <th style="padding: 12px; text-align: left;">Comments</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""

def generate_cert_scans_table_html(stones: list) -> str:
    """Generate HTML table with certificate scan download links"""
    rows = ""
    for stone in stones:
        scan_url = stone.get('certificate_scan_url', '')
        if scan_url:
            link = f'<a href="{scan_url}" style="color: #2563eb; text-decoration: none;">Download Certificate</a>'
        else:
            link = '<span style="color: #6b7280;">Not available</span>'
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 12px; text-align: left;">{link}</td>
        </tr>"""
    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #102a43; color: white;">
                <th style="padding: 12px; text-align: left;">SKU</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: left;">Weight</th>
                <th style="padding: 12px; text-align: left;">Certificate Scan</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""

def generate_fees_table_html(job: dict) -> str:
    """Generate HTML table for fees breakdown"""
    certificate_units = job.get('certificate_units', [])
    rows = ""
    for i, unit in enumerate(certificate_units, 1):
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">Certificate Unit {i}</td>
            <td style="padding: 12px; text-align: left;">{unit.get('type', 'Standard')}</td>
            <td style="padding: 12px; text-align: right;">${unit.get('fee', 0):,.2f}</td>
        </tr>"""
    
    # Add total row
    total_fee = job.get('total_fee', 0)
    rows += f"""
    <tr style="background-color: #f3f4f6; font-weight: bold;">
        <td colspan="2" style="padding: 12px; text-align: right;">Total Fee:</td>
        <td style="padding: 12px; text-align: right;">${total_fee:,.2f}</td>
    </tr>"""
    
    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #102a43; color: white;">
                <th style="padding: 12px; text-align: left;">Item</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: right;">Fee</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""

def build_notification_email_html(notification_type: str, job: dict, client: dict) -> tuple:
    """Build HTML email content for notification type. Returns (subject, html_body)"""
    job_number = job.get('job_number', 'N/A')
    client_name = client.get('name', 'Valued Customer')
    stones = job.get('stones', [])
    verbal_findings = job.get('verbal_findings', [])
    
    # Common header
    header = f"""
    <div style="background-color: #102a43; padding: 20px; text-align: center;">
        <h1 style="color: #fbbf24; margin: 0; font-size: 24px;">GRS Global</h1>
        <p style="color: white; margin: 5px 0 0 0; font-size: 14px;">Lab Logistics & ERP System</p>
    </div>
    """
    
    # Common footer
    footer = f"""
    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated notification from GRS Global.</p>
        <p>If you have any questions, please contact us.</p>
    </div>
    """
    
    if notification_type == "stones_accepted":
        subject = f"Job #{job_number}: Stones Received - GRS Global"
        stones_table = generate_stones_table_html(stones, include_fees=True)
        
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #102a43; margin-bottom: 20px;">Stones Received</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">Your stones have been received and logged into our system.</p>
            
            <h3 style="color: #102a43; margin-top: 30px;">Job Details</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Service Type:</strong> {job.get('service_type', 'Standard')}</p>
            <p><strong>Total Stones:</strong> {len(stones)}</p>
            
            <h3 style="color: #102a43; margin-top: 30px;">Stones Received</h3>
            {stones_table}
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                <em>The signed Memo-In document is attached to this email.</em>
            </p>
        </div>
        """
        
    elif notification_type == "verbal_uploaded":
        cert_ids = list(set([s.get('certificate_group', '') for s in stones if s.get('certificate_group')]))
        cert_id_str = ', '.join([str(c) for c in cert_ids]) if cert_ids else 'N/A'
        subject = f"Job #{job_number} - Certificate #{cert_id_str}: Verbal Results - GRS Global"
        verbal_table = generate_verbal_results_table_html(stones, verbal_findings)
        
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #102a43; margin-bottom: 20px;">Verbal Results Available</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">The verbal findings for your stones are now available.</p>
            
            <h3 style="color: #102a43; margin-top: 30px;">Job Details</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Certificate ID(s):</strong> {cert_id_str}</p>
            
            <h3 style="color: #102a43; margin-top: 30px;">Verbal Results</h3>
            {verbal_table}
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Please review the results above. Contact us if you have any questions.
            </p>
        </div>
        """
        
    elif notification_type == "stones_returned":
        subject = f"Job #{job_number}: Stones Ready for Collection - GRS Global"
        
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #102a43; margin-bottom: 20px;">Stones Ready for Collection</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">
                <strong>Your stones have returned to our Israel office and are ready for collection.</strong>
            </p>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="color: #92400e; margin: 0; font-weight: bold;">
                    Payment is required upon pickup.
                </p>
            </div>
            
            <h3 style="color: #102a43; margin-top: 30px;">Job Summary</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Total Stones:</strong> {len(stones)}</p>
            <p><strong>Total Fee Due:</strong> ${job.get('total_fee', 0):,.2f}</p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                <em>The invoice for the total fees is attached to this email.</em>
            </p>
        </div>
        """
        
    elif notification_type == "cert_uploaded":
        subject = f"Job #{job_number}: Certificate Scans Available - GRS Global"
        scans_table = generate_cert_scans_table_html(stones)
        
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #102a43; margin-bottom: 20px;">Certificate Scans Available</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">
                The digital certificate scans for your stones are now available for download.
            </p>
            
            <h3 style="color: #102a43; margin-top: 30px;">Certificate Downloads</h3>
            {scans_table}
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Click the download link next to each stone to view the certificate scan.
            </p>
        </div>
        """
        
    elif notification_type == "cert_returned":
        subject = f"Job #{job_number}: Physical Certificates Ready - GRS Global"
        
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #102a43; margin-bottom: 20px;">Physical Certificates Ready</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">
                <strong>Your physical certificates have arrived at our office and are ready for final collection.</strong>
            </p>
            
            <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
                <p style="color: #065f46; margin: 0;">
                    Please visit our office to collect your certificates along with your stones.
                </p>
            </div>
            
            <h3 style="color: #102a43; margin-top: 30px;">Job Summary</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Total Stones:</strong> {len(stones)}</p>
            <p><strong>Total Certificates:</strong> {len([s for s in stones if s.get('certificate_scan_url')])}</p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Thank you for choosing GRS Global for your gemstone certification needs.
            </p>
        </div>
        """
    else:
        subject = f"Job #{job_number}: Update - GRS Global"
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #102a43;">Job Update</h2>
            <p>Dear {client_name},</p>
            <p>Your job #{job_number} has been updated. Please log in to view details.</p>
        </div>
        """
    
    # Combine into full HTML email
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            {header}
            {body}
            {footer}
        </div>
    </body>
    </html>
    """
    
    return subject, html_body

@api_router.get("/jobs/{job_id}/notifications/preview/{notification_type}")
async def preview_notification(job_id: str, notification_type: str, user: dict = Depends(require_admin)):
    """Preview email notification content without sending"""
    if notification_type not in EMAIL_NOTIFICATION_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid notification type. Must be one of: {list(EMAIL_NOTIFICATION_TYPES.keys())}"
        )
    
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    subject, html_body = build_notification_email_html(notification_type, job, client)
    
    # Determine attachments needed
    attachments = []
    if notification_type == "stones_accepted" and job.get("signed_memo_url"):
        attachments.append({
            "type": "signed_memo",
            "name": "Signed_Memo.pdf",
            "url": job.get("signed_memo_url")
        })
    elif notification_type == "stones_returned" and job.get("lab_invoice_url"):
        attachments.append({
            "type": "invoice",
            "name": "Invoice.pdf",
            "url": job.get("lab_invoice_url")
        })
    
    return {
        "notification_type": notification_type,
        "description": EMAIL_NOTIFICATION_TYPES[notification_type]["description"],
        "job_number": job.get("job_number"),
        "recipient_email": client.get("email"),
        "recipient_name": client.get("name"),
        "subject": subject,
        "html_body": html_body,
        "attachments": attachments,
        "can_send": bool(resend.api_key),
        "current_status": job.get("status")
    }

@api_router.post("/jobs/{job_id}/notifications/send/{notification_type}")
async def send_notification_email(
    job_id: str, 
    notification_type: str, 
    request: SendEmailRequest,
    user: dict = Depends(require_admin)
):
    """Send email notification to client"""
    if notification_type not in EMAIL_NOTIFICATION_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid notification type. Must be one of: {list(EMAIL_NOTIFICATION_TYPES.keys())}"
        )
    
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    subject, html_body = build_notification_email_html(notification_type, job, client)
    
    # Prepare attachments
    attachments_for_email = []
    attachment_info = []
    
    if notification_type == "stones_accepted" and job.get("signed_memo_url"):
        attachment_info.append({"type": "signed_memo", "url": job.get("signed_memo_url")})
    elif notification_type == "stones_returned" and job.get("lab_invoice_url"):
        attachment_info.append({"type": "invoice", "url": job.get("lab_invoice_url")})
    
    # Download attachments for email
    for att in attachment_info:
        try:
            # For Cloudinary URLs or base64, handle appropriately
            if att["url"].startswith("http"):
                # Download file from URL
                import httpx
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.get(att["url"])
                    if response.status_code == 200:
                        content = response.content
                        filename = f"{att['type']}.pdf"
                        attachments_for_email.append({
                            "filename": filename,
                            "content": list(content)  # Resend expects list of bytes
                        })
        except Exception as e:
            logger.warning(f"Failed to download attachment {att['type']}: {e}")
    
    # Log the notification
    notification_log = {
        "id": str(uuid.uuid4()),
        "notification_type": notification_type,
        "sent_at": datetime.utcnow(),
        "sent_by": user["full_name"],
        "recipient_email": request.recipient_email,
        "subject": subject,
        "status": "pending"
    }
    
    # Send email via Resend
    if resend.api_key:
        try:
            email_params = {
                "from": SENDER_EMAIL,
                "to": [request.recipient_email],
                "subject": subject,
                "html": html_body
            }
            
            if attachments_for_email:
                email_params["attachments"] = attachments_for_email
            
            response = resend.Emails.send(email_params)
            
            notification_log["status"] = "sent"
            notification_log["resend_id"] = response.get("id") if isinstance(response, dict) else str(response)
            
            logger.info(f"Email sent successfully to {request.recipient_email} - ID: {notification_log['resend_id']}")
            
        except Exception as e:
            notification_log["status"] = "failed"
            notification_log["error"] = str(e)
            logger.error(f"Failed to send email: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    else:
        # Mock mode - log but don't send
        notification_log["status"] = "mocked"
        logger.info(f"[MOCK EMAIL] To: {request.recipient_email} - Subject: {subject}")
    
    # Update job with notification log
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$push": {"notification_log": notification_log},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    return {
        "message": f"Notification sent successfully" if notification_log["status"] == "sent" else f"Notification logged (status: {notification_log['status']})",
        "notification_id": notification_log["id"],
        "status": notification_log["status"],
        "recipient": request.recipient_email,
        "subject": subject
    }

@api_router.get("/jobs/{job_id}/notifications/status")
async def get_notification_status(job_id: str, user: dict = Depends(get_current_user)):
    """Get notification status for a job - which notifications are pending/sent"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    current_status = job.get("status")
    notification_log = job.get("notification_log", [])
    
    # Determine which notifications are available based on status
    status_to_notifications = {
        "stones_accepted": ["stones_accepted"],
        "verbal_uploaded": ["stones_accepted", "verbal_uploaded"],
        "stones_returned": ["stones_accepted", "verbal_uploaded", "stones_returned"],
        "cert_uploaded": ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded"],
        "cert_returned": ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned"],
        "done": ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned"]
    }
    
    available_notifications = status_to_notifications.get(current_status, [])
    
    # Check which have been sent
    sent_notifications = {nl["notification_type"] for nl in notification_log if nl.get("status") in ["sent", "mocked"]}
    
    notification_statuses = []
    for notif_type in EMAIL_NOTIFICATION_TYPES.keys():
        notif_info = EMAIL_NOTIFICATION_TYPES[notif_type]
        is_available = notif_type in available_notifications
        is_sent = notif_type in sent_notifications
        
        # Get last sent info
        last_sent = None
        for nl in reversed(notification_log):
            if nl.get("notification_type") == notif_type:
                last_sent = {
                    "sent_at": nl.get("sent_at"),
                    "sent_by": nl.get("sent_by"),
                    "status": nl.get("status"),
                    "recipient": nl.get("recipient_email")
                }
                break
        
        notification_statuses.append({
            "type": notif_type,
            "description": notif_info["description"],
            "status_trigger": notif_info["status"],
            "is_available": is_available,
            "is_sent": is_sent,
            "can_send": is_available,
            "last_sent": last_sent
        })
    
    return {
        "job_id": job_id,
        "job_number": job.get("job_number"),
        "current_status": current_status,
        "notifications": notification_statuses
    }

# ============== DOCUMENT UPLOAD ENDPOINTS ==============

@api_router.post("/jobs/{job_id}/documents")
async def upload_document(job_id: str, document: DocumentUpload, user: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    doc_entry = {
        "id": str(uuid.uuid4()),
        "document_type": document.document_type,
        "stone_id": document.stone_id,
        "filename": document.filename,
        "file_base64": document.file_base64,
        "uploaded_by": user["full_name"],
        "uploaded_at": datetime.utcnow()
    }
    
    # If it's a certificate scan for a specific stone, update that stone
    if document.stone_id and document.document_type == "certificate_scan":
        await db.jobs.update_one(
            {"_id": ObjectId(job_id), "stones.id": document.stone_id},
            {"$set": {"stones.$.certificate_scan": document.file_base64}}
        )
    
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$push": {"documents": doc_entry},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    return {"message": "Document uploaded successfully", "document_id": doc_entry["id"]}

@api_router.get("/jobs/{job_id}/documents")
async def get_job_documents(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job.get("documents", [])

# ============== CLOUDINARY UPLOAD ENDPOINTS ==============

ALLOWED_FOLDER_PREFIXES = ("certificates", "memos", "uploads", "invoices")

@api_router.get("/cloudinary/signature")
async def generate_cloudinary_signature(
    resource_type: str = Query("image", enum=["image", "raw"]),
    folder: str = Query("uploads"),
    user: dict = Depends(require_admin)
):
    """Generate a signed upload signature for Cloudinary.
    resource_type: 'image' for images, 'raw' for PDFs and other files
    folder: destination folder (certificates, memos, uploads)
    """
    # Validate folder - accepts both 'uploads' and 'uploads/' prefixes
    folder_base = folder.split('/')[0] if '/' in folder else folder.rstrip('/')
    if folder_base not in ALLOWED_FOLDER_PREFIXES:
        raise HTTPException(status_code=400, detail="Invalid folder path")
    
    timestamp = int(time.time())
    params = {
        "timestamp": timestamp,
        "folder": folder,
        "type": "upload",
    }
    
    signature = cloudinary.utils.api_sign_request(
        params,
        os.getenv("CLOUDINARY_API_SECRET")
    )
    
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.getenv("CLOUDINARY_CLOUD_NAME"),
        "api_key": os.getenv("CLOUDINARY_API_KEY"),
        "folder": folder,
        "resource_type": resource_type,
        "type": "upload"
    }

class CloudinaryDeleteRequest(BaseModel):
    public_id: str
    resource_type: str = "image"  # image or raw

@api_router.post("/cloudinary/delete")
async def delete_cloudinary_file(request: CloudinaryDeleteRequest, user: dict = Depends(require_admin)):
    """Delete a file from Cloudinary"""
    try:
        result = cloudinary.uploader.destroy(
            request.public_id, 
            resource_type=request.resource_type,
            invalidate=True
        )
        return {"message": "File deleted", "result": result}
    except Exception as e:
        logger.error(f"Cloudinary delete error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

# ============== PDF GENERATION ENDPOINTS ==============

def download_logo():
    """Download logo image for PDF generation"""
    try:
        with urllib.request.urlopen(FULL_LOGO_URL, timeout=10) as response:
            return BytesIO(response.read())
    except:
        return None

@api_router.get("/jobs/{job_id}/pdf/memo-in")
async def generate_memo_in_pdf(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#1a365d'))
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=6)
    
    elements = []
    
    # Logo
    logo_data = download_logo()
    if logo_data:
        logo = RLImage(logo_data, width=2*inch, height=0.8*inch)
        elements.append(logo)
    
    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"MEMO-IN RECEIPT", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {job['created_at'].strftime('%Y-%m-%d %H:%M')}", header_style))
    elements.append(Paragraph(f"Client: {client['name'] if client else 'N/A'}", header_style))
    elements.append(Paragraph(f"Service Type: {job['service_type']}", header_style))
    elements.append(Spacer(1, 0.3*inch))
    
    # Stones table
    table_data = [['#', 'SKU', 'Type', 'Weight (ct)', 'Shape', 'Value (USD)']]
    for i, stone in enumerate(job.get('stones', []), 1):
        table_data.append([
            str(i),
            stone['sku'],
            stone['stone_type'],
            f"{stone['weight']:.3f}",
            stone['shape'],
            f"${stone['value']:,.2f}"
        ])
    
    table = Table(table_data, colWidths=[0.5*inch, 1.5*inch, 1*inch, 1*inch, 1*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"Total Stones: {job['total_stones']}", header_style))
    elements.append(Paragraph(f"Total Declared Value: ${job['total_value']:,.2f}", header_style))
    
    # Footer with branch address
    elements.append(Spacer(1, 0.5*inch))
    if branch:
        elements.append(Paragraph(f"Office: {branch['name']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
        elements.append(Paragraph(f"{branch['address']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=memo_in_job_{job['job_number']}.pdf"}
    )

@api_router.get("/jobs/{job_id}/pdf/invoice")
async def generate_invoice_pdf(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#1a365d'))
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=6)
    
    elements = []
    
    # Logo
    logo_data = download_logo()
    if logo_data:
        logo = RLImage(logo_data, width=2*inch, height=0.8*inch)
        elements.append(logo)
    
    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"INVOICE", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}", header_style))
    elements.append(Paragraph(f"Client: {client['name'] if client else 'N/A'}", header_style))
    elements.append(Paragraph(f"Service Type: {job['service_type']}", header_style))
    elements.append(Spacer(1, 0.3*inch))
    
    # Invoice items table
    table_data = [['#', 'SKU', 'Value (USD)', 'Color Test', 'Fee (USD)']]
    for i, stone in enumerate(job.get('stones', []), 1):
        table_data.append([
            str(i),
            stone['sku'],
            f"${stone['value']:,.2f}",
            'Yes (+$50)' if stone['color_stability_test'] else 'No',
            f"${stone['fee']:.2f}"
        ])
    
    # Add total row
    table_data.append(['', '', '', 'TOTAL:', f"${job['total_fee']:.2f}"])
    
    table = Table(table_data, colWidths=[0.5*inch, 1.8*inch, 1.2*inch, 1.2*inch, 1*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('FONTNAME', (-2, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (-2, -1), (-1, -1), colors.HexColor('#e2e8f0')),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"Payment is due upon collection of stones.", header_style))
    
    # Footer with branch address
    elements.append(Spacer(1, 0.5*inch))
    if branch:
        elements.append(Paragraph(f"Office: {branch['name']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
        elements.append(Paragraph(f"{branch['address']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_job_{job['job_number']}.pdf"}
    )

@api_router.get("/jobs/{job_id}/pdf/shipment")
async def generate_shipment_pdf(job_id: str, user: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#1a365d'))
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=6)
    
    elements = []
    
    # Logo
    logo_data = download_logo()
    if logo_data:
        logo = RLImage(logo_data, width=2*inch, height=0.8*inch)
        elements.append(logo)
    
    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"SHIPMENT DOCUMENT", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}", header_style))
    elements.append(Spacer(1, 0.2*inch))
    
    # From/To addresses
    if branch:
        elements.append(Paragraph(f"<b>FROM:</b> {branch['address']}", header_style))
        elements.append(Paragraph(f"<b>TO:</b> GRS Gemresearch Lab HK", header_style))
    elements.append(Spacer(1, 0.3*inch))
    
    # Stones table
    table_data = [['#', 'SKU', 'Type', 'Weight (ct)', 'Shape', 'Value (USD)']]
    for i, stone in enumerate(job.get('stones', []), 1):
        table_data.append([
            str(i),
            stone['sku'],
            stone['stone_type'],
            f"{stone['weight']:.3f}",
            stone['shape'],
            f"${stone['value']:,.2f}"
        ])
    
    table = Table(table_data, colWidths=[0.5*inch, 1.5*inch, 1*inch, 1*inch, 1*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"Total Stones: {job['total_stones']}", header_style))
    elements.append(Paragraph(f"Total Declared Value: ${job['total_value']:,.2f}", header_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=shipment_job_{job['job_number']}.pdf"}
    )

# ============== PRICING CONFIG ENDPOINT ==============

class PricingUpdateRequest(BaseModel):
    brackets: List[dict]
    color_stability_fee: float
    service_types: List[str] = ["Express", "Normal", "Recheck"]

@api_router.get("/pricing")
async def get_pricing_config(user: dict = Depends(get_current_user)):
    """Get pricing configuration from database or defaults"""
    pricing = await db.pricing_config.find_one({"type": "pricing"})
    
    if pricing:
        return {
            "brackets": pricing.get("brackets", []),
            "color_stability_fee": pricing.get("color_stability_fee", COLOR_STABILITY_FEE),
            "service_types": pricing.get("service_types", ["Express", "Normal", "Recheck"])
        }
    
    # Return defaults
    brackets = [
        {
            "min_value": b["min"],
            "max_value": b["max"],
            "express_fee": b["express"],
            "normal_fee": b["normal"],
            "recheck_fee": b["recheck"]
        }
        for b in PRICING_BRACKETS
    ]
    return {
        "brackets": brackets,
        "color_stability_fee": COLOR_STABILITY_FEE,
        "service_types": ["Express", "Normal", "Recheck"]
    }

@api_router.put("/pricing")
async def update_pricing_config(data: PricingUpdateRequest, user: dict = Depends(require_admin)):
    """Update pricing configuration"""
    await db.pricing_config.update_one(
        {"type": "pricing"},
        {"$set": {
            "brackets": data.brackets,
            "color_stability_fee": data.color_stability_fee,
            "service_types": data.service_types,
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )
    
    return {"message": "Pricing configuration updated successfully"}

# ============== USERS MANAGEMENT (Super Admin) ==============

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(user: dict = Depends(require_super_admin)):
    users = await db.users.find().to_list(1000)
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

@api_router.put("/users/{user_id}/role")
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

# ============== DASHBOARD STATS ==============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    query = {}
    if user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")
    elif user["role"] == "customer":
        # Use client_id from user record, fallback to email lookup
        user_client_id = user.get("client_id")
        if user_client_id:
            query["client_id"] = user_client_id
        else:
            client = await db.clients.find_one({"email": user["email"]})
            if client:
                query["client_id"] = str(client["_id"])
    
    total_jobs = await db.jobs.count_documents(query)
    active_jobs = await db.jobs.count_documents({**query, "status": {"$nin": ["delivered"]}})
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": None,
            "total_value": {"$sum": "$total_value"},
            "total_fee": {"$sum": "$total_fee"},
            "total_stones": {"$sum": "$total_stones"}
        }}
    ]
    
    agg_result = await db.jobs.aggregate(pipeline).to_list(1)
    totals = agg_result[0] if agg_result else {"total_value": 0, "total_fee": 0, "total_stones": 0}
    
    # Status breakdown
    status_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_result = await db.jobs.aggregate(status_pipeline).to_list(20)
    status_breakdown = {s["_id"]: s["count"] for s in status_result}
    
    # Total clients count - only for admins
    client_query = {}
    if user["role"] == "branch_admin":
        client_query["branch_id"] = user.get("branch_id")
    
    # Customers see 1 (their own client), admins see all
    if user["role"] == "customer":
        total_clients = 1
    else:
        total_clients = await db.clients.count_documents(client_query)
    
    return {
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "total_value": totals.get("total_value", 0),
        "total_fee": totals.get("total_fee", 0),
        "total_stones": totals.get("total_stones", 0),
        "total_clients": total_clients,
        "jobs_by_status": status_breakdown
    }

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "Bashari Lab Logistics ERP API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
