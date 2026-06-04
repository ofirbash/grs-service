"""Regression for /access-requests/send-otp Resend-rejection handling.

Bug (Feb 25 2026): when Resend rejected the OTP email (e.g. unverified
sender domain), the backend returned `{ok:true, email_sent:false}` and the
landing-page modal moved the user to the OTP step claiming "Success!" even
though no email had arrived. Fix: the route now raises HTTP 502 with a
user-friendly detail message when `_send_email` returns False.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

from fastapi import HTTPException

from routes import access_requests as ar


class _StubUsersCollection:
    """Mongo `db.users.find_one` stub — returns None to mean "new email"."""

    async def find_one(self, query):  # noqa: ANN001
        return None


class _StubOtpsCollection:
    async def update_one(self, query, update, upsert=False):  # noqa: ANN001, FBT002
        # Just enough to satisfy the upsert call.
        return type("Result", (), {"upserted_id": "x"})()


class _StubDb:
    users = _StubUsersCollection()
    access_otps = _StubOtpsCollection()


class _StubRequest:
    """Minimal stand-in for fastapi.Request — Turnstile verifier reads
    request.client.host. Our `verify_turnstile` is monkey-patched away so
    even this isn't really needed, but it makes the call site honest."""

    class _Client:
        host = "127.0.0.1"

    client = _Client()
    headers: dict[str, str] = {}


def _payload(email="new-user@example.com"):
    return ar.SendOtpRequest(
        full_name="Test User",
        company="ACME",
        email=email,
        phone="+10000000000",
        turnstile_token="stubbed",
        website="",
    )


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_send_otp_raises_502_when_resend_rejects():
    """If `_send_email` returns False, the route must NOT return ok:true —
    it must raise HTTP 502 so the frontend can surface the error."""
    async def fake_send_email(*_a, **_k):
        return False  # Resend rejected (e.g. unverified domain)

    async def fake_verify_turnstile(*_a, **_k):
        return None

    with patch.object(ar, "db", _StubDb()), \
         patch.object(ar, "_send_email", fake_send_email), \
         patch.object(ar, "verify_turnstile", fake_verify_turnstile):
        try:
            _run(ar.send_otp(_payload(), _StubRequest()))
        except HTTPException as exc:
            assert exc.status_code == 502
            assert "verification email" in exc.detail.lower()
            assert "lab@bashari.co" in exc.detail
            return
    raise AssertionError("expected HTTPException(502), got success")


def test_send_otp_returns_ok_when_resend_accepts():
    """Happy path: resend returns True → route returns the success shape."""
    async def fake_send_email(*_a, **_k):
        return True

    async def fake_verify_turnstile(*_a, **_k):
        return None

    with patch.object(ar, "db", _StubDb()), \
         patch.object(ar, "_send_email", fake_send_email), \
         patch.object(ar, "verify_turnstile", fake_verify_turnstile):
        result = _run(ar.send_otp(_payload(), _StubRequest()))
    assert result == {"ok": True, "already_registered": False, "email_sent": True}


def test_duplicate_email_path_still_returns_ok_silently():
    """If the email matches an existing user, the route triggers a silent
    password-reset email and returns the "already_registered" shape — we
    must NOT 502 on that path even if the reset email itself fails to send
    (privacy-by-design: we never leak whether an email exists)."""

    class _StubUsersWithMatch:
        async def find_one(self, _):
            return {"_id": "user-id", "email": "existing@example.com", "full_name": "Existing"}

    class _StubDbWithMatch:
        users = _StubUsersWithMatch()
        access_otps = _StubOtpsCollection()

    async def fake_silent_reset(*_a, **_k):
        return None  # mimics the success path, no exception

    async def fake_verify_turnstile(*_a, **_k):
        return None

    with patch.object(ar, "db", _StubDbWithMatch()), \
         patch.object(ar, "_silently_trigger_password_reset", fake_silent_reset), \
         patch.object(ar, "verify_turnstile", fake_verify_turnstile):
        result = _run(ar.send_otp(_payload("existing@example.com"), _StubRequest()))

    assert result == {"ok": True, "already_registered": True}
