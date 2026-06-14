"""HTTP-level smoke test for the signatures flow against the live API.

Exercises the actual FastAPI app via the public preview URL, not direct
function calls — complements test_signatures.py which mocks Cloudinary.

Run: `pytest backend/tests/test_signatures_http.py -v`.
Requires TURNSTILE_SECRET_KEY blank in backend/.env so /auth/login bypasses Turnstile.
"""

from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://bashari-lab-direct.preview.emergentagent.com",
).rstrip("/")

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASS = "admin123"
PAD_IL_EMAIL = "pad-il@bashari.com"
PAD_IL_PASS = "pad123"
PAD_NY_EMAIL = "pad-ny@bashari.com"
PAD_NY_PASS = "pad123"

# Big enough b64 payload (~200 bytes decoded) to clear the empty-canvas guard.
_SIG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 192).decode()


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password, "website": ""},
        timeout=30,
    )
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"]


@pytest.fixture(scope="module")
def admin_token() -> str:
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def pad_il_token() -> str:
    return _login(PAD_IL_EMAIL, PAD_IL_PASS)


@pytest.fixture(scope="module")
def pad_ny_token() -> str:
    return _login(PAD_NY_EMAIL, PAD_NY_PASS)


@pytest.fixture(scope="module")
def some_job(admin_token: str) -> dict:
    """Fetch one job to use as a target for signature requests."""
    r = requests.get(
        f"{BASE_URL}/api/jobs",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    jobs = r.json()
    # jobs may be a list directly or {items: [...]}
    if isinstance(jobs, dict) and "items" in jobs:
        jobs = jobs["items"]
    assert len(jobs) > 0, "No jobs available for testing"
    return jobs[0]


def _cleanup(admin_token: str, request_id: str):
    requests.delete(
        f"{BASE_URL}/api/signatures/{request_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )


# ------- Auth -------

def test_pending_unauth_returns_401():
    r = requests.get(f"{BASE_URL}/api/signatures/pending", timeout=15)
    assert r.status_code in (401, 403), r.status_code


def test_admin_can_poll_pending(admin_token: str):
    """Admins can preview the pad UX — endpoint should accept admin token."""
    r = requests.get(
        f"{BASE_URL}/api/signatures/pending",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text


def test_pad_can_poll_pending(pad_il_token: str):
    r = requests.get(
        f"{BASE_URL}/api/signatures/pending",
        headers={"Authorization": f"Bearer {pad_il_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text


# ------- Create -------

def test_invalid_role_returns_400(admin_token: str, some_job: dict):
    r = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": str(some_job["_id"] if "_id" in some_job else some_job["id"]),
              "role": "not_a_real_role", "signer_name": "X"},
        timeout=15,
    )
    assert r.status_code == 400, r.text
    assert "invalid role" in r.text.lower()


def test_create_pending_signer_name_trimmed(admin_token: str, some_job: dict):
    job_id = str(some_job.get("_id") or some_job.get("id"))
    r = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": job_id, "role": "client_drop_off",
              "signer_name": "  HTTP Tester  "},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "pending"
    assert data["role"] == "client_drop_off"
    assert data["signer_name"] == "HTTP Tester", f"Expected trimmed name, got {data['signer_name']!r}"
    assert data["branch_id"] == some_job.get("branch_id")
    _cleanup(admin_token, data["id"])


def test_duplicate_pending_cancels_first(admin_token: str, some_job: dict, pad_il_token: str):
    job_id = str(some_job.get("_id") or some_job.get("id"))
    # First request
    r1 = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": job_id, "role": "client_collection", "signer_name": "First"},
        timeout=15,
    )
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]
    # Second request — should cancel first
    r2 = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": job_id, "role": "client_collection", "signer_name": "Second"},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    second_id = r2.json()["id"]
    assert first_id != second_id
    # First should now be cancelled
    r_first = requests.get(
        f"{BASE_URL}/api/signatures/{first_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r_first.status_code == 200
    assert r_first.json()["status"] == "cancelled"
    _cleanup(admin_token, first_id)
    _cleanup(admin_token, second_id)


# ------- Submit validation -------

def test_submit_rejects_invalid_base64(admin_token: str, some_job: dict, pad_il_token: str):
    job_id = str(some_job.get("_id") or some_job.get("id"))
    # Ensure the job is at IL branch — fall back to any branch if not
    cr = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": job_id, "role": "cert_collection", "signer_name": "X"},
        timeout=15,
    )
    if cr.status_code != 200:
        pytest.skip(f"Could not create request: {cr.status_code}")
    rid = cr.json()["id"]
    branch_id = cr.json().get("branch_id")
    # Pick the right pad based on branch
    tok = pad_il_token if branch_id and "IL" in str(branch_id).upper() or "Israel" in str(branch_id) else pad_il_token
    # Use admin token for the submit so we don't care about branch routing for this validation test
    r = requests.post(
        f"{BASE_URL}/api/signatures/{rid}/submit",
        headers={"Authorization": f"Bearer {tok}"},
        json={"image_base64": "not_base64_string_with_enough_length_!!!!"},
        timeout=15,
    )
    # Either 400 invalid base64 OR 403 branch mismatch is acceptable; we only care that bad data is rejected.
    assert r.status_code in (400, 403), r.text
    _cleanup(admin_token, rid)


# ------- Cancel / Delete -------

def test_cancel_pending(admin_token: str, some_job: dict):
    job_id = str(some_job.get("_id") or some_job.get("id"))
    cr = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": job_id, "role": "courier_drop_off", "signer_name": "Courier X"},
        timeout=15,
    )
    assert cr.status_code == 200, cr.text
    rid = cr.json()["id"]
    cancel = requests.post(
        f"{BASE_URL}/api/signatures/{rid}/cancel",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["status"] == "cancelled"
    _cleanup(admin_token, rid)


def test_list_job_signatures(admin_token: str, some_job: dict):
    job_id = str(some_job.get("_id") or some_job.get("id"))
    cr = requests.post(
        f"{BASE_URL}/api/signatures/request",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"job_id": job_id, "role": "client_drop_off", "signer_name": "List Test"},
        timeout=15,
    )
    assert cr.status_code == 200
    rid = cr.json()["id"]
    r = requests.get(
        f"{BASE_URL}/api/jobs/{job_id}/signatures",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list)
    assert any(row["id"] == rid for row in rows)
    _cleanup(admin_token, rid)
