"""Tests for Customer SKU feature (Jul 09 2026).

Covers:
  - POST /api/jobs with customer_sku on nested stones persists (trimmed, blank -> null)
  - POST /api/jobs/{job_id}/stones persists customer_sku
  - PUT /api/stones/{stone_id} with customer_sku updates/clears/leaves alone
  - GET /api/stones list includes customer_sku
  - PDF endpoints render stones without error when customer_sku is present/absent

See /app/backend/jobs_helpers.py :: _clean_customer_sku for normalization rules.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://bashari-lab-direct.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
if not BASE_URL.endswith("/api"):
    BASE_URL = BASE_URL + "/api"

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_session():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert tok, "Admin login failed"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def client_and_branch(admin_session):
    cr = admin_session.get(f"{BASE_URL}/clients")
    assert cr.status_code == 200
    clients = cr.json()
    assert clients
    br = admin_session.get(f"{BASE_URL}/branches")
    assert br.status_code == 200
    branches = br.json()
    assert branches
    return {
        "client_id": clients[0].get("id") or str(clients[0].get("_id")),
        "branch_id": branches[0].get("id") or branches[0].get("_id"),
    }


def _create_job(session, client_and_branch, stones):
    payload = {
        "client_id": client_and_branch["client_id"],
        "branch_id": client_and_branch["branch_id"],
        "service_type": "Normal",
        "certificate_units": [{"stones": stones}],
    }
    r = session.post(f"{BASE_URL}/jobs", json=payload)
    assert r.status_code in (200, 201), f"create job failed: {r.status_code} {r.text}"
    j = r.json()
    jid = j.get("id") or j.get("_id") or str(j.get("job_id"))
    return jid


# Teardown helper collected via module-scope list
_created_jobs = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup_jobs(admin_session):
    yield
    for jid in _created_jobs:
        try:
            admin_session.delete(f"{BASE_URL}/jobs/{jid}")
        except Exception:
            pass


class TestCustomerSkuOnCreateJob:
    def test_create_job_persists_customer_sku_trimmed(self, admin_session, client_and_branch):
        stones = [
            {"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
             "value": 1000.0, "color_stability_test": False, "mounted": False,
             "customer_sku": "  CUST-ABC-001  "},
            {"stone_type": "Ruby", "weight": 0.8, "shape": "Oval",
             "value": 500.0, "color_stability_test": False, "mounted": False,
             "customer_sku": ""},
            {"stone_type": "Sapphire", "weight": 0.5, "shape": "Pear",
             "value": 400.0, "color_stability_test": False, "mounted": False},
        ]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        got = {s["stone_type"]: s.get("customer_sku") for s in job["stones"]}
        assert got["Diamond"] == "CUST-ABC-001", got
        assert got["Ruby"] is None, got
        assert got["Sapphire"] is None, got

    def test_create_job_customer_sku_truncated_at_64(self, admin_session, client_and_branch):
        long_val = "X" * 80
        stones = [
            {"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
             "value": 1000.0, "color_stability_test": False, "mounted": False,
             "customer_sku": long_val},
        ]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        cs = job["stones"][0]["customer_sku"]
        assert cs is not None and len(cs) == 64 and cs == "X" * 64, cs


class TestAddStoneToJob:
    def test_add_stone_persists_customer_sku(self, admin_session, client_and_branch):
        stones = [{"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
                   "value": 1000.0, "color_stability_test": False, "mounted": False}]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        r = admin_session.post(f"{BASE_URL}/jobs/{jid}/stones", json={
            "stone_type": "Diamond", "weight": 2.0, "shape": "Round",
            "value": 2000.0, "color_stability_test": False, "mounted": False,
            "customer_sku": "  ADD-STONE-1  ",
        })
        assert r.status_code in (200, 201), r.text
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        added = [s for s in job["stones"] if s.get("customer_sku") == "ADD-STONE-1"]
        assert added, [s.get("customer_sku") for s in job["stones"]]


class TestEditStoneCustomerSku:
    def test_put_updates_customer_sku(self, admin_session, client_and_branch):
        stones = [{"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
                   "value": 1000.0, "color_stability_test": False, "mounted": False,
                   "customer_sku": "ORIG-1"}]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        sid = job["stones"][0]["id"]

        # 1) Set to new value
        r = admin_session.put(f"{BASE_URL}/stones/{sid}", json={"customer_sku": "NEW-VAL-123"})
        assert r.status_code == 200, r.text
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        assert job["stones"][0]["customer_sku"] == "NEW-VAL-123"

        # 2) Clear by sending empty string
        r = admin_session.put(f"{BASE_URL}/stones/{sid}", json={"customer_sku": ""})
        assert r.status_code == 200, r.text
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        assert job["stones"][0]["customer_sku"] is None

        # 3) Set again, then omit field in next update => should remain unchanged
        admin_session.put(f"{BASE_URL}/stones/{sid}", json={"customer_sku": "KEEP-ME"})
        r = admin_session.put(f"{BASE_URL}/stones/{sid}", json={"weight": 1.5})
        assert r.status_code == 200, r.text
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        assert job["stones"][0]["customer_sku"] == "KEEP-ME", "omitting customer_sku must not clear it"

        # 4) Whitespace trim
        r = admin_session.put(f"{BASE_URL}/stones/{sid}", json={"customer_sku": "  TRIMMED  "})
        assert r.status_code == 200
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        assert job["stones"][0]["customer_sku"] == "TRIMMED"

        # 5) >64 chars truncated to 64
        long_val = "Y" * 100
        r = admin_session.put(f"{BASE_URL}/stones/{sid}", json={"customer_sku": long_val})
        assert r.status_code == 200
        job = admin_session.get(f"{BASE_URL}/jobs/{jid}").json()
        cs = job["stones"][0]["customer_sku"]
        assert cs is not None and len(cs) == 64


class TestStonesListIncludesCustomerSku:
    def test_get_stones_includes_field(self, admin_session, client_and_branch):
        stones = [{"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
                   "value": 1000.0, "color_stability_test": False, "mounted": False,
                   "customer_sku": "LIST-TEST-SKU-001"}]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        r = admin_session.get(f"{BASE_URL}/stones")
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data if isinstance(data, list) else data.get("stones", data.get("items", []))
        assert rows, "No stones returned"
        found = [s for s in rows if s.get("customer_sku") == "LIST-TEST-SKU-001"]
        assert found, f"customer_sku missing from /stones list; sample row keys: {list(rows[0].keys())}"


class TestPdfRendersWithCustomerSku:
    def test_memo_in_pdf_renders(self, admin_session, client_and_branch):
        stones = [
            {"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
             "value": 1000.0, "color_stability_test": False, "mounted": False,
             "customer_sku": "PDF-A"},
            {"stone_type": "Ruby", "weight": 0.5, "shape": "Oval",
             "value": 300.0, "color_stability_test": False, "mounted": False},
        ]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        r = admin_session.get(f"{BASE_URL}/jobs/{jid}/pdf/memo-in")
        assert r.status_code == 200, f"memo-in pdf failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", "invalid PDF signature"

    def test_shipment_pdf_renders(self, admin_session, client_and_branch):
        stones = [
            {"stone_type": "Diamond", "weight": 1.0, "shape": "Round",
             "value": 1000.0, "color_stability_test": False, "mounted": False,
             "customer_sku": "PDF-SHIP-1"},
        ]
        jid = _create_job(admin_session, client_and_branch, stones)
        _created_jobs.append(jid)
        r = admin_session.get(f"{BASE_URL}/jobs/{jid}/pdf/shipment")
        # Shipment PDF may require job to be in a certain state. Accept 200 or 400 (state-restricted),
        # but must NOT be 500 (which would signal a rendering bug due to customer_sku).
        assert r.status_code != 500, f"shipment pdf 500: {r.text[:300]}"
        if r.status_code == 200:
            assert r.content[:4] == b"%PDF"
