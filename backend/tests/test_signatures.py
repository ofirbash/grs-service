"""Backend tests for the signature-capture flow.

Covers the full happy path (admin requests → pad polls → pad submits →
desktop sees signed status) and the key branching rules (branch scoping,
duplicate-pending replacement, cancel/delete, invalid payloads).

Cloudinary's upload+destroy SDK is monkeypatched to skip the network.

Run: `pytest backend/tests/test_signatures.py -q`. Requires the backend
service to be running with TURNSTILE_SECRET_KEY blank.
"""

from __future__ import annotations

import asyncio
import base64
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from database import db  # noqa: E402
import routes.signatures as sig_routes  # noqa: E402

# A 1x1 transparent PNG, base64-encoded. Slightly over the 100-byte
# floor so the "empty signature" guard doesn't reject it.
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmM"
    "IQAAAABJRU5ErkJggg=="
)
# Pad to 200 bytes so we comfortably clear the empty-image floor.
_SIGNATURE_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 192).decode()


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def seeded():
    """Insert: a super_admin, a branch_admin (IL), a signing_pad (IL),
    a signing_pad (NY), a client, an IL job, a NY job. Cleans up at the
    end."""
    now = datetime.utcnow()
    suffix = uuid.uuid4().hex[:6]

    super_admin = {
        "email": f"super-{suffix}@example.com",
        "full_name": "Super Admin",
        "role": "super_admin",
        "branch_id": None,
        "created_at": now,
    }
    branch_admin_il = {
        "email": f"il-admin-{suffix}@example.com",
        "full_name": "IL Branch Admin",
        "role": "branch_admin",
        "branch_id": "branch-IL",
        "created_at": now,
    }
    pad_il = {
        "email": f"pad-il-{suffix}@example.com",
        "full_name": "IL Pad",
        "role": "signing_pad",
        "branch_id": "branch-IL",
        "created_at": now,
    }
    pad_ny = {
        "email": f"pad-ny-{suffix}@example.com",
        "full_name": "NY Pad",
        "role": "signing_pad",
        "branch_id": "branch-NY",
        "created_at": now,
    }
    sa_id = _run(db.users.insert_one(super_admin)).inserted_id
    il_admin_id = _run(db.users.insert_one(branch_admin_il)).inserted_id
    pad_il_id = _run(db.users.insert_one(pad_il)).inserted_id
    pad_ny_id = _run(db.users.insert_one(pad_ny)).inserted_id

    client_doc: dict[str, Any] = {
        "name": f"TEST_SigClient_{suffix}",
        "email": "sig-client@example.com",
        "branch_id": "branch-IL",
        "created_at": now,
    }
    client_id = _run(db.clients.insert_one(client_doc)).inserted_id

    job_il = {
        "job_number": 91001,
        "client_id": str(client_id),
        "branch_id": "branch-IL",
        "service_type": "Normal",
        "status": "stones_accepted",
        "stones": [],
        "created_at": now,
        "updated_at": now,
    }
    job_ny = {
        "job_number": 91002,
        "client_id": str(client_id),
        "branch_id": "branch-NY",
        "service_type": "Normal",
        "status": "stones_accepted",
        "stones": [],
        "created_at": now,
        "updated_at": now,
    }
    job_il_id = _run(db.jobs.insert_one(job_il)).inserted_id
    job_ny_id = _run(db.jobs.insert_one(job_ny)).inserted_id

    super_admin["_id"] = sa_id
    branch_admin_il["_id"] = il_admin_id
    pad_il["_id"] = pad_il_id
    pad_ny["_id"] = pad_ny_id

    yield {
        "super_admin": super_admin,
        "branch_admin_il": branch_admin_il,
        "pad_il": pad_il,
        "pad_ny": pad_ny,
        "job_il_id": str(job_il_id),
        "job_ny_id": str(job_ny_id),
    }

    _run(db.signature_requests.delete_many({"job_id": {"$in": [str(job_il_id), str(job_ny_id)]}}))
    _run(db.activity_log.delete_many({"job_id": {"$in": [str(job_il_id), str(job_ny_id)]}}))
    _run(db.jobs.delete_many({"_id": {"$in": [job_il_id, job_ny_id]}}))
    _run(db.clients.delete_one({"_id": client_id}))
    _run(db.users.delete_many({"_id": {"$in": [sa_id, il_admin_id, pad_il_id, pad_ny_id]}}))


@pytest.fixture
def mock_cloudinary():
    """Stub Cloudinary so tests don't need network or real credentials."""
    def _fake_upload(*_args, **kwargs):
        public_id = kwargs.get("public_id", "stub-public-id")
        return {
            "secure_url": f"https://res.cloudinary.com/stub/image/upload/{public_id}.png",
            "public_id": public_id,
        }

    def _fake_destroy(*_args, **_kwargs):
        return {"result": "ok"}

    with patch.object(sig_routes.cloudinary.uploader, "upload", _fake_upload), \
         patch.object(sig_routes.cloudinary.uploader, "destroy", _fake_destroy):
        yield


class _FakeRequest:
    """Minimal stub for `fastapi.Request` — submit_signature only reads
    headers['user-agent'] and `client.host`."""
    class _Client:
        host = "127.0.0.1"

    def __init__(self):
        self.headers = {"user-agent": "test-agent/1.0"}
        self.client = self._Client()


def _payload(job_id: str, role: str = "client_drop_off", name: str = "Acme Client"):
    return sig_routes.CreateSignatureRequestPayload(
        job_id=job_id, role=role, signer_name=name,
    )


class TestCreateAndPoll:
    def test_create_pending_request_and_pad_sees_it(self, seeded):
        """Admin creates request → IL pad sees it on next poll."""
        res = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        assert res["status"] == "pending"
        assert res["branch_id"] == "branch-IL"
        assert res["role"] == "client_drop_off"

        # IL pad polls — should get this row.
        polled = _run(sig_routes.get_pending_signature(user=seeded["pad_il"]))
        assert polled is not None
        assert polled["id"] == res["id"]

    def test_ny_pad_does_not_see_il_request(self, seeded):
        """Cross-branch isolation — NY pad never sees IL pending rows."""
        _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        polled = _run(sig_routes.get_pending_signature(user=seeded["pad_ny"]))
        assert polled is None

    def test_super_admin_acting_on_ny_job_routes_to_ny_pad(self, seeded):
        """Super_admin at IL desk capturing a NY job → NY pad picks up,
        IL pad does not. The signature follows the JOB's branch."""
        _run(sig_routes.create_signature_request(
            _payload(seeded["job_ny_id"]),
            user=seeded["super_admin"],
        ))
        assert _run(sig_routes.get_pending_signature(user=seeded["pad_il"])) is None
        polled = _run(sig_routes.get_pending_signature(user=seeded["pad_ny"]))
        assert polled is not None
        assert polled["branch_id"] == "branch-NY"

    def test_branch_admin_cannot_create_for_other_branch(self, seeded):
        """IL branch_admin trying to capture a NY job → 403."""
        with pytest.raises(Exception) as exc:
            _run(sig_routes.create_signature_request(
                _payload(seeded["job_ny_id"]),
                user=seeded["branch_admin_il"],
            ))
        assert "another branch" in str(exc.value).lower()

    def test_duplicate_pending_replaces_previous(self, seeded):
        """Two requests for the same (job, role) — the first becomes
        cancelled, the second is the only pending one."""
        first = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"], name="First Client"),
            user=seeded["super_admin"],
        ))
        second = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"], name="Second Client"),
            user=seeded["super_admin"],
        ))
        assert first["id"] != second["id"]

        # Pad sees only the second.
        polled = _run(sig_routes.get_pending_signature(user=seeded["pad_il"]))
        assert polled is not None
        assert polled["id"] == second["id"]
        assert polled["signer_name"] == "Second Client"

        # First is now cancelled.
        first_after = _run(sig_routes.get_signature_request(
            first["id"], user=seeded["super_admin"],
        ))
        assert first_after["status"] == "cancelled"


class TestSubmit:
    def test_submit_uploads_to_cloudinary_and_marks_signed(self, seeded, mock_cloudinary):
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        result = _run(sig_routes.submit_signature(
            req["id"],
            sig_routes.SubmitSignaturePayload(image_base64=_SIGNATURE_B64),
            request=_FakeRequest(),
            user=seeded["pad_il"],
        ))
        assert result["status"] == "signed"
        assert result["signed_url"].startswith("https://res.cloudinary.com/")
        assert result["signed_at"] is not None
        assert result["signed_by_ip"] == "127.0.0.1"
        assert "test-agent" in result["signed_by_user_agent"]

        # Pad polls again — nothing pending now.
        assert _run(sig_routes.get_pending_signature(user=seeded["pad_il"])) is None

        # Activity row exists for the capture.
        rows = _run(db.activity_log.find({
            "job_id": seeded["job_il_id"], "action": "signature_captured",
        }).to_list(10))
        assert len(rows) == 1
        assert rows[0]["metadata"].get("role") == "client_drop_off"

    def test_submit_accepts_data_url_prefix(self, seeded, mock_cloudinary):
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        result = _run(sig_routes.submit_signature(
            req["id"],
            sig_routes.SubmitSignaturePayload(image_base64=f"data:image/png;base64,{_SIGNATURE_B64}"),
            request=_FakeRequest(),
            user=seeded["pad_il"],
        ))
        assert result["status"] == "signed"

    def test_submit_rejects_empty_canvas(self, seeded, mock_cloudinary):
        """An empty canvas serialises to ~70 bytes — reject early."""
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        # Payload must be > 20 chars to clear pydantic, but decode to <100
        # bytes to trip the empty-canvas guard. base64-encoded 24 zero bytes
        # ⇒ 32-char string, decodes to 24 bytes.
        tiny = base64.b64encode(b"\x00" * 24).decode()
        with pytest.raises(Exception) as exc:
            _run(sig_routes.submit_signature(
                req["id"],
                sig_routes.SubmitSignaturePayload(image_base64=tiny),
                request=_FakeRequest(),
                user=seeded["pad_il"],
            ))
        assert "empty" in str(exc.value).lower()

    def test_submit_rejects_invalid_base64(self, seeded, mock_cloudinary):
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        with pytest.raises(Exception) as exc:
            _run(sig_routes.submit_signature(
                req["id"],
                sig_routes.SubmitSignaturePayload(image_base64="not_base64_!!!"),
                request=_FakeRequest(),
                user=seeded["pad_il"],
            ))
        assert "base64" in str(exc.value).lower()

    def test_ny_pad_cannot_submit_il_request(self, seeded, mock_cloudinary):
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        with pytest.raises(Exception) as exc:
            _run(sig_routes.submit_signature(
                req["id"],
                sig_routes.SubmitSignaturePayload(image_base64=_SIGNATURE_B64),
                request=_FakeRequest(),
                user=seeded["pad_ny"],
            ))
        assert "branch mismatch" in str(exc.value).lower()


class TestCancelAndDelete:
    def test_cancel_pending(self, seeded):
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        result = _run(sig_routes.cancel_signature_request(
            req["id"], user=seeded["super_admin"],
        ))
        assert result["status"] == "cancelled"
        # Pad no longer sees it.
        assert _run(sig_routes.get_pending_signature(user=seeded["pad_il"])) is None

    def test_delete_signed(self, seeded, mock_cloudinary):
        req = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"]),
            user=seeded["super_admin"],
        ))
        _run(sig_routes.submit_signature(
            req["id"],
            sig_routes.SubmitSignaturePayload(image_base64=_SIGNATURE_B64),
            request=_FakeRequest(),
            user=seeded["pad_il"],
        ))
        result = _run(sig_routes.delete_signature(
            req["id"], user=seeded["super_admin"],
        ))
        assert result == {"deleted": True}

        # Row is gone.
        with pytest.raises(Exception):
            _run(sig_routes.get_signature_request(req["id"], user=seeded["super_admin"]))


class TestListForJob:
    def test_lists_all_signature_rows_for_job(self, seeded, mock_cloudinary):
        # Two roles on the same job, one signed one pending.
        sig1 = _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"], role="client_drop_off"),
            user=seeded["super_admin"],
        ))
        _run(sig_routes.submit_signature(
            sig1["id"],
            sig_routes.SubmitSignaturePayload(image_base64=_SIGNATURE_B64),
            request=_FakeRequest(),
            user=seeded["pad_il"],
        ))
        _run(sig_routes.create_signature_request(
            _payload(seeded["job_il_id"], role="client_collection"),
            user=seeded["super_admin"],
        ))

        rows = _run(sig_routes.list_job_signatures(
            seeded["job_il_id"], user=seeded["super_admin"],
        ))
        assert len(rows) == 2
        roles = {r["role"] for r in rows}
        assert roles == {"client_drop_off", "client_collection"}


def test_invalid_role_rejected(seeded):
    with pytest.raises(Exception) as exc:
        _run(sig_routes.create_signature_request(
            sig_routes.CreateSignatureRequestPayload(
                job_id=seeded["job_il_id"],
                role="not_a_real_role",
                signer_name="X",
            ),
            user=seeded["super_admin"],
        ))
    assert "invalid role" in str(exc.value).lower()
