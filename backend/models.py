from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any, Union
from datetime import datetime


# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "customer"
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
    client_id: Optional[str] = None
    phone: Optional[str] = None
    email_verified: bool = False
    two_factor_enabled: bool = False
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    requires_2fa: bool = False


class SetupPasswordRequest(BaseModel):
    token: str
    password: str


# Branch Models
class BranchCreate(BaseModel):
    name: str
    code: str
    address: str
    phone: Optional[str] = None
    email: Optional[str] = None


class BranchResponse(BaseModel):
    id: str
    name: str
    code: str
    address: str
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
    user_id: Optional[str] = None
    created_at: datetime


# Stone Models
class StoneCreate(BaseModel):
    stone_type: str
    weight: float
    shape: str = "Other"
    value: float
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
    actual_fee: Optional[float] = None
    position: int
    certificate_group: Optional[int] = None
    mounted: Optional[bool] = None
    verbal_findings: Optional[Union[str, Dict[str, Any]]] = None
    certificate_scan_url: Optional[str] = None
    job_id: Optional[str] = None
    job_number: Optional[int] = None
    # Partial-return lifecycle (only populated on jobs created after the feature launched)
    stone_status: Optional[str] = None   # "at_office" | "at_lab" | "returned"
    cert_status: Optional[str] = None    # "pending" | "delivered"


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


class StructuredVerbalFindings(BaseModel):
    certificate_id: Optional[str] = None
    weight: Optional[float] = None
    identification: Optional[str] = None
    color: Optional[str] = None
    origin: Optional[str] = None
    comment: Optional[str] = None


class VerbalFindingsUpdate(BaseModel):
    verbal_findings: Optional[str] = None
    structured_findings: Optional[StructuredVerbalFindings] = None


class StoneFeeUpdate(BaseModel):
    actual_fee: Optional[float] = None
    color_stability_test: Optional[bool] = None
    mounted: Optional[bool] = None


# Certificate Unit Models
class CertificateUnitCreate(BaseModel):
    stones: List[StoneCreate]


# Job Models
class JobCreate(BaseModel):
    client_id: str
    branch_id: str
    service_type: str
    notes: Optional[str] = None
    certificate_units: List[CertificateUnitCreate]


class JobStatusUpdate(BaseModel):
    status: str


class JobUpdate(BaseModel):
    notes: Optional[str] = None
    status: Optional[str] = None
    discount: Optional[float] = None


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
    discount: Optional[float] = None
    shipment_ids: List[str] = []
    shipment_info: Optional[Dict[str, Any]] = None
    signed_memo_url: Optional[str] = None
    signed_memo_filename: Optional[str] = None
    lab_invoice_url: Optional[str] = None
    lab_invoice_filename: Optional[str] = None
    invoice_url: Optional[str] = None
    invoice_filename: Optional[str] = None
    payment_status: Optional[str] = None
    payment_token: Optional[str] = None
    payment_url: Optional[str] = None
    payments: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime


class StoneGroupUpdate(BaseModel):
    stone_ids: List[str]
    group_number: int


class StoneUngroupUpdate(BaseModel):
    stone_ids: List[str]


class MemoUpload(BaseModel):
    filename: str
    file_data: str


class AddStoneRequest(BaseModel):
    stone_type: str
    weight: float
    shape: str = "Other"
    value: float
    color_stability_test: bool = False


# Document Upload Model
class DocumentUpload(BaseModel):
    job_id: str
    stone_id: Optional[str] = None
    document_type: str
    file_base64: str
    filename: str


# Shipment Models
class ShipmentCreate(BaseModel):
    shipment_type: str
    courier: str
    source_address: str
    destination_address: str
    tracking_number: Optional[str] = None
    date_sent: Optional[datetime] = None
    job_ids: List[str] = []
    # Optional: restrict the shipment to specific stones within the included jobs.
    # Empty/missing => all stones of the included jobs (back-compat).
    stone_ids: List[str] = []
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
    stone_ids: List[str] = []
    jobs: Optional[List[Dict[str, Any]]] = None
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
    fees: dict = {}


class PricingConfigResponse(BaseModel):
    brackets: List[PricingBracket]
    color_stability_fee: float


class PricingUpdateRequest(BaseModel):
    brackets: List[dict]
    color_stability_fee: float
    mounted_jewellery_fee: float = 50
    service_types: List[str] = ["Express", "Normal", "Recheck"]
    stone_types: Optional[List[str]] = None
    shapes: Optional[List[str]] = None
    payment_destinations: Optional[List[str]] = None


# Dropdown Settings
class DropdownOption(BaseModel):
    value: str
    stone_types: List[str] = ["all"]


class DropdownSettingsUpdate(BaseModel):
    field_name: str
    options: List[DropdownOption]


class DropdownSettingsResponse(BaseModel):
    identification: List[DropdownOption]
    color: List[DropdownOption]
    origin: List[DropdownOption]
    comment: List[DropdownOption]


class GroupCertificateScanUpload(BaseModel):
    job_id: str
    certificate_group: int
    filename: str
    file_data: str


class CertificateScanUpload(BaseModel):
    filename: str
    file_data: str


# Notification Models
class EmailPreviewRequest(BaseModel):
    notification_type: str
    recipient_email: Optional[str] = None


class SendEmailRequest(BaseModel):
    notification_type: str
    recipient_email: str
    custom_message: Optional[str] = None


# Cloudinary Models
class CloudinaryDeleteRequest(BaseModel):
    public_id: str
    resource_type: str = "image"


# Address Models
class AddressCreate(BaseModel):
    name: str
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class AddressUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


# Admin User Models
class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str
    branch_id: Optional[str] = None
    phone: Optional[str] = None


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
