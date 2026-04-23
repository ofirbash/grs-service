"""
Iteration 22 targeted regression tests for backend refactors:
  1. routes/dashboard.py::get_dashboard_stats  (split into helpers)
  2. routes/manual_payments.py::record_manual_payment (split into helpers)
  3. routes/jobs.py::build_job_response (split into helpers)

These assert the behaviour/payload shape that the refactor was meant to preserve.
"""

import os
import pytest
import requests
from test_config import (
    BASE_URL,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    CUSTOMER_EMAIL,
    CUSTOMER_PASSWORD,
)

NOTIFICATION_TYPES = [
    "stones_accepted",
    "verbal_uploaded",
    "stones_returned",
    "cert_uploaded",
    "cert_returned",
]


# ----------------------------- fixtures -----------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": CUSTOMER_EMAIL, "password": CUSTOMER_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


# ----------------------------- Dashboard stats -----------------------------
EXPECTED_STATS_FIELDS = {
    "total_jobs",
    "active_jobs",
    "total_value",
    "total_fee",
    "total_stones",
    "total_clients",
    "jobs_by_status",
}


class TestDashboardStats:
    def test_admin_dashboard_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/dashboard/stats", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        missing = EXPECTED_STATS_FIELDS - set(data.keys())
        assert not missing, f"missing keys: {missing}, got {list(data.keys())}"
        assert isinstance(data["total_jobs"], int)
        assert isinstance(data["active_jobs"], int)
        assert isinstance(data["total_stones"], int)
        assert isinstance(data["total_clients"], int)
        assert isinstance(data["jobs_by_status"], dict)
        assert data["total_jobs"] >= 0
        assert data["active_jobs"] <= data["total_jobs"]
        # totals should be numeric
        assert isinstance(data["total_value"], (int, float))
        assert isinstance(data["total_fee"], (int, float))
        print(f"admin stats: total_jobs={data['total_jobs']} active={data['active_jobs']} "
              f"value={data['total_value']} fee={data['total_fee']} "
              f"clients={data['total_clients']} statuses={list(data['jobs_by_status'].keys())}")

    def test_customer_dashboard_stats(self, customer_headers):
        r = requests.get(f"{BASE_URL}/dashboard/stats", headers=customer_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        missing = EXPECTED_STATS_FIELDS - set(data.keys())
        assert not missing, f"customer missing keys: {missing}"
        # Customer typically sees fewer jobs (scoped)
        assert data["total_jobs"] >= 0

    def test_stats_requires_auth(self):
        r = requests.get(f"{BASE_URL}/dashboard/stats")
        assert r.status_code in (401, 403)


# ----------------------------- Job list / detail response shape -----------------------------
class TestJobResponseShape:
    def test_jobs_list_has_enriched_fields(self, admin_headers):
        r = requests.get(f"{BASE_URL}/jobs", headers=admin_headers)
        assert r.status_code == 200
        jobs = r.json()
        assert isinstance(jobs, list) and len(jobs) > 0
        sample = jobs[0]
        # Enriched fields that build_job_response must still produce
        for key in ("id", "client_name", "branch_name", "payments", "payment_status"):
            assert key in sample, f"missing {key} in job response"
        assert isinstance(sample["payments"], list)
        # Any payment entry (from any job) must have recorded_at as ISO string (not datetime)
        for j in jobs:
            for p in j.get("payments", []):
                assert "recorded_at" in p
                assert isinstance(p["recorded_at"], str), (
                    f"recorded_at should be ISO str, got {type(p['recorded_at']).__name__}"
                )
                # naive ISO format check
                assert "T" in p["recorded_at"] or "-" in p["recorded_at"]
        # shipment_info optional; if present must be dict-ish
        any_shipment = next((j for j in jobs if j.get("shipment_info")), None)
        if any_shipment:
            assert isinstance(any_shipment["shipment_info"], (dict, list))

    def test_single_job_fetch(self, admin_headers):
        list_r = requests.get(f"{BASE_URL}/jobs", headers=admin_headers)
        job_id = list_r.json()[0]["id"]
        r = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=admin_headers)
        assert r.status_code == 200
        job = r.json()
        assert job["id"] == job_id
        assert "client_name" in job
        assert "payments" in job
        # payment_url is optional — only present when token set
        if "payment_url" in job and job["payment_url"]:
            assert isinstance(job["payment_url"], str)


# ----------------------------- Notification previews -----------------------------
class TestNotificationPreviews:
    @pytest.fixture(scope="class")
    def a_job_id(self, admin_headers):
        r = requests.get(f"{BASE_URL}/jobs", headers=admin_headers)
        return r.json()[0]["id"]

    @pytest.mark.parametrize("ntype", NOTIFICATION_TYPES)
    def test_preview_each_type(self, admin_headers, a_job_id, ntype):
        r = requests.get(
            f"{BASE_URL}/jobs/{a_job_id}/notifications/preview/{ntype}",
            headers=admin_headers,
        )
        assert r.status_code == 200, f"{ntype}: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "html_body" in data and data["html_body"]
        assert "Bashari Lab-Direct" in data["html_body"], (
            f"{ntype}: brand string missing from html_body"
        )
        assert "subject" in data and data["subject"]


# ----------------------------- Manual payment flow -----------------------------
class TestManualPayment:
    @pytest.fixture(scope="class")
    def target_job(self, admin_headers):
        """Pick a job with a non-zero fee and remaining balance."""
        r = requests.get(f"{BASE_URL}/jobs", headers=admin_headers)
        jobs = r.json()
        # Find first job with a positive outstanding balance (fee - discount - paid)
        for j in jobs:
            fee = j.get("total_fee") or 0
            discount = j.get("discount") or 0
            net = max(0, fee - discount)
            paid = sum((p.get("amount") or 0) for p in j.get("payments", []))
            balance = max(0, net - paid)
            if balance > 1:
                return j, balance
        pytest.skip("No job with positive unpaid balance available")

    def test_reject_zero_or_negative(self, admin_headers, target_job):
        job, _ = target_job
        r = requests.post(
            f"{BASE_URL}/jobs/{job['id']}/manual-payment",
            headers=admin_headers,
            json={"amount": 0, "destination": "cash", "note": "TEST zero"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

        r2 = requests.post(
            f"{BASE_URL}/jobs/{job['id']}/manual-payment",
            headers=admin_headers,
            json={"amount": -5, "destination": "cash", "note": "TEST negative"},
        )
        assert r2.status_code == 400

    def test_reject_over_balance(self, admin_headers, target_job):
        job, balance = target_job
        r = requests.post(
            f"{BASE_URL}/jobs/{job['id']}/manual-payment",
            headers=admin_headers,
            json={"amount": balance + 10_000, "destination": "cash", "note": "TEST over"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

    def test_record_positive_payment_and_receipt(self, admin_headers, target_job):
        job, balance = target_job
        # Record a tiny amount (1 unit) to avoid fully paying real data
        amount = 1 if balance > 1 else balance
        r = requests.post(
            f"{BASE_URL}/jobs/{job['id']}/manual-payment",
            headers=admin_headers,
            json={"amount": amount, "destination": "cash", "note": "TEST iter22"},
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        # response payload shape
        assert "payment" in data or "payment_id" in data or "id" in data, (
            f"missing payment identifier in response: {list(data.keys())}"
        )
        assert "payment_status" in data
        assert data["payment_status"] in ("partial", "paid")
        assert "notifications" in data  # field exists (may be empty)

        # Extract payment_id (depends on refactor shape — try several keys)
        pid = (
            (data.get("payment") or {}).get("id")
            or (data.get("payment") or {}).get("payment_id")
            or data.get("payment_id")
            or data.get("id")
        )
        if pid:
            rr = requests.get(f"{BASE_URL}/receipts/{pid}", headers=admin_headers)
            assert rr.status_code in (200, 404), f"receipt lookup: {rr.status_code}"
            if rr.status_code == 200:
                rec = rr.json()
                # Should contain some receipt-shaped payload
                assert any(k in rec for k in ("amount", "payment", "id", "job_id"))

        # Verify payment persisted via GET /jobs/{id}
        vr = requests.get(f"{BASE_URL}/jobs/{job['id']}", headers=admin_headers)
        assert vr.status_code == 200
        fetched = vr.json()
        assert any(
            (p.get("note") == "TEST iter22") for p in fetched.get("payments", [])
        ), "new TEST payment not found on job after manual-payment"
