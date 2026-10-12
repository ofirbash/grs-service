"""Expected Verbal Date: to-lab shipment date_sent + service-type turnaround, or admin override."""
from datetime import datetime, timedelta
from typing import Optional

from database import db

TO_LAB_TYPE = "send_stones_to_lab"
DEFAULT_TURNAROUND_DAYS = {"Express": 8, "Normal": 30}
RECEIVED_STATUSES = {"verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned", "done"}
VERBAL_NOTIFICATION_TYPES = {"verbal_uploaded", "sms_verbal_uploaded"}


async def get_turnaround_map() -> dict:
    pricing = await db.pricing_config.find_one({"type": "pricing"}, {"service_turnaround_days": 1})
    if pricing and "service_turnaround_days" in pricing:
        return pricing.get("service_turnaround_days") or {}
    return dict(DEFAULT_TURNAROUND_DAYS)


def _as_datetime(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


async def latest_lab_sends(job_ids: list) -> dict:
    """job_id -> (latest date_sent, shipment_number) across non-cancelled to-lab shipments."""
    if not job_ids:
        return {}
    wanted = set(job_ids)
    shipments = await db.shipments.find(
        {"job_ids": {"$in": job_ids}, "shipment_type": TO_LAB_TYPE, "status": {"$ne": "cancelled"}},
        {"job_ids": 1, "date_sent": 1, "shipment_number": 1},
    ).to_list(10000)
    out: dict = {}
    for s in shipments:
        sent = _as_datetime(s.get("date_sent"))
        if not sent:
            continue
        for jid in s.get("job_ids", []):
            if jid in wanted and (jid not in out or sent > out[jid][0]):
                out[jid] = (sent, s.get("shipment_number"))
    return out


def verbal_received(job: dict) -> bool:
    if job.get("status") in RECEIVED_STATUSES:
        return True
    return any(
        n.get("notification_type") in VERBAL_NOTIFICATION_TYPES and n.get("status", "sent") != "failed"
        for n in job.get("notification_log", []) or []
    )


def compute_expected(job: dict, send: Optional[tuple], turnaround: dict) -> dict:
    auto = None
    if send:
        days = turnaround.get(job.get("service_type"))
        if isinstance(days, (int, float)) and days >= 0:
            auto = (send[0].date() + timedelta(days=int(days))).isoformat()
    override = job.get("expected_verbal_date_override")
    return {
        "date": override or auto,
        "auto_date": auto,
        "overridden": bool(override),
        "sent_date": send[0].date().isoformat() if send else None,
        "shipment_number": send[1] if send else None,
        "received": verbal_received(job),
    }


async def expected_for_jobs(jobs: list) -> dict:
    turnaround = await get_turnaround_map()
    sends = await latest_lab_sends([str(j["_id"]) for j in jobs])
    return {str(j["_id"]): compute_expected(j, sends.get(str(j["_id"])), turnaround) for j in jobs}
