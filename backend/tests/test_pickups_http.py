"""HTTP-level integration tests for pickup → signature → PDF archive flow.

Covers iter-40 review request:
  * POST /api/pickups creates memo_return / cert_collection events
  * auto_create_signature_for spawns a signature_request and surfaces it
    on GET /api/signatures/pending for the matching branch pad
  * POST /api/signatures/{id}/submit triggers finalize_pickup_if_linked
    so signed_pdf_url becomes a reachable Cloudinary URL
  * DELETE /api/pickups/{id} is super_admin-only (branch_admin → 403)
    and reverts stone_status for memo_return
  * POST /api/pickups/{id}/finalize is the spec endpoint (presence check)

Requires TURNSTILE_SECRET_KEY="" in backend/.env for headless login.
"""
from __future__ import annotations

import base64
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to local container backend
    BASE_URL = "http://localhost:8001"

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"
# Use USA branch admin since IL admin (ofir1) has a corrupted password
# hash in DB returning 500 (pre-existing issue, not part of this iter).
# require_super_admin RBAC rejects any non-super_admin uniformly, so the
# branch is irrelevant for the 403 assertion.
BRANCH_ADMIN_EMAIL = "ofir2@bashds.com"
BRANCH_ADMIN_PASSWORD = "admin123"
PAD_EMAIL = "pad-il@bashari.com"
PAD_PASSWORD = "pad123"


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password, "website": ""},
        timeout=15,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# Real 200x100 white PNG (decoded ~339 bytes — satisfies >100B minimum)
PNG_10x10 = (
    "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAABGklEQVR4nO3SwQ3AIBDAsNL9dz6WIEJC9gR5ZM3MB6f9twN4k7FIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIuEsUgYi4SxSBiLhLFIGIvEBlOUA8XCwqj8AAAAAElFTkSuQmCC"
)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def branch_admin_token():
    return _login(BRANCH_ADMIN_EMAIL, BRANCH_ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def pad_token():
    return _login(PAD_EMAIL, PAD_PASSWORD)


@pytest.fixture(scope="module")
def seeded_job(admin_token):
    """Find any job with >=2 active stones AND no existing pickups."""
    r = requests.get(f"{API}/jobs", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    jobs = r.json()
    for j in jobs:
        stones = j.get("stones") or []
        active = [s for s in stones if not s.get("cancelled")]
        if len(active) < 2:
            continue
        # check no prior pickups
        rp = requests.get(
            f"{API}/jobs/{j['id']}/pickups",
            headers=_h(admin_token),
            timeout=10,
        )
        if rp.status_code == 200 and len(rp.json()) == 0:
            return j
    pytest.skip("No job found with >=2 active stones and no prior pickups")


@pytest.fixture
def fresh_stones(admin_token, seeded_job):
    """Return 2 stone ids that have NOT been used in any prior pickup for this job.
    Also cleans up any pickups created by prior tests in this module."""
    r = requests.get(
        f"{API}/jobs/{seeded_job['id']}/pickups",
        headers=_h(admin_token),
        timeout=15,
    )
    # Best-effort cleanup of any leftover pickups from prior tests
    if r.status_code == 200:
        for ev in r.json():
            requests.delete(
                f"{API}/pickups/{ev['id']}",
                headers=_h(admin_token),
                timeout=10,
            )
    active = [s for s in (seeded_job.get("stones") or []) if not s.get("cancelled")]
    if len(active) < 2:
        pytest.skip(f"Not enough active stones (active={len(active)})")
    return [active[0]["id"], active[1]["id"]]


def _cleanup(admin_token, pickup_id):
    if pickup_id:
        requests.delete(
            f"{API}/pickups/{pickup_id}", headers=_h(admin_token), timeout=15
        )


# ---- POST /api/pickups --------------------------------------------------------


def test_create_memo_return_basic(admin_token, seeded_job, fresh_stones):
    body = {
        "job_id": seeded_job["id"],
        "type": "memo_return",
        "stone_ids": fresh_stones,
    }
    r = requests.post(f"{API}/pickups", headers=_h(admin_token), json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["type"] == "memo_return"
    assert set(data["stone_ids"]) == set(fresh_stones)
    assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 0
    assert data["printed_by_name"]  # populated
    assert data["signed_pdf_url"] is None
    pickup_id = data["id"]

    # GET listing returns it
    r2 = requests.get(
        f"{API}/jobs/{seeded_job['id']}/pickups",
        headers=_h(admin_token),
        timeout=15,
    )
    assert r2.status_code == 200
    ids = [e["id"] for e in r2.json()]
    assert pickup_id in ids
    _cleanup(admin_token, pickup_id)


def test_create_cert_collection_no_status_flip(admin_token, seeded_job, fresh_stones):
    body = {
        "job_id": seeded_job["id"],
        "type": "cert_collection",
        "stone_ids": fresh_stones,
    }
    r = requests.post(f"{API}/pickups", headers=_h(admin_token), json=body, timeout=20)
    assert r.status_code == 200, r.text
    pickup_id = r.json()["id"]

    # Re-fetch job, verify stone_status NOT flipped to 'returned' for these stones
    rj = requests.get(
        f"{API}/jobs/{seeded_job['id']}", headers=_h(admin_token), timeout=15
    )
    assert rj.status_code == 200
    job = rj.json()
    sid_status = {s["id"]: s.get("stone_status") for s in (job.get("stones") or [])}
    for sid in fresh_stones:
        assert sid_status.get(sid) != "returned", (
            f"cert_collection should NOT flip stone_status to 'returned' "
            f"but stone {sid} is {sid_status.get(sid)}"
        )
    _cleanup(admin_token, pickup_id)


# ---- auto_create_signature_for path ------------------------------------------


def test_auto_create_signature_request_appears_on_pad(
    admin_token, pad_token, seeded_job, fresh_stones
):
    """When auto_create_signature_for is passed, a signature_request must
    be created AND surface on GET /signatures/pending for the pad role."""
    body = {
        "job_id": seeded_job["id"],
        "type": "memo_return",
        "stone_ids": fresh_stones,
        "auto_create_signature_for": "TEST_AutoSig_Client",
        "signature_role": "client_collection",
        "memo_html_template": (
            "<html><body><h1>Memo</h1>"
            "<div>{{SIGNATURE_BLOCK}}</div></body></html>"
        ),
    }
    r = requests.post(f"{API}/pickups", headers=_h(admin_token), json=body, timeout=20)
    assert r.status_code == 200, (
        f"auto_create_signature_for path broken: {r.status_code} {r.text}"
    )
    data = r.json()
    pickup_id = data["id"]
    sig_id = data.get("signature_request_id")
    assert sig_id, "signature_request_id should be returned on the pickup"

    # Pad polls pending — returns OLDEST pending or null. We need to
    # ensure our newly-created sig surfaces; loop a few times in case there
    # are older pending rows in DB.
    found = False
    for _ in range(5):
        rp = requests.get(
            f"{API}/signatures/pending", headers=_h(pad_token), timeout=15
        )
        assert rp.status_code == 200, rp.text
        row = rp.json()
        if row and row.get("id") == sig_id:
            found = True
            break
        # cancel whatever is first so ours surfaces
        if row and row.get("id"):
            requests.post(
                f"{API}/signatures/{row['id']}/cancel",
                headers=_h(admin_token),
                timeout=10,
            )
    assert found, (
        f"new signature request {sig_id} not surfaced on pad pending"
    )
    # cleanup: cancel sig + delete pickup
    requests.post(
        f"{API}/signatures/{sig_id}/cancel", headers=_h(admin_token), timeout=15
    )
    _cleanup(admin_token, pickup_id)


# ---- Submit signature → finalize ---------------------------------------------


def test_submit_signature_finalizes_pickup_pdf(
    admin_token, pad_token, seeded_job, fresh_stones
):
    body = {
        "job_id": seeded_job["id"],
        "type": "memo_return",
        "stone_ids": fresh_stones,
        "auto_create_signature_for": "TEST_PDF_Client",
        "signature_role": "client_collection",
        "memo_html_template": (
            "<html><body><h1>Memo Return</h1>"
            "<p>Stones: " + ",".join(fresh_stones) + "</p>"
            "<div>SignatureBlock:{{SIGNATURE_BLOCK}}</div>"
            "</body></html>"
        ),
    }
    r = requests.post(f"{API}/pickups", headers=_h(admin_token), json=body, timeout=20)
    assert r.status_code == 200, r.text
    pickup_id = r.json()["id"]
    sig_id = r.json()["signature_request_id"]

    # Pad submits a real PNG
    rs = requests.post(
        f"{API}/signatures/{sig_id}/submit",
        headers=_h(pad_token),
        json={"image_base64": PNG_10x10},
        timeout=60,
    )
    assert rs.status_code == 200, f"submit signature failed: {rs.status_code} {rs.text}"

    # Poll pickup row up to 30s for signed_pdf_url
    signed_url = None
    for _ in range(15):
        rg = requests.get(
            f"{API}/jobs/{seeded_job['id']}/pickups",
            headers=_h(admin_token),
            timeout=15,
        )
        if rg.status_code == 200:
            for ev in rg.json():
                if ev["id"] == pickup_id and ev.get("signed_pdf_url"):
                    signed_url = ev["signed_pdf_url"]
                    break
        if signed_url:
            break
        time.sleep(2)

    assert signed_url, "signed_pdf_url never set on pickup after signature submission"
    assert signed_url.startswith("https://"), f"signed url not https: {signed_url}"

    # PDF is reachable
    rpdf = requests.get(signed_url, timeout=20)
    assert rpdf.status_code == 200, f"PDF unreachable: {rpdf.status_code}"
    # Cloudinary serves PDF; check binary starts with %PDF
    assert rpdf.content[:4] == b"%PDF", (
        f"Downloaded asset is not a PDF: starts={rpdf.content[:10]!r}"
    )
    _cleanup(admin_token, pickup_id)


# ---- DELETE /api/pickups/{id} RBAC -------------------------------------------


def test_delete_pickup_branch_admin_forbidden(
    admin_token, branch_admin_token, seeded_job, fresh_stones
):
    # super_admin creates
    body = {
        "job_id": seeded_job["id"],
        "type": "memo_return",
        "stone_ids": fresh_stones,
    }
    rc = requests.post(
        f"{API}/pickups", headers=_h(admin_token), json=body, timeout=15
    )
    assert rc.status_code == 200, rc.text
    pickup_id = rc.json()["id"]

    # branch_admin attempts delete → 403
    rd = requests.delete(
        f"{API}/pickups/{pickup_id}",
        headers=_h(branch_admin_token),
        timeout=15,
    )
    assert rd.status_code == 403, (
        f"branch_admin should be forbidden from DELETE, got {rd.status_code} {rd.text}"
    )
    # super_admin deletes — row gone
    rd2 = requests.delete(
        f"{API}/pickups/{pickup_id}", headers=_h(admin_token), timeout=15
    )
    assert rd2.status_code == 200


def test_delete_memo_return_reverts_stone_status(
    admin_token, seeded_job, fresh_stones
):
    body = {
        "job_id": seeded_job["id"],
        "type": "memo_return",
        "stone_ids": fresh_stones,
    }
    rc = requests.post(
        f"{API}/pickups", headers=_h(admin_token), json=body, timeout=15
    )
    assert rc.status_code == 200
    pickup_id = rc.json()["id"]

    # Verify stones flipped to 'returned'
    rj = requests.get(
        f"{API}/jobs/{seeded_job['id']}", headers=_h(admin_token), timeout=15
    )
    statuses = {s["id"]: s.get("stone_status") for s in rj.json().get("stones") or []}
    for sid in fresh_stones:
        assert statuses.get(sid) == "returned", (
            f"stone {sid} not flipped to returned after memo_return: {statuses.get(sid)}"
        )

    # Undo
    rd = requests.delete(
        f"{API}/pickups/{pickup_id}", headers=_h(admin_token), timeout=15
    )
    assert rd.status_code == 200

    # Re-check — should be 'at_office'
    rj2 = requests.get(
        f"{API}/jobs/{seeded_job['id']}", headers=_h(admin_token), timeout=15
    )
    statuses2 = {s["id"]: s.get("stone_status") for s in rj2.json().get("stones") or []}
    for sid in fresh_stones:
        assert statuses2.get(sid) == "at_office", (
            f"stone {sid} not reverted to at_office after undo: {statuses2.get(sid)}"
        )


# ---- POST /api/pickups/{id}/finalize endpoint presence -----------------------


def test_finalize_endpoint_exists(admin_token, seeded_job, fresh_stones):
    """Spec requires POST /api/pickups/{id}/finalize to be independently
    callable (idempotent). Verify the route is mounted."""
    body = {
        "job_id": seeded_job["id"],
        "type": "memo_return",
        "stone_ids": fresh_stones,
        "memo_html_template": "<html><body>X{{SIGNATURE_BLOCK}}</body></html>",
    }
    rc = requests.post(
        f"{API}/pickups", headers=_h(admin_token), json=body, timeout=15
    )
    assert rc.status_code == 200
    pickup_id = rc.json()["id"]
    rf = requests.post(
        f"{API}/pickups/{pickup_id}/finalize",
        headers=_h(admin_token),
        timeout=30,
    )
    # If route doesn't exist this will be 404. Spec requires it to exist.
    assert rf.status_code != 404, (
        "POST /api/pickups/{id}/finalize endpoint is MISSING — "
        "spec requires it to be independently callable"
    )
    _cleanup(admin_token, pickup_id)
