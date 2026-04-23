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


def _compute_balance(job: dict) -> tuple:
    """Return (net_total, already_paid, balance) for a job."""
    total_fee = job.get("total_fee", 0) or 0
    discount = job.get("discount", 0) or 0
    net_total = max(0, total_fee - discount)
    already_paid = _sum_paid(job.get("payments", []) or [])
    balance = max(0, net_total - already_paid)
    return net_total, already_paid, balance


def _build_payment_record(job_id: str, payload: "ManualPaymentRequest", user: dict) -> dict:
    return {
        "id": _generate_payment_id(),
        "job_id": job_id,
        "method": "manual",
        "amount": payload.amount,
        "destination": payload.destination,
        "note": payload.note or "",
        "recorded_at": datetime.utcnow(),
        "recorded_by": user.get("full_name") or user.get("email") or "admin",
    }


async def _load_client_context(client_id: Optional[str]) -> dict:
    """Return a lightweight client dict for notification rendering."""
    if not client_id:
        return {}
    try:
        c = await db.clients.find_one({"_id": ObjectId(client_id)})
    except Exception:
        return {}
    if not c:
        return {}
    return {
        "name": c.get("name", ""),
        "email": c.get("email", ""),
        "phone": c.get("phone", ""),
    }


async def _send_payment_email(job_for_template: dict, client: dict) -> dict:
    try:
        subject, html_body = build_notification_email_html(
            "manual_payment_receipt", job_for_template, client
        )
        if not resend.api_key:
            logger.info(f"[MOCK PAYMENT EMAIL] {subject} → {client['email']}")
            return {"status": "mocked", "recipient": client["email"]}
        response = resend.Emails.send({
            "from": SENDER_EMAIL,
            "reply_to": SENDER_EMAIL,
            "to": [client["email"]],
            "subject": subject,
            "html": html_body,
        })
        return {
            "status": "sent",
            "resend_id": response.get("id") if isinstance(response, dict) else str(response),
            "recipient": client["email"],
        }
    except Exception as e:
        logger.error(f"Failed to send payment receipt email: {e}")
        return {"status": "failed", "error": str(e)}


async def _send_payment_sms(job_for_template: dict, client: dict) -> dict:
    try:
        message = build_sms_message("manual_payment_receipt", job_for_template, client)
        return await send_sms(client["phone"], message)
    except Exception as e:
        logger.error(f"Failed to send payment receipt SMS: {e}")
        return {"status": "failed", "error": str(e)}


@router.post("/jobs/{job_id}/manual-payment")
async def record_manual_payment(
    job_id: str,
    payload: ManualPaymentRequest,
    user: dict = Depends(require_admin),
):
    """Record a manual payment (wire or cash) against a job."""
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job id")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    net_total, already_paid, balance = _compute_balance(job)
    if payload.amount > balance + 0.0001:
        raise HTTPException(
            status_code=400,
            detail=f"Amount exceeds balance due. Balance: ${balance:,.2f}",
        )

    payment = _build_payment_record(job_id, payload, user)
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

    # Notifications (best-effort — don't block payment recording on failure)
    client_doc = await _load_client_context(job.get("client_id"))
    job_for_template = {**job, "latest_payment": payment, "payment_total_paid": new_total_paid}

    notify_results = {"email": None, "sms": None}
    if payload.notify_email and client_doc.get("email"):
        notify_results["email"] = await _send_payment_email(job_for_template, client_doc)
    if payload.notify_sms and client_doc.get("phone"):
        notify_results["sms"] = await _send_payment_sms(job_for_template, client_doc)

    payment_out = {**payment, "recorded_at": payment["recorded_at"].isoformat()}
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
