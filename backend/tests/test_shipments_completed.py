"""
Tests for the "Completed" shipment status feature.

Coverage:
- GET /api/shipments default filter EXCLUDES completed + cancelled
- GET /api/shipments?include_archived=true INCLUDES completed
- PUT /api/shipments/{id}/status auto-promotes `certificates_from_lab` from
  'delivered' to 'completed'
- Other shipment types stay 'delivered' on delivery (no auto-completion)
- ?status=completed explicit query returns only completed shipments
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bashari-lab-direct.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---- Auth fixture ----
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={
            "email": "admin@bashari.com",
            "password": "admin123",
            "turnstile_token": "",
            "website": "",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    # Disable 2FA if required
    if data.get("requires_2fa"):
        pytest.skip("2FA required, please disable two_factor_enabled for admin user")
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---- Helper: build a `certificates_from_lab` shipment from any existing job ----
def _pick_a_job_id(headers):
    r = requests.get(f"{API}/jobs", headers=headers, timeout=15)
    assert r.status_code == 200, f"jobs list failed: {r.status_code} {r.text[:200]}"
    jobs = r.json()
    assert len(jobs) > 0, "Need at least one job in DB to test shipments"
    return jobs[0]["id"]


def _create_shipment(headers, shipment_type, job_id):
    payload = {
        "shipment_type": shipment_type,
        "courier": "FedEx",
        "source_address": "Test Source",
        "destination_address": "Test Destination",
        "tracking_number": f"TEST-{shipment_type}",
        "job_ids": [job_id],
        "notes": "TEST_completed_status_feature",
    }
    r = requests.post(f"{API}/shipments", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, f"create shipment failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _delete_shipment(headers, sid):
    try:
        requests.delete(f"{API}/shipments/{sid}", headers=headers, timeout=10)
    except Exception:
        pass


# ---- Tests ----
class TestShipmentsCompletedStatus:
    def test_login_works(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_get_shipments_default_excludes_completed_and_cancelled(self, auth_headers):
        r = requests.get(f"{API}/shipments", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        statuses = {s["status"] for s in r.json()}
        assert "completed" not in statuses, f"completed leaked into default list: {statuses}"
        assert "cancelled" not in statuses, f"cancelled leaked into default list: {statuses}"

    def test_get_shipments_with_include_archived_returns_completed(self, auth_headers):
        r = requests.get(
            f"{API}/shipments", params={"include_archived": "true"}, headers=auth_headers, timeout=15
        )
        assert r.status_code == 200
        # Just confirming the param is accepted and doesn't filter out terminal states
        # (we'll assert presence after creating one below)

    def test_certificates_from_lab_auto_completes_on_delivery(self, auth_headers):
        job_id = _pick_a_job_id(auth_headers)
        shipment = _create_shipment(auth_headers, "certificates_from_lab", job_id)
        sid = shipment["id"]
        try:
            assert shipment["status"] == "pending"

            # Move to delivered → backend should auto-promote to completed
            r = requests.put(
                f"{API}/shipments/{sid}/status",
                json={"status": "delivered", "cascade_to_jobs": False},
                headers=auth_headers,
                timeout=15,
            )
            assert r.status_code == 200, f"status update failed: {r.text[:300]}"

            # Without include_archived → completed shipments excluded → should NOT
            # appear in the default list
            r_default = requests.get(f"{API}/shipments", headers=auth_headers, timeout=15)
            assert r_default.status_code == 200
            ids_default = [s["id"] for s in r_default.json()]
            assert sid not in ids_default, "completed shipment leaked into default view"

            # With include_archived=true → should appear with status='completed'
            r_arch = requests.get(
                f"{API}/shipments",
                params={"include_archived": "true"},
                headers=auth_headers,
                timeout=15,
            )
            assert r_arch.status_code == 200
            found = next((s for s in r_arch.json() if s["id"] == sid), None)
            assert found is not None, "shipment missing when include_archived=true"
            assert found["status"] == "completed", f"expected completed, got {found['status']}"
        finally:
            _delete_shipment(auth_headers, sid)

    def test_send_stones_to_lab_does_NOT_autocomplete(self, auth_headers):
        job_id = _pick_a_job_id(auth_headers)
        shipment = _create_shipment(auth_headers, "send_stones_to_lab", job_id)
        sid = shipment["id"]
        try:
            r = requests.put(
                f"{API}/shipments/{sid}/status",
                json={"status": "delivered", "cascade_to_jobs": False},
                headers=auth_headers,
                timeout=15,
            )
            assert r.status_code == 200

            r_arch = requests.get(
                f"{API}/shipments",
                params={"include_archived": "true"},
                headers=auth_headers,
                timeout=15,
            )
            found = next((s for s in r_arch.json() if s["id"] == sid), None)
            assert found is not None
            assert found["status"] == "delivered", (
                f"send_stones_to_lab should stay 'delivered', got {found['status']}"
            )
        finally:
            _delete_shipment(auth_headers, sid)

    def test_stones_from_lab_does_NOT_autocomplete(self, auth_headers):
        job_id = _pick_a_job_id(auth_headers)
        shipment = _create_shipment(auth_headers, "stones_from_lab", job_id)
        sid = shipment["id"]
        try:
            r = requests.put(
                f"{API}/shipments/{sid}/status",
                json={"status": "delivered", "cascade_to_jobs": False},
                headers=auth_headers,
                timeout=15,
            )
            assert r.status_code == 200

            r_arch = requests.get(
                f"{API}/shipments",
                params={"include_archived": "true"},
                headers=auth_headers,
                timeout=15,
            )
            found = next((s for s in r_arch.json() if s["id"] == sid), None)
            assert found is not None
            assert found["status"] == "delivered", (
                f"stones_from_lab should stay 'delivered', got {found['status']}"
            )
        finally:
            _delete_shipment(auth_headers, sid)

    def test_status_completed_explicit_filter_returns_only_completed(self, auth_headers):
        # Seed one completed
        job_id = _pick_a_job_id(auth_headers)
        shipment = _create_shipment(auth_headers, "certificates_from_lab", job_id)
        sid = shipment["id"]
        try:
            requests.put(
                f"{API}/shipments/{sid}/status",
                json={"status": "delivered", "cascade_to_jobs": False},
                headers=auth_headers,
                timeout=15,
            )
            r = requests.get(
                f"{API}/shipments",
                params={"status": "completed"},
                headers=auth_headers,
                timeout=15,
            )
            assert r.status_code == 200
            data = r.json()
            assert all(s["status"] == "completed" for s in data), (
                f"non-completed leaked: {set(s['status'] for s in data)}"
            )
            assert sid in [s["id"] for s in data]
        finally:
            _delete_shipment(auth_headers, sid)

    def test_shipment_options_includes_completed_status(self, auth_headers):
        r = requests.get(f"{API}/shipments/config/options", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "completed" in data.get("statuses", []), (
            f"'completed' missing from statuses option list: {data.get('statuses')}"
        )
