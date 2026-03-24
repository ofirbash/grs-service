from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime
from bson import ObjectId
import uuid
import os
import logging

from database import db
from auth import require_admin

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
TRANZILLA_TERMINAL = os.getenv("TRANZILLA_TERMINAL", "")
TRANZILLA_PASSWORD = os.getenv("TRANZILLA_PASSWORD", "")

router = APIRouter()


@router.get("/exchange-rate")
async def get_exchange_rate():
    """Get live USD to ILS exchange rate"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
            data = resp.json()
            return {"usd_to_ils": data["rates"].get("ILS", 3.65), "source": "exchangerate-api.com"}
    except Exception:
        return {"usd_to_ils": 3.65, "source": "fallback"}


@router.post("/jobs/{job_id}/payment-token")
async def generate_payment_token(job_id: str, user: dict = Depends(require_admin)):
    """Generate a unique payment token for a job"""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing_token = job.get("payment_token")
    if existing_token:
        return {"payment_token": existing_token, "payment_url": f"{FRONTEND_URL}/pay?token={existing_token}"}

    payment_token = str(uuid.uuid4())
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"payment_token": payment_token, "updated_at": datetime.utcnow()}}
    )
    return {"payment_token": payment_token, "payment_url": f"{FRONTEND_URL}/pay?token={payment_token}"}


@router.get("/payment/{token}")
async def get_payment_details(token: str):
    """Public endpoint - get job payment details by token (no auth needed)"""
    job = await db.jobs.find_one({"payment_token": token})
    if not job:
        raise HTTPException(status_code=404, detail="Invalid payment link")

    if job.get("payment_status") == "paid":
        return {"status": "already_paid", "job_number": job["job_number"]}

    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})

    stones_summary = []
    for s in job.get("stones", []):
        stones_summary.append({
            "sku": s.get("sku", ""),
            "stone_type": s.get("stone_type", ""),
            "weight": s.get("weight", 0),
            "fee": s.get("fee", 0),
            "actual_fee": s.get("actual_fee"),
        })

    total_fee = sum(s.get("actual_fee") or s.get("fee", 0) for s in job.get("stones", []))

    return {
        "status": "pending",
        "job_number": job["job_number"],
        "client_name": client["name"] if client else "N/A",
        "branch_name": branch["name"] if branch else "N/A",
        "service_type": job.get("service_type", ""),
        "total_stones": job.get("total_stones", 0),
        "total_fee": total_fee,
        "stones": stones_summary,
        "tranzilla_terminal": TRANZILLA_TERMINAL,
        "has_tranzilla": bool(TRANZILLA_TERMINAL),
    }


@router.post("/payment/{token}/notify")
async def payment_notify(token: str, request: Request):
    """Tranzilla notify callback - records payment result"""
    job = await db.jobs.find_one({"payment_token": token})
    if not job:
        return {"status": "error", "detail": "Invalid token"}

    form_data = await request.form()
    response_code = form_data.get("Response", "")
    transaction_id = form_data.get("index", form_data.get("ConfirmationCode", ""))

    if str(response_code) == "000":
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$set": {
                "payment_status": "paid",
                "payment_date": datetime.utcnow(),
                "payment_transaction_id": str(transaction_id),
                "payment_currency": form_data.get("currency", ""),
                "payment_amount": form_data.get("sum", ""),
                "updated_at": datetime.utcnow()
            }}
        )
        logger.info(f"Payment received for job #{job['job_number']} - txn: {transaction_id}")
    else:
        logger.warning(f"Payment failed for job #{job['job_number']} - response: {response_code}")

    return {"status": "ok"}


@router.post("/payment/{token}/simulate")
async def simulate_payment(token: str):
    """Test mode - simulate successful payment (when no Tranzilla credentials)"""
    job = await db.jobs.find_one({"payment_token": token})
    if not job:
        raise HTTPException(status_code=404, detail="Invalid payment link")

    await db.jobs.update_one(
        {"_id": job["_id"]},
        {"$set": {
            "payment_status": "paid",
            "payment_date": datetime.utcnow(),
            "payment_transaction_id": f"TEST-{uuid.uuid4().hex[:8]}",
            "payment_currency": "USD",
            "payment_amount": str(sum(s.get("actual_fee") or s.get("fee", 0) for s in job.get("stones", []))),
            "updated_at": datetime.utcnow()
        }}
    )
    return {"status": "paid", "message": "Payment simulated successfully"}
