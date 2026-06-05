"""Direct tests for the shared `email_async.send_email_async` helper.

The existing test_access_request_otp_failure.py covers the route-level
behavior; this module exercises the helper itself so any future call site
can rely on:

  - successful sends return the Resend response dict
  - missing api_key returns None (silent dev-mode mock)
  - timeouts return None (caller decides how to surface)
  - SDK exceptions return None
  - calls run concurrently (don't block the event loop)
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import email_async


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _make_fake_resend(send_impl):
    class _FakeResend:
        api_key = "test-key"

        class Emails:
            send = staticmethod(send_impl)

    return _FakeResend


def test_send_returns_dict_on_success():
    fake = _make_fake_resend(lambda _params: {"id": "resend-abc"})
    with patch.object(email_async, "resend", fake):
        result = _run(email_async.send_email_async({"to": ["x@example.com"]}))
    assert result == {"id": "resend-abc"}


def test_send_coerces_non_dict_responses():
    class _Resp:
        id = "resend-xyz"

    fake = _make_fake_resend(lambda _params: _Resp())
    with patch.object(email_async, "resend", fake):
        result = _run(email_async.send_email_async({"to": ["y@example.com"]}))
    assert result == {"id": "resend-xyz"}


def test_send_returns_none_when_api_key_missing():
    class _FakeResend:
        api_key = ""

        class Emails:
            @staticmethod
            def send(_params):
                raise AssertionError("should not be called without api_key")

    with patch.object(email_async, "resend", _FakeResend):
        result = _run(email_async.send_email_async({"to": ["z@example.com"], "subject": "s"}))
    assert result is None


def test_send_returns_none_on_sdk_exception():
    def boom(_params):
        raise RuntimeError("Resend API rejected the request")

    fake = _make_fake_resend(boom)
    with patch.object(email_async, "resend", fake):
        result = _run(email_async.send_email_async({"to": ["q@example.com"]}))
    assert result is None


def test_send_returns_none_on_timeout():
    def slow(_params):
        time.sleep(1.0)
        return {"id": "should-never-be-returned"}

    fake = _make_fake_resend(slow)
    with patch.object(email_async, "resend", fake):
        result = _run(email_async.send_email_async({"to": ["t@example.com"]}, timeout=0.1))
    assert result is None


def test_concurrent_sends_run_in_parallel():
    """Two 0.4s sends in parallel must finish well under 0.8s.

    Proves the helper offloads the synchronous Resend SDK to a worker
    thread (the whole point of the Feb 25 2026 fix). Without to_thread,
    two awaits would serialise to ~0.8s; with to_thread they overlap.
    """
    def slow(_params):
        time.sleep(0.4)
        return {"id": "ok"}

    fake = _make_fake_resend(slow)

    async def fire_two():
        return await asyncio.gather(
            email_async.send_email_async({"to": ["a@example.com"]}),
            email_async.send_email_async({"to": ["b@example.com"]}),
        )

    with patch.object(email_async, "resend", fake):
        t0 = time.monotonic()
        results = _run(fire_two())
        elapsed = time.monotonic() - t0

    assert all(r == {"id": "ok"} for r in results)
    # Generous upper bound; serialised execution would be ~0.8s.
    assert elapsed < 0.7, (
        f"send_email_async serialised the SDK call ({elapsed:.2f}s for 2x0.4s sends); "
        "to_thread offload is broken."
    )
