"""Regression for the admin-notification fan-out added Feb 25 2026.

When a user completes the access-request OTP flow, every super_admin user
(plus the fixed `ADMIN_FIXED_INBOX`) should receive a notification email
with a CTA back to the Access Requests admin tab. Failures must NOT block
the user-facing 200 — the request was already accepted to the DB.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from unittest.mock import patch

from routes import access_requests as ar


# ---------------------------------------------------------------------------
# Mongo stubs
# ---------------------------------------------------------------------------


class _StubCursor:
    def __init__(self, rows):
        self._rows = rows

    def __aiter__(self):
        async def gen():
            for r in self._rows:
                yield r
        return gen()


class _StubUsers:
    def __init__(self, super_admins):
        self._sa = super_admins

    async def find_one(self, query):
        # The verify-and-submit path calls find_one to defend against a
        # late-race registration. Return None to mean "still new".
        return None

    def find(self, query, projection=None):  # noqa: ANN001
        if query.get("role") == "super_admin":
            return _StubCursor(self._sa)
        return _StubCursor([])


class _StubAccessRequests:
    def __init__(self):
        self.inserted = []
        self._pending = []

    async def find_one(self, query):
        # No existing pending request for the same email.
        return None

    async def insert_one(self, doc):
        self.inserted.append(doc)

        class _Result:
            inserted_id = "rid-1"

        return _Result()


class _StubAccessOtps:
    def __init__(self, otp_value):
        self._otp = otp_value

    async def find_one(self, _query):
        return {
            "_id": "otp-row-1",
            "email": _query["email"],
            "otp": self._otp,
            "attempts": 0,
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
        }

    async def update_one(self, *_a, **_k):
        return None

    async def delete_one(self, *_a, **_k):
        return None


class _StubDb:
    def __init__(self, super_admins):
        self.users = _StubUsers(super_admins)
        self.access_requests = _StubAccessRequests()
        self.access_otps = _StubAccessOtps("123456")


def _payload():
    return ar.VerifySubmitRequest(
        email="new@example.com",
        otp="123456",
        full_name="New User",
        company="ACME",
        phone="+10000000000",
        turnstile_token="stub",
        website="",
    )


class _StubRequest:
    class _Client:
        host = "127.0.0.1"

    client = _Client()
    headers: dict[str, str] = {}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_verify_and_submit_emails_super_admins_plus_fixed_inbox():
    super_admins = [
        {"email": "alice@bashari.co"},
        {"email": "bob@bashari.co"},
    ]
    stub_db = _StubDb(super_admins)
    sent: list[dict] = []

    async def fake_send_email_async(params, **_kw):
        sent.append(params)
        return {"id": "ok"}

    with patch.object(ar, "db", stub_db), \
         patch.object(ar, "send_email_async", fake_send_email_async):
        result = _run(ar.verify_and_submit(_payload(), _StubRequest()))

    assert result["ok"] is True
    # alice + bob + ADMIN_FIXED_INBOX (lab@bashari.co)
    recipients = sorted({(p["to"][0]).lower() for p in sent})
    assert recipients == sorted([
        "alice@bashari.co",
        "bob@bashari.co",
        "lab@bashari.co",
    ])
    # Subject should include the requester's name + company
    subjects = {p["subject"] for p in sent}
    assert all("New access request" in s for s in subjects)
    assert all("New User" in s for s in subjects)
    assert all("ACME" in s for s in subjects)


def test_admin_notification_failure_does_not_break_submission():
    """A Resend failure on the admin notify path must NOT fail the 200
    response — the row is already in the DB."""
    stub_db = _StubDb([{"email": "alice@bashari.co"}])

    async def boom(*_a, **_kw):
        raise RuntimeError("Resend went down")

    with patch.object(ar, "db", stub_db), \
         patch.object(ar, "send_email_async", boom):
        result = _run(ar.verify_and_submit(_payload(), _StubRequest()))

    assert result["ok"] is True
    assert "id" in result
    # The row was persisted even though the notify exploded.
    assert len(stub_db.access_requests.inserted) == 1


def test_admin_notification_uses_fixed_inbox_when_no_super_admins():
    stub_db = _StubDb([])  # empty super_admins list
    sent: list[dict] = []

    async def fake_send_email_async(params, **_kw):
        sent.append(params)
        return {"id": "ok"}

    with patch.object(ar, "db", stub_db), \
         patch.object(ar, "send_email_async", fake_send_email_async):
        _run(ar.verify_and_submit(_payload(), _StubRequest()))

    recipients = [p["to"][0].lower() for p in sent]
    assert recipients == ["lab@bashari.co"]


def test_admin_notification_cta_links_to_access_requests_tab():
    stub_db = _StubDb([])
    sent: list[dict] = []

    async def fake_send_email_async(params, **_kw):
        sent.append(params)
        return {"id": "ok"}

    with patch.object(ar, "db", stub_db), \
         patch.object(ar, "send_email_async", fake_send_email_async), \
         patch.object(ar, "FRONTEND_URL", "https://lab.bashari.co"):
        _run(ar.verify_and_submit(_payload(), _StubRequest()))

    html = sent[0]["html"]
    assert "https://lab.bashari.co/dashboard/clients?tab=access-requests" in html
    assert "Review in admin panel" in html
