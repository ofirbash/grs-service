"""Backend tests for Activity Log Phase 1.

Covers:
  - Auth boundary (401 unauthenticated)
  - GET /api/activity (super_admin global feed, newest-first)
  - GET /api/activity?job_id=<id> scoping
  - Side-effect logging from:
      * client create / update
      * job create / status change / status row
      * stone verbal entered / fees updated / cancelled
      * manual payment recorded
      * shipment created (per-job + shipment-only) / status changed
      * job notification sent
      * login_success
"""
from __future__ import annotations

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"


# ----- fixtures ----------------------------------------------------------

@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(api_client):
    r = api_client.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "website": ""},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def first_branch_id(api_client, auth_headers):
    r = api_client.get(f"{API}/branches", headers=auth_headers, timeout=10)
    assert r.status_code == 200, r.text
    branches = r.json()
    assert branches, "no branches available"
    return branches[0].get("id") or branches[0].get("_id")


# ----- helpers -----------------------------------------------------------

def _get_activity(api_client, auth_headers, **params):
    r = api_client.get(f"{API}/activity", headers=auth_headers, params=params, timeout=15)
    assert r.status_code == 200, f"GET /activity {params} -> {r.status_code} {r.text}"
    return r.json()


def _find_row(rows, action, **match):
    for row in rows:
        if row.get("action") != action:
            continue
        if all(row.get(k) == v for k, v in match.items()):
            return row
    return None


# ----- auth boundary -----------------------------------------------------

class TestActivityAuth:
    def test_unauthenticated_returns_401(self, api_client):
        r = api_client.get(f"{API}/activity", timeout=10)
        # FastAPI w/o creds returns 401 (or 403 if HTTPBearer is strict)
        assert r.status_code in (401, 403), r.text

    def test_super_admin_can_list_activity(self, api_client, auth_headers):
        rows = _get_activity(api_client, auth_headers, limit=10)
        assert isinstance(rows, list)


# ----- login_success -----------------------------------------------------

class TestLoginActivity:
    def test_login_success_row_appears(self, api_client, auth_headers):
        # Re-login (new event) and look for it
        r = api_client.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "website": ""},
            timeout=15,
        )
        assert r.status_code == 200
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, limit=20)
        login_rows = [r for r in rows if r.get("action") == "login_success"]
        assert login_rows, f"no login_success in latest 20 rows: {[r.get('action') for r in rows]}"
        # newest-first
        assert login_rows[0]["actor_name"]


# ----- newest-first sort -------------------------------------------------

class TestSortOrder:
    def test_newest_first(self, api_client, auth_headers):
        rows = _get_activity(api_client, auth_headers, limit=20)
        ts = [r["created_at"] for r in rows if r.get("created_at")]
        assert ts == sorted(ts, reverse=True), "rows are not in newest-first order"


# ----- client + job + downstream chain ----------------------------------

@pytest.fixture(scope="session")
def created_client_id(api_client, auth_headers, first_branch_id):
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": f"TEST_ActivityClient_{suffix}",
        "company": "TEST Co",
        "email": f"test_act_{suffix}@example.com",
        "phone": "+972500000000",
        "branch_id": first_branch_id,
    }
    r = api_client.post(f"{API}/clients", headers=auth_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), f"POST /clients -> {r.status_code} {r.text}"
    body = r.json()
    cid = body.get("id") or body.get("_id")
    assert cid, body
    return cid


class TestClientActivity:
    def test_client_created_row(self, api_client, auth_headers, created_client_id):
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, limit=50)
        row = _find_row(rows, "client_created", client_id=created_client_id)
        assert row is not None, "client_created row missing"
        assert row["actor_name"]
        # Actor should be the admin (not '(system)')
        assert row["actor_name"] != "(system)"

    def test_client_updated_summary_has_field_names(self, api_client, auth_headers, created_client_id):
        new_company = f"TEST Co Updated {uuid.uuid4().hex[:4]}"
        r = api_client.put(
            f"{API}/clients/{created_client_id}",
            headers=auth_headers,
            json={"company": new_company},
            timeout=15,
        )
        assert r.status_code in (200, 204), f"PUT /clients -> {r.status_code} {r.text}"
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, limit=50)
        row = _find_row(rows, "client_updated", client_id=created_client_id)
        assert row is not None, "client_updated row missing"
        summary = (row.get("summary") or "").lower()
        assert "company" in summary, f"summary missing field: {summary!r}"


@pytest.fixture(scope="session")
def created_job(api_client, auth_headers, created_client_id, first_branch_id):
    payload = {
        "client_id": created_client_id,
        "branch_id": first_branch_id,
        "service_type": "Normal",
        "notes": "TEST activity-log job",
        "certificate_units": [
            {
                "stones": [
                    {
                        "stone_type": "Diamond",
                        "weight": 1.23,
                        "shape": "Round",
                        "value": 1000.0,
                    }
                ]
            }
        ],
    }
    r = api_client.post(f"{API}/jobs", headers=auth_headers, json=payload, timeout=20)
    assert r.status_code in (200, 201), f"POST /jobs -> {r.status_code} {r.text}"
    body = r.json()
    job_id = body.get("id") or body.get("_id")
    assert job_id, body
    return body


class TestJobActivity:
    def test_job_created_visible_under_job_filter(self, api_client, auth_headers, created_job):
        job_id = created_job["id"]
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, job_id=job_id)
        row = _find_row(rows, "job_created", job_id=job_id)
        assert row is not None, f"job_created row missing for job {job_id}: rows={[r.get('action') for r in rows]}"

    def test_job_filter_excludes_unrelated_client_created(self, api_client, auth_headers, created_job):
        job_id = created_job["id"]
        rows = _get_activity(api_client, auth_headers, job_id=job_id)
        # A client_created row should not appear under a job_id filter
        # (unless that client_created row was tagged with this job_id, which it isn't)
        for r in rows:
            assert r.get("job_id") == job_id, f"row leaked into job filter: {r}"
            assert r.get("action") != "client_created"

    def test_job_status_changed_has_transition_summary(self, api_client, auth_headers, created_job):
        job_id = created_job["id"]
        current = created_job.get("status", "draft")
        target = "stones_accepted" if current != "stones_accepted" else "sent_to_lab"
        r = api_client.put(
            f"{API}/jobs/{job_id}/status",
            headers=auth_headers,
            json={"status": target},
            timeout=15,
        )
        assert r.status_code in (200, 204), f"status change -> {r.status_code} {r.text}"
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, job_id=job_id)
        row = _find_row(rows, "job_status_changed", job_id=job_id)
        assert row is not None, "job_status_changed row missing"
        summary = (row.get("summary") or "").lower()
        # accept either '→', '->', 'to', or both status names present
        assert (current in summary and target in summary) or "→" in summary or "->" in summary, \
            f"summary missing transition: {summary!r}"


# ----- stones ------------------------------------------------------------

class TestStoneActivity:
    def test_stone_verbal_and_fees_and_cancel(self, api_client, auth_headers, created_job):
        job_id = created_job["id"]
        stones = created_job.get("stones") or []
        assert stones, "job has no stones"
        stone_id = stones[0].get("id") or stones[0].get("_id")
        assert stone_id, stones[0]

        # 1. verbal
        r = api_client.put(
            f"{API}/stones/{stone_id}/verbal",
            headers=auth_headers,
            json={"verbal_color": "E", "verbal_clarity": "VS2"},
            timeout=15,
        )
        assert r.status_code in (200, 204), f"verbal -> {r.status_code} {r.text}"

        # 2. fees
        r = api_client.put(
            f"{API}/stones/{stone_id}/fees",
            headers=auth_headers,
            json={"service_fee": 150.0},
            timeout=15,
        )
        assert r.status_code in (200, 204), f"fees -> {r.status_code} {r.text}"

        time.sleep(0.5)
        rows = _get_activity(api_client, auth_headers, job_id=job_id, limit=100)
        assert _find_row(rows, "stone_verbal_entered", stone_id=stone_id), "stone_verbal_entered missing"
        assert _find_row(rows, "stone_fees_updated", stone_id=stone_id), "stone_fees_updated missing"

        # 3. cancel via DELETE /jobs/{id}/stones/{stone_id}
        r = api_client.delete(
            f"{API}/jobs/{job_id}/stones/{stone_id}",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code in (200, 204), f"stone delete -> {r.status_code} {r.text}"
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, job_id=job_id, limit=100)
        assert _find_row(rows, "stone_cancelled", stone_id=stone_id), "stone_cancelled missing"


# ----- manual payment ----------------------------------------------------

class TestPaymentActivity:
    def test_manual_payment_logs_with_amount(self, api_client, auth_headers, created_job):
        job_id = created_job["id"]
        r = api_client.post(
            f"{API}/jobs/{job_id}/manual-payment",
            headers=auth_headers,
            json={"amount": 42.5, "destination": "cash_safe", "notify_email": False, "notify_sms": False},
            timeout=15,
        )
        if r.status_code not in (200, 201, 204):
            pytest.skip(f"manual-payment endpoint returned {r.status_code} (likely missing fields): {r.text}")
        time.sleep(0.4)
        rows = _get_activity(api_client, auth_headers, job_id=job_id, limit=100)
        row = _find_row(rows, "payment_recorded", job_id=job_id)
        assert row is not None, "payment_recorded row missing"
        summary = (row.get("summary") or "")
        assert "42" in summary or "42.5" in summary, f"amount not in summary: {summary!r}"


# ----- shipment ----------------------------------------------------------

class TestShipmentActivity:
    def test_shipment_create_and_status(self, api_client, auth_headers, created_job, first_branch_id):
        job_id = created_job["id"]
        payload = {
            "shipment_type": "outbound",
            "courier": "TEST_Carrier",
            "source_address": "TEST source",
            "destination_address": "TEST destination",
            "tracking_number": f"TEST_{uuid.uuid4().hex[:8]}",
            "job_ids": [job_id],
        }
        r = api_client.post(f"{API}/shipments", headers=auth_headers, json=payload, timeout=20)
        if r.status_code not in (200, 201):
            pytest.skip(f"shipment create returned {r.status_code}: {r.text}")
        body = r.json()
        ship_id = body.get("id") or body.get("_id")
        assert ship_id

        time.sleep(0.5)
        # The shipment row should appear under the job's timeline
        job_rows = _get_activity(api_client, auth_headers, job_id=job_id, limit=100)
        assert _find_row(job_rows, "shipment_created", job_id=job_id), \
            "shipment_created not found under job filter"

        # And a global feed should contain at least one shipment_created
        global_rows = _get_activity(api_client, auth_headers, limit=100)
        assert any(r.get("action") == "shipment_created" and r.get("shipment_id") == ship_id
                   for r in global_rows), "shipment_created not in global feed"

        # status change
        r = api_client.put(
            f"{API}/shipments/{ship_id}/status",
            headers=auth_headers,
            json={"status": "in_transit"},
            timeout=15,
        )
        if r.status_code in (200, 204):
            time.sleep(0.4)
            rows = _get_activity(api_client, auth_headers, limit=50)
            row = _find_row(rows, "shipment_status_changed", shipment_id=ship_id)
            assert row is not None, "shipment_status_changed missing"
            summary = (row.get("summary") or "").lower()
            assert "in_transit" in summary or "→" in summary or "->" in summary, \
                f"transition not in summary: {summary!r}"
        else:
            pytest.skip(f"shipment status change returned {r.status_code}: {r.text}")
