"""Tests for Expected Verbal Date tracking + Precious/Semi-Precious shipment memos."""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("preview_endpoint", "https://bashari-lab-direct.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@bashari.com", "password": "admin123", "website": ""})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"email": "customer@test.com", "password": "customer123", "website": ""})
    if r.status_code != 200:
        pytest.skip("customer login unavailable")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def customer(customer_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"})
    return s


# ---------- Pricing: service_turnaround_days + precious_stone_types ----------

def test_pricing_defaults_present(admin):
    r = admin.get(f"{API}/pricing")
    assert r.status_code == 200
    data = r.json()
    assert "service_turnaround_days" in data
    assert "precious_stone_types" in data
    # defaults may already be persisted; just check keys/types
    assert isinstance(data["service_turnaround_days"], dict)
    assert isinstance(data["precious_stone_types"], list)


def test_pricing_put_persists_and_drops_stale_keys(admin):
    original = admin.get(f"{API}/pricing").json()
    try:
        payload = {
            "brackets": original["brackets"],
            "color_stability_fee": original["color_stability_fee"],
            "mounted_jewellery_fee": original["mounted_jewellery_fee"],
            "service_types": original["service_types"],  # unchanged
            "stone_types": original["stone_types"],
            "shapes": original["shapes"],
            "payment_destinations": original["payment_destinations"],
            "couriers": original["couriers"],
            "recheck_reasons": original["recheck_reasons"],
            # Include stale keys that must be dropped
            "service_turnaround_days": {**{st: (8 if st == "Express" else 30 if st == "Normal" else 15) for st in original["service_types"]}, "GhostServiceType": 99},
            "precious_stone_types": ["Ruby", "Sapphire", "Emerald", "GhostStone"],
        }
        r = admin.put(f"{API}/pricing", json=payload)
        assert r.status_code == 200, r.text
        after = admin.get(f"{API}/pricing").json()
        assert "GhostServiceType" not in after["service_turnaround_days"]
        assert "GhostStone" not in after["precious_stone_types"]
        for st in original["service_types"]:
            assert st in after["service_turnaround_days"]
    finally:
        # restore
        admin.put(f"{API}/pricing", json={
            "brackets": original["brackets"],
            "color_stability_fee": original["color_stability_fee"],
            "mounted_jewellery_fee": original["mounted_jewellery_fee"],
            "service_types": original["service_types"],
            "stone_types": original["stone_types"],
            "shapes": original["shapes"],
            "payment_destinations": original["payment_destinations"],
            "couriers": original["couriers"],
            "recheck_reasons": original["recheck_reasons"],
            "service_turnaround_days": original["service_turnaround_days"],
            "precious_stone_types": original["precious_stone_types"],
        })


def test_rename_service_type_moves_turnaround(admin):
    original = admin.get(f"{API}/pricing").json()
    service_types = list(original["service_types"])
    turnaround = dict(original["service_turnaround_days"])
    # Add a temp service type with turnaround
    tmp_old = "TMP_ServiceRename_Old"
    tmp_new = "TMP_ServiceRename_New"
    service_types_new = service_types + [tmp_old]
    turnaround_new = {**turnaround, tmp_old: 12}
    payload = {**original, "service_types": service_types_new, "service_turnaround_days": turnaround_new}
    r = admin.put(f"{API}/pricing", json=payload)
    assert r.status_code == 200
    try:
        r = admin.post(f"{API}/pricing/rename-service-type", json={"old_name": tmp_old, "new_name": tmp_new})
        assert r.status_code == 200, r.text
        after = admin.get(f"{API}/pricing").json()
        assert tmp_old not in after["service_turnaround_days"]
        assert after["service_turnaround_days"].get(tmp_new) == 12
    finally:
        # Clean up: restore original service_types / turnaround
        admin.put(f"{API}/pricing", json={**original})


# ---------- Jobs: expected_verbal ----------

@pytest.fixture(scope="module")
def test_client(admin):
    branches = admin.get(f"{API}/branches").json()
    branch_id = branches[0]["id"]
    r = admin.post(f"{API}/clients", json={
        "name": "TEST_ExpectedVerbal_Client",
        "email": "test_expected_verbal@example.com",
        "phone": "+15550000111",
        "branch_id": branch_id,
    })
    assert r.status_code in (200, 201), r.text
    client = r.json()
    yield client
    try:
        admin.delete(f"{API}/clients/{client['id']}")
    except Exception:
        pass


@pytest.fixture
def jobs_pair(admin, test_client):
    created = []
    branch_id = test_client["branch_id"] if isinstance(test_client, dict) and test_client.get("branch_id") else admin.get(f"{API}/branches").json()[0]["id"]

    def make(service_type):
        r = admin.post(f"{API}/jobs", json={
            "client_id": test_client["id"],
            "service_type": service_type,
            "stones": [],
            "branch_id": branch_id,
            "certificate_units": [],
        })
        assert r.status_code in (200, 201), r.text
        job = r.json()
        created.append(job["id"])
        return job

    yield make
    for jid in created:
        try:
            admin.delete(f"{API}/jobs/{jid}")
        except Exception:
            pass


def test_jobs_include_expected_verbal_structure(admin, jobs_pair):
    job = jobs_pair("Express")
    r = admin.get(f"{API}/jobs/{job['id']}")
    assert r.status_code == 200
    data = r.json()
    assert "expected_verbal" in data
    ev = data["expected_verbal"]
    for k in ("date", "auto_date", "overridden", "sent_date", "shipment_number", "received"):
        assert k in ev
    # not shipped yet
    assert ev["sent_date"] is None
    assert ev["date"] is None


def _create_to_lab_shipment(admin, job_ids, date_sent_iso):
    """Create a to-lab shipment with given date_sent."""
    payload = {
        "shipment_type": "send_stones_to_lab",
        "job_ids": job_ids,
        "date_sent": date_sent_iso,
        "courier": "FedEx",
        "tracking_number": "TEST-TRK-EXP",
        "source_address": "Lab",
        "destination_address": "Client Office",
    }
    r = admin.post(f"{API}/shipments", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_expected_date_computed_from_shipment_and_turnaround(admin, jobs_pair):
    express = jobs_pair("Express")
    normal = jobs_pair("Normal")
    base = datetime(2026, 1, 10)
    ship = _create_to_lab_shipment(admin, [express["id"], normal["id"]], base.isoformat())
    try:
        r = admin.get(f"{API}/jobs/{express['id']}").json()
        assert r["expected_verbal"]["sent_date"] == "2026-01-10"
        assert r["expected_verbal"]["date"] == (base.date() + timedelta(days=8)).isoformat()
        assert r["expected_verbal"]["overridden"] is False

        r = admin.get(f"{API}/jobs/{normal['id']}").json()
        assert r["expected_verbal"]["date"] == (base.date() + timedelta(days=30)).isoformat()

        # Change service_type -> recompute
        admin.put(f"{API}/jobs/{express['id']}", json={"service_type": "Normal"})
        r = admin.get(f"{API}/jobs/{express['id']}").json()
        assert r["expected_verbal"]["date"] == (base.date() + timedelta(days=30)).isoformat()

        # Change shipment date_sent -> recompute
        new_base = datetime(2026, 2, 1)
        pr = admin.put(f"{API}/shipments/{ship['id']}", json={"date_sent": new_base.isoformat()})
        assert pr.status_code == 200, pr.text
        r = admin.get(f"{API}/jobs/{normal['id']}").json()
        assert r["expected_verbal"]["sent_date"] == "2026-02-01"
        assert r["expected_verbal"]["date"] == (new_base.date() + timedelta(days=30)).isoformat()
    finally:
        try:
            admin.delete(f"{API}/shipments/{ship['id']}")
        except Exception:
            pass


def test_override_set_clear_invalid_and_activity_log(admin, jobs_pair):
    job = jobs_pair("Express")
    jid = job["id"]
    # Invalid
    r = admin.put(f"{API}/jobs/{jid}/expected-verbal-date", json={"date": "not-a-date"})
    assert r.status_code == 400
    # Set override
    r = admin.put(f"{API}/jobs/{jid}/expected-verbal-date", json={"date": "2026-05-15"})
    assert r.status_code == 200
    data = r.json()
    assert data["expected_verbal"]["date"] == "2026-05-15"
    assert data["expected_verbal"]["overridden"] is True
    # Clear
    r = admin.put(f"{API}/jobs/{jid}/expected-verbal-date", json={"date": None})
    assert r.status_code == 200
    assert r.json()["expected_verbal"]["overridden"] is False
    # Activity log
    r = admin.get(f"{API}/activity", params={"job_id": jid})
    assert r.status_code == 200
    entries = r.json() if isinstance(r.json(), list) else r.json().get("entries", r.json().get("items", []))
    actions = [e.get("action") for e in entries]
    assert any(a == "job_expected_date_changed" for a in actions), f"actions seen: {actions}"


def test_customer_role_gets_null_expected_verbal(customer):
    r = customer.get(f"{API}/jobs")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("jobs", []))
    for j in items[:10]:
        assert j.get("expected_verbal") is None
