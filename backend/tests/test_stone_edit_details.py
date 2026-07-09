"""Tests for PUT /api/stones/{stone_id} — stone details edit + fee recompute.

Covers the feature added Feb 28 2026: "Allow editing stone details after
adding it to a job, fees should change based on the new details."
Endpoint: /app/backend/routes/stones.py :: update_stone_details.
"""
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
BASE_URL = BASE_URL.rstrip("/")
if not BASE_URL.endswith("/api"):
    BASE_URL = BASE_URL + "/api"

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"
CUSTOMER_EMAIL = "customer@test.com"
CUSTOMER_PASSWORD = "customer123"
KIOSK_EMAIL = "pad-il@bashari.com"
KIOSK_PASSWORD = "pad123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_session():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert tok, "Admin login failed"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def customer_session():
    tok = _login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD)
    if not tok:
        pytest.skip("Customer login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def kiosk_session():
    tok = _login(KIOSK_EMAIL, KIOSK_PASSWORD)
    if not tok:
        pytest.skip("Kiosk login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_job(admin_session):
    """Create an isolated test job with one stone via API, yield it,
    then delete after the module tests finish."""
    # find a client for the job
    clients_r = admin_session.get(f"{BASE_URL}/clients")
    assert clients_r.status_code == 200, clients_r.text
    clients = clients_r.json()
    assert clients, "no clients seeded"
    client = clients[0]

    branch_r = admin_session.get(f"{BASE_URL}/branches")
    assert branch_r.status_code == 200
    branches = branch_r.json()
    assert branches
    branch_id = branches[0].get("id") or branches[0].get("_id")

    payload = {
        "client_id": client.get("id") or str(client.get("_id")),
        "client_name": client.get("company_name") or client.get("name") or "TEST",
        "branch_id": branch_id,
        "service_type": "Normal",
        "certificate_units": [
            {"stones": [
                {
                    "stone_type": "Diamond",
                    "weight": 1.0,
                    "shape": "Round",
                    "value": 1000.0,
                    "color_stability_test": False,
                    "mounted": False,
                }
            ]}
        ],
    }
    r = admin_session.post(f"{BASE_URL}/jobs", json=payload)
    assert r.status_code in (200, 201), f"create job failed: {r.status_code} {r.text}"
    job = r.json()
    job_id = job.get("id") or job.get("_id") or str(job.get("job_id"))
    assert job_id, f"no job_id in response: {job}"

    # refetch
    r2 = admin_session.get(f"{BASE_URL}/jobs/{job_id}")
    assert r2.status_code == 200
    job_full = r2.json()

    yield {"session": admin_session, "job": job_full, "job_id": job_id}

    # teardown
    try:
        admin_session.delete(f"{BASE_URL}/jobs/{job_id}")
    except Exception:
        pass


def _first_stone(job):
    stones = job.get("stones", [])
    assert stones, f"no stones on job: {job}"
    return stones[0]


# ---------------------------------------------------------------------------
# Edit weight + value → fee recomputed and job total matches
# ---------------------------------------------------------------------------

class TestStoneDetailsEdit:
    def test_edit_weight_and_value_recomputes_fee(self, test_job):
        s = test_job["session"]
        job_id = test_job["job_id"]
        # refetch to get the latest stone
        job = s.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone = _first_stone(job)
        stone_id = stone["id"]
        original_fee = stone.get("fee", 0)
        original_value = stone.get("value")

        # Move value into a completely different bracket (0-10k → 50k-100k)
        new_value = 60000.0
        new_weight = float(stone.get("weight") or 1) + 0.5

        r = s.put(f"{BASE_URL}/stones/{stone_id}", json={
            "weight": new_weight,
            "value": new_value,
        })
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        body = r.json()
        assert "new_fee" in body and "job_total_fee" in body and "stone" in body
        assert isinstance(body["new_fee"], (int, float))
        # Value change of this magnitude should produce a different fee
        assert body["new_fee"] != original_fee, (
            f"Fee unchanged after value bump (orig={original_fee}, new={body['new_fee']})"
        )

        # GET job to verify persistence
        job2 = s.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone2 = next(x for x in job2["stones"] if x["id"] == stone_id)
        assert abs(stone2["weight"] - new_weight) < 1e-6
        assert abs(stone2["value"] - new_value) < 1e-6
        assert abs(stone2["fee"] - body["new_fee"]) < 1e-6

        # job_total_fee should equal sum of active stone fees
        active_fee_sum = sum(x.get("fee", 0) for x in job2["stones"] if not x.get("cancelled"))
        assert abs(body["job_total_fee"] - active_fee_sum) < 1.0, (
            f"job_total_fee={body['job_total_fee']} vs sum(stones.fee)={active_fee_sum}"
        )

    def test_cs_toggle_increases_and_decreases_fee(self, test_job):
        s = test_job["session"]
        job_id = test_job["job_id"]
        # fetch CS fee from settings
        settings_r = s.get(f"{BASE_URL}/pricing/color-stability-fee")
        if settings_r.status_code != 200:
            settings_r = s.get(f"{BASE_URL}/settings/color-stability-fee")
        cs_fee_amount = None
        if settings_r.status_code == 200:
            j = settings_r.json()
            cs_fee_amount = j.get("fee") or j.get("value") or j.get("amount")

        job = s.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone = _first_stone(job)
        stone_id = stone["id"]
        fee_before = stone.get("fee", 0)
        cs_before = bool(stone.get("color_stability_test"))

        # Toggle CS on (if currently off) or off (if currently on)
        r_on = s.put(f"{BASE_URL}/stones/{stone_id}", json={
            "color_stability_test": not cs_before,
        })
        assert r_on.status_code == 200, r_on.text
        fee_on = r_on.json()["new_fee"]
        if cs_before:  # was on, now off -> fee should decrease
            assert fee_on < fee_before, (
                f"CS turned off should decrease fee: before={fee_before} after={fee_on}"
            )
        else:  # was off, now on -> fee should increase
            assert fee_on > fee_before, (
                f"CS turned on should increase fee: before={fee_before} after={fee_on}"
            )
        if cs_fee_amount is not None:
            expected_delta = cs_fee_amount if not cs_before else -cs_fee_amount
            assert abs((fee_on - fee_before) - expected_delta) < 1.0, (
                f"CS delta mismatch: got {fee_on - fee_before}, expected {expected_delta}"
            )

        # Toggle back
        r_off = s.put(f"{BASE_URL}/stones/{stone_id}", json={
            "color_stability_test": cs_before,
        })
        assert r_off.status_code == 200
        fee_off = r_off.json()["new_fee"]
        assert abs(fee_off - fee_before) < 1.0, (
            f"Toggling CS back should restore original fee: {fee_before} vs {fee_off}"
        )

    def test_cancelled_stone_cannot_be_edited(self, admin_session, test_job):
        """Cancelled stone → 400. Since stones are hard-deleted now, we
        simulate a legacy soft-cancelled stone by patching the DB
        directly with cancelled=true, then attempt the edit."""
        job_id = test_job["job_id"]
        job = admin_session.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone = _first_stone(job)
        stone_id = stone["id"]

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "bashari_erp")
        client = MongoClient(mongo_url)
        db = client[db_name]
        # mark cancelled
        db.jobs.update_one(
            {"_id": ObjectId(job_id), "stones.id": stone_id},
            {"$set": {"stones.$.cancelled": True}},
        )
        try:
            r = admin_session.put(f"{BASE_URL}/stones/{stone_id}", json={"weight": 2.0})
            assert r.status_code == 400, (
                f"Cancelled stone should return 400, got {r.status_code}: {r.text}"
            )
        finally:
            # restore
            db.jobs.update_one(
                {"_id": ObjectId(job_id), "stones.id": stone_id},
                {"$unset": {"stones.$.cancelled": ""}},
            )
            client.close()

    def test_customer_role_forbidden(self, customer_session, admin_session, test_job):
        job_id = test_job["job_id"]
        job = admin_session.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone = _first_stone(job)
        stone_id = stone["id"]
        r = customer_session.put(f"{BASE_URL}/stones/{stone_id}", json={"weight": 3.0})
        assert r.status_code in (401, 403), (
            f"Customer must not edit stones, got {r.status_code}: {r.text}"
        )

    def test_kiosk_role_forbidden(self, kiosk_session, admin_session, test_job):
        job_id = test_job["job_id"]
        job = admin_session.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone = _first_stone(job)
        stone_id = stone["id"]
        r = kiosk_session.put(f"{BASE_URL}/stones/{stone_id}", json={"weight": 3.0})
        assert r.status_code in (401, 403), (
            f"Kiosk must not edit stones, got {r.status_code}: {r.text}"
        )

    def test_unauthenticated_forbidden(self, admin_session, test_job):
        job_id = test_job["job_id"]
        job = admin_session.get(f"{BASE_URL}/jobs/{job_id}").json()
        stone = _first_stone(job)
        stone_id = stone["id"]
        r = requests.put(f"{BASE_URL}/stones/{stone_id}", json={"weight": 3.0})
        assert r.status_code in (401, 403), (
            f"No-auth must be rejected, got {r.status_code}: {r.text}"
        )

    def test_unknown_stone_returns_404(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/stones/nonexistent-id-xyz",
                              json={"weight": 1.0})
        assert r.status_code == 404
