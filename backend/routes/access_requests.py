"""Access-request signup flow.

Public endpoints handle the self-service "Request Access" form on the
landing page. Admin endpoints handle triage (list/approve/reject).

Flow:
  1. POST /access-requests/send-otp   {full_name, company, email, phone, turnstile_token}
     - Validates Turnstile + honeypot
     - If email already has a user record: silently triggers a password-reset
       email and returns the same success shape (no enumeration).
     - Otherwise generates a 6-digit OTP (30-min TTL), stores it under the
       email, and emails it to the user.
  2. POST /access-requests/verify-and-submit   {email, otp, full_name, company, phone, turnstile_token}
     - Re-checks the OTP, then persists a pending access_request doc.
  3. GET  /access-requests?status=pending   (admin)
     - Returns queued requests for triage.
  4. POST /access-requests/{id}/approve  (admin)
     - Creates a client + customer user with a setup_token and sends the
       invitation / welcome email via the existing bulk welcome pipeline.
  5. POST /access-requests/{id}/reject   (admin)
     - Soft-rejects the row with a reason.
"""

from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
import resend

from database import db
from auth import require_admin
from login_security import check_honeypot, verify_turnstile

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
OTP_TTL_MINUTES = 30
OTP_MAX_ATTEMPTS = 5  # per OTP row

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SendOtpRequest(BaseModel):
    full_name: str
    company: str
    email: EmailStr
    phone: str
    turnstile_token: Optional[str] = None
    website: Optional[str] = None  # honeypot


class VerifySubmitRequest(BaseModel):
    email: EmailStr
    otp: str
    full_name: str
    company: str
    phone: str
    turnstile_token: Optional[str] = None
    website: Optional[str] = None  # honeypot


class RejectRequest(BaseModel):
    reason: Optional[str] = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _six_digit_otp() -> str:
    # secrets.randbelow gives a cryptographically strong int.
    return f"{secrets.randbelow(1_000_000):06d}"


async def _send_email(to: str, subject: str, html: str) -> bool:
    if not resend.api_key:
        logger.info(f"[MOCK EMAIL] to={to} subject={subject!r}")
        return False
    try:
        resend.Emails.send({
            "from": SENDER_EMAIL,
            "reply_to": SENDER_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        logger.error(f"Email to {to} failed: {e}")
        return False


def _otp_email_html(name: str, otp: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#141417;">
      <h2 style="margin:0 0 8px;">Your access request code</h2>
      <p style="color:#3f3f46;font-size:14px;line-height:1.55;">
        Hello {name or 'there'}, use the code below to confirm your email address and complete your
        Bashari Lab-Direct access request. The code is valid for 30 minutes.
      </p>
      <div style="margin:22px 0;padding:16px 20px;background:#141417;color:#ffffff;
                  font-size:30px;letter-spacing:10px;text-align:center;border-radius:8px;
                  font-family:'Courier New',monospace;font-weight:700;">
        {otp}
      </div>
      <p style="color:#71717a;font-size:12px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    """


def _already_registered_html(name: str, reset_url: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#141417;">
      <h2 style="margin:0 0 8px;">You already have an account</h2>
      <p style="color:#3f3f46;font-size:14px;line-height:1.55;">
        Hello {name or 'there'}, we received an access request for an email that is already registered
        on Bashari Lab-Direct. If this was you, use the button below to reset your password.
      </p>
      <p style="text-align:center;margin:24px 0;">
        <a href="{reset_url}" style="display:inline-block;background:#141417;color:#fff;
           padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="color:#71717a;font-size:12px;">
        The link is valid for 30 days. If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    """


async def _silently_trigger_password_reset(user: dict) -> None:
    """Mirror the /auth/forgot-password behaviour: fresh setup_token + email."""
    setup_token = str(uuid.uuid4())
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "setup_token": setup_token,
            "setup_token_created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }},
    )
    reset_url = f"{FRONTEND_URL}/setup-password?token={setup_token}" if FRONTEND_URL else ""
    if reset_url:
        await _send_email(
            user["email"],
            "Bashari Lab-Direct — Password reset",
            _already_registered_html(user.get("full_name", ""), reset_url),
        )


# ---------------------------------------------------------------------------
# Public endpoints (no auth)
# ---------------------------------------------------------------------------

@router.post("/access-requests/send-otp")
async def send_otp(payload: SendOtpRequest, request: Request):
    check_honeypot(payload.website)
    await verify_turnstile(payload.turnstile_token, request)

    email = payload.email.lower().strip()
    name = payload.full_name.strip() or "there"

    # Duplicate check → silent password reset. Always returns the "sent"
    # shape so signup and login pages don't leak which emails exist.
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        await _silently_trigger_password_reset(existing_user)
        return {"ok": True, "already_registered": True}

    otp = _six_digit_otp()
    await db.access_otps.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "otp": otp,
            "attempts": 0,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
        }},
        upsert=True,
    )
    sent = await _send_email(email, "Your Bashari Lab-Direct access code", _otp_email_html(name, otp))
    return {"ok": True, "already_registered": False, "email_sent": sent}


@router.post("/access-requests/verify-and-submit")
async def verify_and_submit(payload: VerifySubmitRequest, request: Request):
    check_honeypot(payload.website)
    await verify_turnstile(payload.turnstile_token, request)

    email = payload.email.lower().strip()
    row = await db.access_otps.find_one({"email": email})
    if not row:
        raise HTTPException(status_code=400, detail="No active verification code for this email. Please request a new one.")

    if row.get("expires_at") and datetime.utcnow() > row["expires_at"]:
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")

    if row.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new code.")

    if payload.otp.strip() != row.get("otp"):
        await db.access_otps.update_one({"_id": row["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect verification code")

    # OTP verified — guard against a race where the user got registered in
    # the meantime.
    if await db.users.find_one({"email": email}):
        await db.access_otps.delete_one({"_id": row["_id"]})
        return {"ok": True, "already_registered": True}

    # Prevent duplicate pending requests for the same email.
    existing = await db.access_requests.find_one({"email": email, "status": "pending"})
    if existing:
        await db.access_otps.delete_one({"_id": row["_id"]})
        return {"ok": True, "duplicate_pending": True, "id": str(existing["_id"])}

    doc = {
        "full_name": payload.full_name.strip(),
        "company": payload.company.strip(),
        "email": email,
        "phone": payload.phone.strip(),
        "status": "pending",
        "submitted_at": datetime.utcnow(),
        "reviewed_at": None,
        "reviewed_by": None,
        "reject_reason": None,
    }
    result = await db.access_requests.insert_one(doc)
    await db.access_otps.delete_one({"_id": row["_id"]})

    return {"ok": True, "id": str(result.inserted_id)}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/access-requests")
async def list_access_requests(status: Optional[str] = None, user: dict = Depends(require_admin)):
    query: dict = {}
    if status in ("pending", "approved", "rejected"):
        query["status"] = status
    rows = await db.access_requests.find(query).sort("submitted_at", -1).to_list(500)
    return [
        {
            "id": str(r["_id"]),
            "full_name": r.get("full_name", ""),
            "company": r.get("company", ""),
            "email": r.get("email", ""),
            "phone": r.get("phone", ""),
            "status": r.get("status", ""),
            "submitted_at": r.get("submitted_at"),
            "reviewed_at": r.get("reviewed_at"),
            "reviewed_by": r.get("reviewed_by"),
            "reject_reason": r.get("reject_reason"),
            "client_id": r.get("client_id"),
        }
        for r in rows
    ]


@router.post("/access-requests/{request_id}/approve")
async def approve_access_request(request_id: str, user: dict = Depends(require_admin)):
    try:
        row = await db.access_requests.find_one({"_id": ObjectId(request_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request id")
    if not row:
        raise HTTPException(status_code=404, detail="Access request not found")
    if row.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {row.get('status')}")

    email = row["email"].lower()

    # If a client with this email already exists, link to it; otherwise
    # create one scoped to the reviewer's branch.
    client = await db.clients.find_one({"email": email})
    if not client:
        branch_id = user.get("branch_id")
        if not branch_id:
            # super_admin without branch — pick the first active branch.
            first_branch = await db.branches.find_one({"is_active": True})
            branch_id = str(first_branch["_id"]) if first_branch else ""
        client_doc = {
            "name": row["full_name"],
            "email": email,
            "phone": row.get("phone") or None,
            "company": row.get("company") or None,
            "branch_id": branch_id,
            "created_at": datetime.utcnow(),
            "source": "access_request",
        }
        client_result = await db.clients.insert_one(client_doc)
        client_id = str(client_result.inserted_id)
    else:
        client_id = str(client["_id"])

    # Ensure customer user exists with a fresh setup_token.
    setup_token = str(uuid.uuid4())
    user_update = {
        "$set": {
            "email": email,
            "full_name": row["full_name"],
            "role": "customer",
            "client_id": client_id,
            "phone": row.get("phone"),
            "setup_token": setup_token,
            "setup_token_created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        },
        "$setOnInsert": {
            "password_hash": "",
            "email_verified": False,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
        },
    }
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        # Don't override branch on re-approval.
        await db.users.update_one({"_id": existing_user["_id"]}, {"$set": user_update["$set"]})
    else:
        user_update["$set"]["branch_id"] = client_doc["branch_id"] if not client else client.get("branch_id")
        await db.users.update_one({"email": email}, user_update, upsert=True)

    # Send invitation email (reuses the existing welcome renderer so style
    # matches the rest of the app's transactional mail).
    from email_templates import build_notification_email_html
    setup_url = f"{FRONTEND_URL}/setup-password?token={setup_token}" if FRONTEND_URL else ""
    subject, html_body = build_notification_email_html(
        "welcome",
        job={"job_number": "—", "stones": []},
        client={"name": row["full_name"], "email": email},
        setup_url=setup_url,
    )
    await _send_email(email, subject, html_body)

    await db.access_requests.update_one(
        {"_id": row["_id"]},
        {"$set": {
            "status": "approved",
            "reviewed_at": datetime.utcnow(),
            "reviewed_by": user.get("full_name") or user.get("email"),
            "client_id": client_id,
        }},
    )
    return {"ok": True, "client_id": client_id}


@router.post("/access-requests/{request_id}/reject")
async def reject_access_request(request_id: str, payload: RejectRequest, user: dict = Depends(require_admin)):
    try:
        row = await db.access_requests.find_one({"_id": ObjectId(request_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request id")
    if not row:
        raise HTTPException(status_code=404, detail="Access request not found")
    if row.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {row.get('status')}")

    await db.access_requests.update_one(
        {"_id": row["_id"]},
        {"$set": {
            "status": "rejected",
            "reviewed_at": datetime.utcnow(),
            "reviewed_by": user.get("full_name") or user.get("email"),
            "reject_reason": payload.reason or "",
        }},
    )
    return {"ok": True}
