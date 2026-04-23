"""Manual payment recording: admin marks a job as paid via wire transfer
or cash with payment ID, destination and optional client notification.
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from bson import ObjectId
from pydantic import BaseModel
from typing import Optional
import os
import uuid
import logging

import resend

from database import db
from auth import require_admin, get_current_user
from email_templates import build_notification_email_html
from sms import send_sms, build_sms_message

logger = logging.getLogger(__name__)
router = APIRouter()

SENDER_EMAIL = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")


def _generate_payment_id() -> str:
    """Generate a short, human-friendly payment ID like 'PMT-8F3A2B9D'."""
    return f"PMT-{uuid.uuid4().hex[:8].upper()}"


class ManualPaymentRequest(BaseModel):
    amount: float
    destination: str
    note: Optional[str] = ""
    notify_email: bool = True
    notify_sms: bool = True


def _sum_paid(payments: list) -> float:
    return sum(p.get("amount", 0) or 0 for p in payments or [])


@router.post("/jobs/{job_id}/manual-payment")
async def record_manual_payment(
    job_id: str,
    payload: ManualPaymentRequest,
    user: dict = Depends(require_admin),
):
    """Record a manual payment (wire or cash) against a job.

    - Generates a unique payment ID (PMT-XXXXXXXX)
    - Appends to job.payments[] (supports partial payments)
    - Rejects over-payment (amount > balance due)
    - Updates payment_status to "paid" once cumulative paid >= net total
    - Optionally emails + SMS the client a receipt
    """
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    total_fee = job.get("total_fee", 0) or 0
    discount = job.get("discount", 0) or 0
    net_total = max(0, total_fee - discount)

    existing_payments = job.get("payments", []) or []
    already_paid = _sum_paid(existing_payments)
    balance = max(0, net_total - already_paid)

    if payload.amount > balance + 0.0001:
        raise HTTPException(
            status_code=400,
            detail=f"Amount exceeds balance due. Balance: ${balance:,.2f}",
        )

    payment = {
        "id": _generate_payment_id(),
        "job_id": job_id,
        "method": "manual",
        "amount": payload.amount,
        "destination": payload.destination,
        "note": payload.note or "",
        "recorded_at": datetime.utcnow(),
        "recorded_by": user.get("full_name") or user.get("email") or "admin",
    }

    new_total_paid = already_paid + payload.amount
    is_fully_paid = new_total_paid + 0.0001 >= net_total

    update_doc = {
        "$push": {"payments": payment},
        "$set": {
            "payment_status": "paid" if is_fully_paid else "partial",
            "updated_at": datetime.utcnow(),
        },
    }
    if is_fully_paid:
        update_doc["$set"]["payment_date"] = datetime.utcnow()

    await db.jobs.update_one({"_id": ObjectId(job_id)}, update_doc)

    # Fire-and-forget notifications (best-effort — don't block payment recording on failure)
    notify_results = {"email": None, "sms": None}

    # Prepare a lightweight client context
    client_doc = {}
    if job.get("client_id"):
        try:
            c = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
            if c:
                client_doc = {
                    "name": c.get("name", ""),
                    "email": c.get("email", ""),
                    "phone": c.get("phone", ""),
                }
        except Exception:
            pass

    # Merge latest payment info onto job dict for template rendering
    job_for_template = dict(job)
    job_for_template["latest_payment"] = payment
    job_for_template["payment_total_paid"] = new_total_paid

    if payload.notify_email and client_doc.get("email"):
        try:
            subject, html_body = build_notification_email_html(
                "manual_payment_receipt", job_for_template, client_doc
            )
            if resend.api_key:
                response = resend.Emails.send({
                    "from": SENDER_EMAIL,
                    "reply_to": SENDER_EMAIL,
                    "to": [client_doc["email"]],
                    "subject": subject,
                    "html": html_body,
                })
                notify_results["email"] = {
                    "status": "sent",
                    "resend_id": response.get("id") if isinstance(response, dict) else str(response),
                    "recipient": client_doc["email"],
                }
            else:
                notify_results["email"] = {
                    "status": "mocked",
                    "recipient": client_doc["email"],
                }
                logger.info(f"[MOCK PAYMENT EMAIL] {subject} → {client_doc['email']}")
        except Exception as e:
            logger.error(f"Failed to send payment receipt email: {e}")
            notify_results["email"] = {"status": "failed", "error": str(e)}

    if payload.notify_sms and client_doc.get("phone"):
        try:
            message = build_sms_message("manual_payment_receipt", job_for_template, client_doc)
            sms_res = await send_sms(client_doc["phone"], message)
            notify_results["sms"] = sms_res
        except Exception as e:
            logger.error(f"Failed to send payment receipt SMS: {e}")
            notify_results["sms"] = {"status": "failed", "error": str(e)}

    # Build return payload with sanitised datetime strings
    payment_out = dict(payment)
    payment_out["recorded_at"] = payment["recorded_at"].isoformat()

    return {
        "payment": payment_out,
        "payment_status": "paid" if is_fully_paid else "partial",
        "net_total": net_total,
        "total_paid": new_total_paid,
        "balance": max(0, net_total - new_total_paid),
        "notifications": notify_results,
    }


@router.get("/receipts/{payment_id}")
async def get_receipt(payment_id: str, user: dict = Depends(get_current_user)):
    """Return a structured receipt for rendering client-side. Requires login.

    Clients can only view receipts for their own jobs; admins see all.
    """
    # Find job containing this payment
    job = await db.jobs.find_one({"payments.id": payment_id})
    if not job:
        raise HTTPException(status_code=404, detail="Receipt not found")

    # Authorisation
    role = user.get("role")
    if role == "customer":
        user_client_id = user.get("client_id")
        if not user_client_id or str(job.get("client_id")) != str(user_client_id):
            raise HTTPException(status_code=403, detail="You can only view receipts for your own jobs")

    payment = next((p for p in job.get("payments", []) if p.get("id") == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Receipt not found")

    total_fee = job.get("total_fee", 0) or 0
    discount = job.get("discount", 0) or 0
    net_total = max(0, total_fee - discount)
    total_paid = _sum_paid(job.get("payments", []))
    balance = max(0, net_total - total_paid)

    # Client info for context (hide email/phone for non-admins)
    client_info = None
    if job.get("client_id"):
        try:
            c = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
            if c:
                client_info = {
                    "name": c.get("name", ""),
                    "company": c.get("company", ""),
                }
        except Exception:
            pass

    # Stones breakdown (strip internal fields)
    stones_out = []
    for s in job.get("stones", []):
        stones_out.append({
            "sku": s.get("sku"),
            "stone_type": s.get("stone_type"),
            "weight": s.get("weight"),
            "shape": s.get("shape"),
            "value": s.get("value", 0),
            "fee": s.get("fee", 0),
            "certificate_group": s.get("certificate_group"),
        })

    return {
        "payment": {
            "id": payment["id"],
            "amount": payment.get("amount", 0),
            "destination": payment.get("destination"),
            "note": payment.get("note"),
            "method": payment.get("method"),
            "recorded_at": payment["recorded_at"].isoformat() if isinstance(payment.get("recorded_at"), datetime) else payment.get("recorded_at"),
            "recorded_by": payment.get("recorded_by"),
        },
        "job": {
            "id": str(job["_id"]),
            "job_number": job.get("job_number"),
            "total_fee": total_fee,
            "discount": discount,
            "net_total": net_total,
            "service_type": job.get("service_type"),
            "total_stones": job.get("total_stones", 0),
            "stones": stones_out,
        },
        "client": client_info,
        "totals": {
            "net_total": net_total,
            "total_paid": total_paid,
            "balance": balance,
            "is_fully_paid": balance <= 0,
        },
    }
