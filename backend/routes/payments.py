from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime
from bson import ObjectId
import uuid
import os
import logging

import httpx

from database import db
from auth import require_admin

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
TRANZILA_TERMINAL = os.getenv("TRANZILA_TERMINAL", "")
TRANZILA_PW = os.getenv("TRANZILA_PW", "")
TRANZILA_APP_KEY = os.getenv("TRANZILA_APP_KEY", "")
TRANZILA_SECRET = os.getenv("TRANZILA_SECRET", "")

router = APIRouter()


@router.get("/exchange-rate")
async def get_exchange_rate():
    """Get live USD to ILS exchange rate"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
            data = resp.json()
            return {"usd_to_ils": data["rates"].get("ILS", 3.65), "source": "exchangerate-api.com"}
    except Exception:
        return {"usd_to_ils": 3.65, "source": "fallback"}


@router.post("/jobs/{job_id}/payment-token")
async def generate_payment_token(job_id: str, request: Request, user: dict = Depends(require_admin)):
    """Generate a unique payment token for a job. Supports adjustment payments for already-paid jobs."""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    is_adjustment = body.get("is_adjustment", False)
    adjustment_amount = body.get("adjustment_amount")

    # If job already paid and not an adjustment request, return existing token
    if job.get("payment_status") == "paid" and not is_adjustment:
        existing_token = job.get("payment_token")
        if existing_token:
            return {"payment_token": existing_token, "payment_url": f"{FRONTEND_URL}/pay?token={existing_token}"}

    # For adjustment payments on paid jobs, create a fresh token
    if is_adjustment and adjustment_amount is not None:
        payment_token = str(uuid.uuid4())
        await db.jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {
                "payment_token": payment_token,
                "payment_status": "pending",
                "payment_adjustment": True,
                "payment_adjustment_amount": float(adjustment_amount),
                "updated_at": datetime.utcnow()
            }}
        )
        return {"payment_token": payment_token, "payment_url": f"{FRONTEND_URL}/pay?token={payment_token}"}

    # Normal flow: return existing or create new
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

    is_adjustment = job.get("payment_adjustment", False)
    discount = job.get("discount", 0) or 0

    if is_adjustment and job.get("payment_adjustment_amount") is not None:
        total_fee = job["payment_adjustment_amount"]
    else:
        total_fee = sum(s.get("actual_fee") or s.get("fee", 0) for s in job.get("stones", []))
        total_fee = max(0, total_fee - discount)

    return {
        "status": "pending",
        "job_number": job["job_number"],
        "client_name": client["name"] if client else "N/A",
        "branch_name": branch["name"] if branch else "N/A",
        "service_type": job.get("service_type", ""),
        "total_stones": job.get("total_stones", 0),
        "total_fee": total_fee,
        "discount": discount if not is_adjustment else 0,
        "stones": stones_summary,
        "is_adjustment": is_adjustment,
        "tranzila_terminal": TRANZILA_TERMINAL,
        "has_tranzila": bool(TRANZILA_TERMINAL and TRANZILA_PW),
    }


@router.post("/payment/{token}/handshake")
async def create_payment_handshake(token: str, request: Request):
    """Create Tranzila handshake to get thtk token for secure iframe payment"""
    job = await db.jobs.find_one({"payment_token": token})
    if not job:
        raise HTTPException(status_code=404, detail="Invalid payment link")

    if job.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Job already paid")

    body = await request.json()
    currency = body.get("currency", "USD")
    exchange_rate = body.get("exchange_rate", 3.65)

    is_adjustment = job.get("payment_adjustment", False)
    discount = job.get("discount", 0) or 0

    if is_adjustment and job.get("payment_adjustment_amount") is not None:
        total_fee_usd = job["payment_adjustment_amount"]
    else:
        total_fee_usd = sum(s.get("actual_fee") or s.get("fee", 0) for s in job.get("stones", []))
        total_fee_usd = max(0, total_fee_usd - discount)

    if currency == "ILS":
        amount = round(total_fee_usd * exchange_rate, 2)
    else:
        amount = round(total_fee_usd, 2)

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    if not TRANZILA_TERMINAL or not TRANZILA_PW:
        raise HTTPException(status_code=500, detail="Tranzila not configured")

    handshake_url = f"https://api.tranzila.com/v1/handshake/create?supplier={TRANZILA_TERMINAL}&sum={amount}&TranzilaPW={TRANZILA_PW}"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(handshake_url, timeout=15)
            data = resp.text.strip()

            logger.info(f"Tranzila handshake response: {data}")

            thtk = data
            if thtk.startswith("thtk="):
                thtk = thtk[5:]

            if not thtk or "error" in thtk.lower():
                logger.error(f"Tranzila handshake failed: {data}")
                raise HTTPException(status_code=502, detail=f"Tranzila handshake failed: {data}")

            # Store handshake info on the job for audit
            await db.jobs.update_one(
                {"_id": job["_id"]},
                {"$set": {
                    "payment_handshake_thtk": thtk,
                    "payment_handshake_amount": amount,
                    "payment_handshake_currency": currency,
                    "payment_handshake_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }}
            )

            return {
                "thtk": thtk,
                "supplier": TRANZILA_TERMINAL,
                "sum": amount,
                "currency": currency,
                "currency_code": "1" if currency == "ILS" else "2",
            }

    except httpx.RequestError as e:
        logger.error(f"Tranzila handshake network error: {e}")
        raise HTTPException(status_code=502, detail="Failed to connect to Tranzila")


@router.post("/payment/{token}/notify")
async def payment_notify(token: str, request: Request):
    """Tranzila notify callback - records payment result (POST from Tranzila servers)"""
    job = await db.jobs.find_one({"payment_token": token})
    if not job:
        logger.warning(f"Payment notify for unknown token: {token}")
        return {"status": "error", "detail": "Invalid token"}

    # Try form data first (Tranzila sends POST form-encoded)
    try:
        form_data = await request.form()
        notify_data = dict(form_data)
    except Exception:
        try:
            notify_data = await request.json()
        except Exception:
            notify_data = {}

    response_code = str(notify_data.get("Response", notify_data.get("response", "")))
    transaction_id = notify_data.get("index", notify_data.get("ConfirmationCode", ""))
    paid_amount = notify_data.get("sum", "")
    paid_currency = notify_data.get("currency", "")
    ccno_last4 = notify_data.get("ccno", "")
    card_type = notify_data.get("cardtype", "")
    confirmation_code = notify_data.get("ConfirmationCode", "")

    logger.info(f"Tranzila notify for job #{job.get('job_number')}: response={response_code}, index={transaction_id}, sum={paid_amount}")

    if response_code == "000":
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$set": {
                "payment_status": "paid",
                "payment_date": datetime.utcnow(),
                "payment_transaction_id": str(transaction_id),
                "payment_confirmation_code": str(confirmation_code),
                "payment_currency": str(paid_currency),
                "payment_amount": str(paid_amount),
                "payment_card_last4": str(ccno_last4),
                "payment_card_type": str(card_type),
                "payment_raw_response": notify_data,
                "updated_at": datetime.utcnow()
            }}
        )
        logger.info(f"Payment SUCCESS for job #{job['job_number']} - txn: {transaction_id}, amount: {paid_amount}")
    else:
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$set": {
                "payment_last_attempt": datetime.utcnow(),
                "payment_last_response_code": response_code,
                "updated_at": datetime.utcnow()
            }}
        )
        logger.warning(f"Payment FAILED for job #{job['job_number']} - response: {response_code}")

    return {"status": "ok"}


@router.get("/payment/{token}/status")
async def check_payment_status(token: str):
    """Check if payment was completed (polled by frontend after iframe interaction)"""
    job = await db.jobs.find_one({"payment_token": token})
    if not job:
        raise HTTPException(status_code=404, detail="Invalid payment link")

    return {
        "status": job.get("payment_status", "pending"),
        "job_number": job["job_number"],
        "transaction_id": job.get("payment_transaction_id"),
        "paid_at": job.get("payment_date").isoformat() if job.get("payment_date") else None,
    }


@router.post("/payment/{token}/simulate")
async def simulate_payment(token: str):
    """Test mode - simulate successful payment"""
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
