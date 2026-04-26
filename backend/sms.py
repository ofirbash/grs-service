import httpx
import os
import logging

logger = logging.getLogger(__name__)

SMS4FREE_URL = "https://api.sms4free.co.il/ApiSMS/v2/SendSMS"
SMS4FREE_BALANCE_URL = "https://api.sms4free.co.il/ApiSMS/AvailableSMS"

SMS4FREE_KEY = os.getenv("SMS4FREE_KEY", "")
SMS4FREE_USER = os.getenv("SMS4FREE_USER", "")
SMS4FREE_PASS = os.getenv("SMS4FREE_PASS", "")
SMS4FREE_SENDER = os.getenv("SMS4FREE_SENDER", "BASHARI-LAB")

FRONTEND_URL = os.getenv("FRONTEND_URL", "")

# Error code descriptions
SMS4FREE_ERRORS = {
    0: "General error",
    -1: "Invalid key, username or password",
    -2: "Invalid sender name or number — the sender must be pre-registered with SMS4Free (see your SMS4Free dashboard)",
    -3: "No recipients found",
    -4: "Insufficient SMS balance",
    -5: "Invalid message",
    -6: "Sender verification required",
}


def _normalise_sender(raw: str) -> str:
    """SMS4Free Israel rules: max 11 alphanumeric chars OR a phone number.
    Strip any hyphens / spaces / underscores defensively, then truncate.
    """
    if not raw:
        return ""
    cleaned = "".join(ch for ch in raw if ch.isalnum())
    return cleaned[:11]


async def send_sms(phone: str, message: str) -> dict:
    """Send SMS via SMS4Free API. Returns {success, status, message}."""
    if not SMS4FREE_KEY or not SMS4FREE_USER or not SMS4FREE_PASS:
        logger.warning("SMS4Free credentials not configured")
        return {"success": False, "status": -99, "message": "SMS not configured"}

    payload = {
        "key": SMS4FREE_KEY,
        "user": SMS4FREE_USER,
        "pass": SMS4FREE_PASS,
        "sender": _normalise_sender(SMS4FREE_SENDER),
        "recipient": phone,
        "msg": message,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(SMS4FREE_URL, json=payload, timeout=15)
            data = resp.json()
            status = data.get("status", 0)
            desc = data.get("message", "")

            if isinstance(status, int) and status > 0:
                logger.info(f"SMS sent to {phone}: {status} recipients")
                return {"success": True, "status": status, "message": desc}
            else:
                error_desc = SMS4FREE_ERRORS.get(status, desc or "Unknown error")
                logger.error(f"SMS failed to {phone}: status={status}, {error_desc}")
                return {"success": False, "status": status, "message": error_desc}

    except Exception as e:
        logger.error(f"SMS send error: {e}")
        return {"success": False, "status": -99, "message": str(e)}


async def check_balance() -> dict:
    """Check remaining SMS balance."""
    if not SMS4FREE_KEY or not SMS4FREE_USER or not SMS4FREE_PASS:
        return {"available": False, "balance": 0, "message": "SMS not configured"}

    payload = {
        "key": SMS4FREE_KEY,
        "user": SMS4FREE_USER,
        "pass": SMS4FREE_PASS,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(SMS4FREE_BALANCE_URL, json=payload, timeout=10)
            try:
                data = resp.json()
                balance = data.get("status", 0) if isinstance(data, dict) else int(resp.text.strip())
            except Exception:
                balance = int(resp.text.strip()) if resp.text.strip().lstrip('-').isdigit() else 0
            return {"available": True, "balance": balance}
    except Exception as e:
        logger.error(f"SMS balance check error: {e}")
        return {"available": False, "balance": 0, "message": str(e)}


def build_sms_message(notification_type: str, job: dict, client: dict) -> str:
    """Build SMS message text per notification type."""
    job_number = job.get("job_number", "?")
    total_stones = job.get("total_stones", 0)
    total_fee = job.get("total_fee", 0)
    discount = job.get("discount", 0) or 0
    net_total = max(0, total_fee - discount)
    client_name = client.get("name", "")

    # Link for customer portal
    login_url = f"{FRONTEND_URL}/login" if FRONTEND_URL else ""
    link_text = f"\nView details: {login_url}" if login_url else ""

    messages = {
        "stones_accepted": (
            f"Bashari Lab-Direct: Job #{job_number} - Your {total_stones} stone(s) "
            f"have been received and accepted for testing. "
            f"Est. fees: ${net_total:,.0f}.{link_text}"
        ),
        "verbal_uploaded": (
            f"Bashari Lab-Direct: Job #{job_number} - Verbal lab results "
            f"are now available for your {total_stones} stone(s). "
            f"Log in to review findings.{link_text}"
        ),
        "stones_returned": (
            f"Bashari Lab-Direct: Job #{job_number} - Your stones are ready "
            f"for collection at our office. "
            f"Total: ${net_total:,.0f}.{link_text}"
        ),
        "cert_uploaded": (
            f"Bashari Lab-Direct: Job #{job_number} - Digital certificate scans "
            f"are now available for download.{link_text}"
        ),
        "cert_returned": (
            f"Bashari Lab-Direct: Job #{job_number} - Physical certificates "
            f"are ready for collection at our office.{link_text}"
        ),
        "manual_payment_receipt": (
            f"Bashari Lab-Direct: Payment received for Job #{job_number}. "
            f"Receipt {job.get('latest_payment', {}).get('id', '')}. "
            f"Log in to view: {login_url}" if login_url
            else f"Bashari Lab-Direct: Payment received for Job #{job_number}. "
                 f"Receipt {job.get('latest_payment', {}).get('id', '')}."
        ),
    }

    return messages.get(notification_type, f"Bashari Lab-Direct: Job #{job_number} status update.{link_text}")
