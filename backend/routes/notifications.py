from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from bson import ObjectId
import uuid
import os
import logging

import resend

from database import db
from auth import get_current_user, require_admin
from models import SendEmailRequest
from email_templates import build_notification_email_html
from sms import send_sms, check_balance, build_sms_message

logger = logging.getLogger(__name__)

SENDER_EMAIL = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")

EMAIL_NOTIFICATION_TYPES = {
    "stones_accepted": {
        "status": "stones_accepted",
        "subject": "Job #{job_number}: Stones Received - Bashari Lab-Direct",
        "description": "Initial drop-off confirmation with stones table and fees"
    },
    "verbal_uploaded": {
        "status": "verbal_uploaded",
        "subject": "Job #{job_number} - Certificate #{cert_id}: Verbal Results - Bashari Lab-Direct",
        "description": "Lab findings with verbal results table"
    },
    "stones_returned": {
        "status": "stones_returned",
        "subject": "Job #{job_number}: Stones Ready for Collection - Bashari Lab-Direct",
        "description": "Notice that stones have returned to office"
    },
    "cert_uploaded": {
        "status": "cert_uploaded",
        "subject": "Job #{job_number}: Certificate Scans Available - Bashari Lab-Direct",
        "description": "Digital certificate scans with download links"
    },
    "cert_returned": {
        "status": "cert_returned",
        "subject": "Job #{job_number}: Physical Certificates Ready - Bashari Lab-Direct",
        "description": "Final collection notice for physical certificates"
    }
}

router = APIRouter()


@router.get("/jobs/{job_id}/notifications/preview/{notification_type}")
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

    payment_url = ""
    if notification_type == "stones_returned":
        pt = job.get("payment_token")
        if not pt:
            pt = str(uuid.uuid4())
            await db.jobs.update_one({"_id": job["_id"]}, {"$set": {"payment_token": pt}})
        if FRONTEND_URL:
            payment_url = f"{FRONTEND_URL}/pay?token={pt}"

    subject, html_body = build_notification_email_html(notification_type, job, client, payment_url)

    attachments = []
    if notification_type == "stones_accepted" and job.get("signed_memo_url"):
        attachments.append({
            "type": "signed_memo",
            "name": "Signed_Memo.pdf",
            "url": job.get("signed_memo_url")
        })
    elif notification_type == "stones_returned":
        if job.get("invoice_url"):
            attachments.append({
                "type": "invoice",
                "name": job.get("invoice_filename", "Invoice.pdf"),
                "url": job.get("invoice_url")
            })
        elif job.get("lab_invoice_url"):
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


@router.post("/jobs/{job_id}/notifications/send/{notification_type}")
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

    send_payment_url = ""
    if notification_type == "stones_returned":
        pt2 = job.get("payment_token")
        if not pt2:
            pt2 = str(uuid.uuid4())
            await db.jobs.update_one({"_id": job["_id"]}, {"$set": {"payment_token": pt2}})
        if FRONTEND_URL:
            send_payment_url = f"{FRONTEND_URL}/pay?token={pt2}"

    subject, html_body = build_notification_email_html(notification_type, job, client, send_payment_url)

    attachments_for_email = []
    attachment_info = []

    if notification_type == "stones_accepted" and job.get("signed_memo_url"):
        attachment_info.append({"type": "signed_memo", "url": job.get("signed_memo_url")})
    elif notification_type == "stones_returned":
        if job.get("invoice_url"):
            attachment_info.append({"type": "invoice", "url": job.get("invoice_url"), "filename": job.get("invoice_filename", "Invoice.pdf")})
        elif job.get("lab_invoice_url"):
            attachment_info.append({"type": "invoice", "url": job.get("lab_invoice_url")})

    for att in attachment_info:
        try:
            if att["url"].startswith("http"):
                import httpx
                async with httpx.AsyncClient() as http_client:
                    response = await http_client.get(att["url"])
                    if response.status_code == 200:
                        content = response.content
                        filename = att.get("filename", f"{att['type']}.pdf")
                        attachments_for_email.append({
                            "filename": filename,
                            "content": list(content)
                        })
        except Exception as e:
            logger.warning(f"Failed to download attachment {att['type']}: {e}")

    notification_log = {
        "id": str(uuid.uuid4()),
        "notification_type": notification_type,
        "sent_at": datetime.utcnow(),
        "sent_by": user["full_name"],
        "recipient_email": request.recipient_email,
        "subject": subject,
        "status": "pending"
    }

    if resend.api_key:
        try:
            branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})
            branch_email = branch.get("email") if branch else None
            branch_sender = branch.get("sender_name", branch.get("name", "GRS")) if branch else "GRS"
            sender = f"{branch_sender} <{branch_email}>" if branch_email else SENDER_EMAIL

            email_params = {
                "from": sender,
                "reply_to": sender,
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
        notification_log["status"] = "mocked"
        logger.info(f"[MOCK EMAIL] To: {request.recipient_email} - Subject: {subject}")

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


@router.get("/jobs/{job_id}/notifications/status")
async def get_notification_status(job_id: str, user: dict = Depends(get_current_user)):
    """Get notification status for a job - which notifications are pending/sent"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = job.get("status")
    notification_log = job.get("notification_log", [])

    status_to_notifications = {
        "stones_accepted": ["stones_accepted"],
        "sent_to_lab": ["stones_accepted"],
        "verbal_uploaded": ["stones_accepted", "verbal_uploaded"],
        "stones_returned": ["stones_accepted", "verbal_uploaded", "stones_returned"],
        "cert_uploaded": ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded"],
        "cert_returned": ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned"],
        "done": ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned"]
    }

    available_notifications = status_to_notifications.get(current_status, [])

    sent_notifications = {nl["notification_type"] for nl in notification_log if nl.get("status") in ["sent", "mocked"]}

    notification_statuses = []
    for notif_type in EMAIL_NOTIFICATION_TYPES.keys():
        notif_info = EMAIL_NOTIFICATION_TYPES[notif_type]
        is_available = notif_type in available_notifications
        is_sent = notif_type in sent_notifications

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


@router.get("/sms/balance")
async def get_sms_balance(user: dict = Depends(require_admin)):
    """Check SMS4Free remaining balance"""
    result = await check_balance()
    return result


@router.post("/jobs/{job_id}/sms/send/{notification_type}")
async def send_sms_notification(job_id: str, notification_type: str, user: dict = Depends(require_admin)):
    """Send SMS notification to client for a job"""
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

    phone = client.get("phone") or client.get("secondary_phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Client has no phone number on file")

    message = build_sms_message(notification_type, job, client)
    result = await send_sms(phone, message)

    # Log the SMS in the job's notification_log
    sms_log = {
        "id": str(uuid.uuid4()),
        "notification_type": f"sms_{notification_type}",
        "channel": "sms",
        "sent_at": datetime.utcnow(),
        "sent_by": user.get("email", "admin"),
        "recipient_phone": phone,
        "message": message,
        "status": "sent" if result["success"] else "failed",
        "error": result.get("message") if not result["success"] else None,
    }

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$push": {"notification_log": sms_log},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    if not result["success"]:
        raise HTTPException(status_code=502, detail=f"SMS send failed: {result['message']}")

    return {
        "message": "SMS sent successfully",
        "recipient_phone": phone,
        "sms_text": message,
        "status": "sent",
    }


@router.get("/jobs/{job_id}/sms/preview/{notification_type}")
async def preview_sms(job_id: str, notification_type: str, user: dict = Depends(require_admin)):
    """Preview SMS content without sending"""
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

    phone = client.get("phone") or client.get("secondary_phone")
    message = build_sms_message(notification_type, job, client)

    return {
        "notification_type": notification_type,
        "recipient_phone": phone or "No phone on file",
        "recipient_name": client.get("name"),
        "message": message,
        "char_count": len(message),
        "has_phone": bool(phone),
    }


# ---------------------------------------------------------------------------
# Welcome email (bulk-able) — separate from job-scoped notifications
# ---------------------------------------------------------------------------

from pydantic import BaseModel
from typing import List


class WelcomeBulkRequest(BaseModel):
    client_ids: List[str]


@router.get("/notifications/welcome/preview")
async def preview_welcome_email(client_id: str = "", user: dict = Depends(require_admin)):
    """Return a rendered preview of the welcome email. If client_id is supplied, personalises it."""
    client = {"name": "Valued Customer", "email": "customer@example.com"}
    if client_id:
        found = await db.clients.find_one({"_id": ObjectId(client_id)})
        if found:
            client = {
                "name": found.get("name") or "Valued Customer",
                "email": found.get("email") or "",
            }

    subject, html_body = build_notification_email_html(
        "welcome", job={"job_number": "—", "stones": []}, client=client
    )
    return {
        "subject": subject,
        "html_body": html_body,
        "recipient_email": client.get("email", ""),
        "recipient_name": client.get("name", ""),
    }


@router.post("/notifications/welcome/bulk")
async def send_welcome_emails_bulk(payload: WelcomeBulkRequest, user: dict = Depends(require_admin)):
    """Send the welcome email to a list of clients (admin-selected).

    Returns a per-client summary so the admin UI can show which ones sent
    successfully and which failed (missing email, Resend error, etc.).
    """
    if not payload.client_ids:
        raise HTTPException(status_code=400, detail="client_ids is required")

    results = []
    for raw_id in payload.client_ids:
        try:
            client = await db.clients.find_one({"_id": ObjectId(raw_id)})
        except Exception:
            results.append({"client_id": raw_id, "status": "failed", "error": "Invalid client id"})
            continue

        if not client:
            results.append({"client_id": raw_id, "status": "failed", "error": "Client not found"})
            continue

        recipient = client.get("email")
        if not recipient:
            results.append({
                "client_id": raw_id,
                "name": client.get("name"),
                "status": "skipped",
                "error": "No email on file",
            })
            continue

        subject, html_body = build_notification_email_html(
            "welcome",
            job={"job_number": "—", "stones": []},
            client={"name": client.get("name"), "email": recipient},
        )

        log_entry = {
            "id": str(uuid.uuid4()),
            "notification_type": "welcome",
            "sent_at": datetime.utcnow(),
            "sent_by": user.get("full_name") or user.get("email"),
            "recipient_email": recipient,
            "subject": subject,
            "status": "pending",
        }

        if resend.api_key:
            try:
                branch_sender = SENDER_EMAIL
                if client.get("branch_id"):
                    branch = await db.branches.find_one({"_id": ObjectId(client["branch_id"])})
                    if branch and branch.get("email"):
                        branch_sender = f"{branch.get('sender_name', branch.get('name', 'GRS'))} <{branch['email']}>"

                response = resend.Emails.send({
                    "from": branch_sender,
                    "reply_to": branch_sender,
                    "to": [recipient],
                    "subject": subject,
                    "html": html_body,
                })
                log_entry["status"] = "sent"
                log_entry["resend_id"] = response.get("id") if isinstance(response, dict) else str(response)
                results.append({
                    "client_id": raw_id,
                    "name": client.get("name"),
                    "email": recipient,
                    "status": "sent",
                })
            except Exception as e:
                log_entry["status"] = "failed"
                log_entry["error"] = str(e)
                logger.error(f"Welcome email to {recipient} failed: {e}")
                results.append({
                    "client_id": raw_id,
                    "name": client.get("name"),
                    "email": recipient,
                    "status": "failed",
                    "error": str(e),
                })
        else:
            log_entry["status"] = "mocked"
            logger.info(f"[MOCK WELCOME EMAIL] To: {recipient}")
            results.append({
                "client_id": raw_id,
                "name": client.get("name"),
                "email": recipient,
                "status": "mocked",
            })

        # Record on the client document so admin has an audit trail
        await db.clients.update_one(
            {"_id": ObjectId(raw_id)},
            {
                "$push": {"notification_log": log_entry},
                "$set": {"last_welcome_sent_at": datetime.utcnow()},
            },
        )

    summary = {
        "sent": sum(1 for r in results if r["status"] == "sent"),
        "mocked": sum(1 for r in results if r["status"] == "mocked"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
    }

    return {"results": results, "summary": summary}

