"""End-to-end test for the `job_notification_sent` activity row.

The notification routes only log to `activity_log` on *successful* sends
(failed-send rows would just clutter the timeline). Until now we couldn't
cover this path automatically because Resend (and SMS4Free) make real HTTP
calls. Here we patch the helpers to return a stub success response and
verify the activity row is written with the right shape.

Run: `pytest backend/tests/test_activity_notification.py -q` (no network).
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime
from typing import Any
from unittest.mock import patch

import pytest

# `backend/` must be on sys.path so `from routes.notifications import ...`
# resolves the same way it does at runtime.
_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from database import db  # noqa: E402
import routes.notifications as notif_routes  # noqa: E402


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def seeded(monkeypatch):
    """Insert a minimal admin + client + job into Mongo so the notification
    route has something to attach the log to. Cleans up at the end.

    Returns the ids the test needs."""
    admin_doc: dict[str, Any] = {
        "email": f"test-notify-{uuid.uuid4().hex[:6]}@example.com",
        "full_name": "Notify Test Admin",
        "role": "super_admin",
        "branch_id": None,
        "created_at": datetime.utcnow(),
    }
    client_doc: dict[str, Any] = {
        "name": f"TEST_NotifyClient_{uuid.uuid4().hex[:6]}",
        "email": "client@example.com",
        "phone": "+972500000000",
        "branch_id": None,
        "created_at": datetime.utcnow(),
    }
    admin_id = _run(db.users.insert_one(admin_doc)).inserted_id
    client_id = _run(db.clients.insert_one(client_doc)).inserted_id

    job_doc: dict[str, Any] = {
        "job_number": 99999,
        "client_id": str(client_id),
        "branch_id": None,
        "service_type": "Normal",
        "status": "stones_accepted",
        "notes": "",
        "stones": [],
        "verbal_findings": [],
        "notification_log": [],
        "documents": [],
        "total_stones": 0,
        "total_certificates": 0,
        "total_value": 0,
        "total_fee": 0,
        "created_by": str(admin_id),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    job_id = _run(db.jobs.insert_one(job_doc)).inserted_id

    yield {
        "admin": {**admin_doc, "_id": admin_id},
        "client_id": str(client_id),
        "job_id": str(job_id),
    }

    _run(db.activity_log.delete_many({"job_id": str(job_id)}))
    _run(db.jobs.delete_one({"_id": job_id}))
    _run(db.clients.delete_one({"_id": client_id}))
    _run(db.users.delete_one({"_id": admin_id}))


class _StubSendEmailRequest:
    """Mirrors the SendEmailRequest pydantic model — the notification route
    only reads two attributes off it, so a tiny stub is enough."""

    def __init__(self):
        self.recipient_email = "client@example.com"
        self.custom_message = ""


def test_email_send_writes_activity_row(seeded):
    """POST /jobs/{id}/notifications/send/{type} → expect a job_notification_sent
    activity row when the underlying Resend send succeeds."""
    job_id = seeded["job_id"]
    admin = seeded["admin"]

    # Patch the async email helper to skip the network and return a fake
    # Resend response. The route reads `.get('id')` off it so any dict works.
    async def _fake_send(_params, context="x"):  # noqa: ARG001
        return {"id": "resend-stub-12345"}

    # Patch `build_notification_email_html` to skip the (otherwise valid but
    # noisy) HTML build and let us focus on the activity-log side-effect.
    def _fake_build(_type, _job, _client, _payment_url=""):  # noqa: ARG001
        return ("Stub subject", "<p>stub</p>")

    request = _StubSendEmailRequest()

    with patch.object(notif_routes, "send_email_async", _fake_send), \
         patch.object(notif_routes, "build_notification_email_html", _fake_build):
        result = _run(notif_routes.send_notification_email(
            job_id=job_id,
            notification_type="stones_accepted",
            request=request,  # type: ignore[arg-type]
            user=admin,
        ))

    assert result["status"] == "sent"
    assert result["recipient"] == "client@example.com"

    # Activity row must exist and be tied to this job.
    rows = _run(db.activity_log.find({"job_id": job_id}).to_list(10))
    assert len(rows) == 1, f"expected exactly 1 activity row, got {len(rows)}"
    row = rows[0]
    assert row["action"] == "job_notification_sent"
    assert row["actor_name"] == admin["full_name"]
    assert row["metadata"].get("channel") == "email"
    assert row["metadata"].get("notification_type") == "stones_accepted"
    assert "stones_accepted" in (row.get("summary") or "")


def test_sms_send_writes_activity_row(seeded):
    """POST /jobs/{id}/sms/send/{type} → expect a job_notification_sent
    activity row when the underlying SMS helper reports success."""
    job_id = seeded["job_id"]
    admin = seeded["admin"]

    async def _fake_send_sms(_phone, _message):
        return {"success": True, "message": "ok"}

    def _fake_build_sms(_type, _job, _client):
        return "Stub SMS body"

    with patch.object(notif_routes, "send_sms", _fake_send_sms), \
         patch.object(notif_routes, "build_sms_message", _fake_build_sms):
        result = _run(notif_routes.send_sms_notification(
            job_id=job_id,
            notification_type="stones_accepted",
            user=admin,
        ))

    assert result["status"] == "sent"

    rows = _run(db.activity_log.find({"job_id": job_id, "action": "job_notification_sent"}).to_list(10))
    sms_rows = [r for r in rows if r.get("metadata", {}).get("channel") == "sms"]
    assert len(sms_rows) == 1, f"expected exactly 1 SMS activity row, got {len(sms_rows)}"
    assert sms_rows[0]["metadata"].get("notification_type") == "stones_accepted"


def test_failed_email_send_does_not_log_activity(seeded):
    """When `send_email_async` returns None (helper-soft-fail), the route
    raises a 500 — and no activity row should be written. The timeline
    is for successes only."""
    job_id = seeded["job_id"]
    admin = seeded["admin"]

    async def _fake_send_none(_params, context="x"):  # noqa: ARG001
        return None

    def _fake_build(_type, _job, _client, _payment_url=""):  # noqa: ARG001
        return ("Stub subject", "<p>stub</p>")

    # Backend route reaches into `resend.api_key` to choose between "failed"
    # and "mocked" status. Set it to a truthy stub so the route picks the
    # "failed" branch (which raises 500), not the "mocked" silent path.
    with patch.object(notif_routes, "send_email_async", _fake_send_none), \
         patch.object(notif_routes, "build_notification_email_html", _fake_build), \
         patch.object(notif_routes.resend, "api_key", "stub-key"):
        request = _StubSendEmailRequest()
        with pytest.raises(Exception):
            _run(notif_routes.send_notification_email(
                job_id=job_id,
                notification_type="stones_accepted",
                request=request,  # type: ignore[arg-type]
                user=admin,
            ))

    rows = _run(db.activity_log.find({"job_id": job_id}).to_list(10))
    assert rows == [], f"failed send should NOT write activity row, got {rows!r}"
