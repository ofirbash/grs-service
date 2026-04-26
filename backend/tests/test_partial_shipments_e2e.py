"""End-to-end API tests for the partial-return shipments feature (iter 26).
Hits the live backend via the public REACT_APP_BACKEND_URL / NEXT_PUBLIC_API_URL.
"""
import os
import time
import pytest
import requests

# Load .env from /app/frontend/.env for NEXT_PUBLIC_API_URL (no REACT_APP_BACKEND_URL in this project)
_env_path = "/app/frontend/.env"
BASE_URL = None
if os.path.exists(_env_path):
    with open(_env_path) as f:
        for line in f:
            if line.startswith("NEXT_PUBLIC_API_URL="):
                BASE_URL = line.strip().split("=", 1)[1].rstrip("/")
                # strip trailing /api because tests add /api themselves
                if BASE_URL.endswith("/api"):
                    BASE_URL = BASE_URL[:-4]
                break
assert BASE_URL, "NEXT_PUBLIC_API_URL missing"

# Test credentials — sourced from env vars; defaults match the seeded dev accounts.
ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "admin@bashari.com")
ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "admin123")
CUSTOMER_EMAIL = os.getenv("TEST_CUSTOMER_EMAIL", "customer@test.com")
CUSTOMER_PASSWORD = os.getenv("TEST_CUSTOMER_PASSWORD", "customer123")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    assert token
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def customer_id(auth_headers):
    # customer@test.com user → auth/me → client_id
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CUSTOMER_EMAIL, "password": CUSTOMER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    ctoken = r.json().get("access_token") or r.json().get("token")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {ctoken}"}, timeout=15).json()
    cid = me.get("client_id")
    if not cid:
        pytest.skip("customer user has no linked client_id")
    return cid


def _make_job_payload(customer_id, n_stones=3):
    stones = [
        {
            "sku": f"TEST_SKU_{i}",
            "stone_type": "Sapphire",
            "weight": 1.0 + i * 0.25,
            "value": 1000 + i * 500,
            "fee": 50,
        }
        for i in range(n_stones)
    ]
    return {
        "client_id": customer_id,
        "branch_id": "699b07417bfb8884ade46dbb",
        "service_type": "certification",
        "certificate_units": [{"stones": stones}],
        "notes": "iter26 e2e test",
    }


@pytest.fixture(scope="module")
def created_job(auth_headers, customer_id):
    payload = _make_job_payload(customer_id, 3)
    r = requests.post(f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    job = r.json()
    return job


# -------- Stone status on create --------
class TestStoneStatusOnCreate:
    def test_new_stones_have_at_office_status(self, created_job):
        stones = created_job["stones"]
        assert len(stones) == 3
        for s in stones:
            assert s.get("stone_status") == "at_office", f"Expected at_office, got {s.get('stone_status')} for stone {s.get('sku')}"
            assert s.get("cert_status") == "pending"


# -------- Send to lab shipment flips to at_lab --------
class TestSendToLabLifecycle:
    def test_send_to_lab_shipment_and_deliver(self, auth_headers, created_job):
        # Create send_stones_to_lab shipment
        payload = {
            "shipment_type": "send_stones_to_lab",
            "job_ids": [created_job["id"]],
            "courier": "internal",
            "source_address": "Test Office",
            "destination_address": "Test Lab",
            "tracking_number": "TEST-TRK-001",
        }
        r = requests.post(f"{BASE_URL}/api/shipments", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        ship = r.json()
        ship_id = ship["id"]

        # transition to delivered (or in_transit if that's the trigger)
        r2 = requests.put(f"{BASE_URL}/api/shipments/{ship_id}/status", headers=auth_headers, json={"status": "in_transit"}, timeout=15)
        # some backends use PATCH; try both
        if r2.status_code == 404 or r2.status_code == 405:
            r2 = requests.patch(f"{BASE_URL}/api/shipments/{ship_id}", headers=auth_headers, json={"status": "in_transit"}, timeout=15)
        assert r2.status_code in (200, 204), r2.text

        r3 = requests.put(f"{BASE_URL}/api/shipments/{ship_id}/status", headers=auth_headers, json={"status": "delivered"}, timeout=15)
        if r3.status_code in (404, 405):
            r3 = requests.patch(f"{BASE_URL}/api/shipments/{ship_id}", headers=auth_headers, json={"status": "delivered"}, timeout=15)
        assert r3.status_code in (200, 204), r3.text

        # Verify job stones are now at_lab
        time.sleep(0.5)
        rj = requests.get(f"{BASE_URL}/api/jobs/{created_job['id']}", headers=auth_headers, timeout=15)
        assert rj.status_code == 200
        job = rj.json()
        for s in job["stones"]:
            assert s.get("stone_status") == "at_lab", f"Expected at_lab, got {s.get('stone_status')} for {s.get('sku')}"

        # stash stone ids for the next test
        pytest.stone_ids = [s["id"] for s in job["stones"]]
        pytest.job_for_partial = job


# -------- Partial stones_from_lab return --------
class TestPartialReturn:
    def test_partial_return_updates_only_selected_stones(self, auth_headers):
        job = pytest.job_for_partial
        stone_ids = pytest.stone_ids
        assert len(stone_ids) == 3

        # Create partial return with only 2 stones
        payload = {
            "shipment_type": "stones_from_lab",
            "job_ids": [job["id"]],
            "stone_ids": [stone_ids[0], stone_ids[1]],
            "courier": "internal",
            "source_address": "Test Lab",
            "destination_address": "Test Office",
            "tracking_number": "TEST-TRK-002-PARTIAL",
        }
        r = requests.post(f"{BASE_URL}/api/shipments", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        ship = r.json()
        print(f"[partial shipment create response] keys={list(ship.keys())} stone_ids={ship.get('stone_ids')} total_stones={ship.get('total_stones')}")
        assert ship.get("total_stones") == 2, f"Expected total_stones=2, got {ship.get('total_stones')}"
        # NOTE: stone_ids in POST response is omitted by server (known bug). We GET to verify DB state.
        ship_get = requests.get(f"{BASE_URL}/api/shipments/{ship['id']}", headers=auth_headers, timeout=15).json()
        print(f"[partial shipment GET response] stone_ids={ship_get.get('stone_ids')}")
        assert set(ship_get.get("stone_ids") or []) == {stone_ids[0], stone_ids[1]}, \
            f"stone_ids not persisted: {ship_get.get('stone_ids')}"
        pytest.partial_ship = ship

        # Deliver it
        r2 = requests.put(f"{BASE_URL}/api/shipments/{ship['id']}/status", headers=auth_headers, json={"status": "delivered"}, timeout=15)
        if r2.status_code in (404, 405):
            r2 = requests.patch(f"{BASE_URL}/api/shipments/{ship['id']}", headers=auth_headers, json={"status": "delivered"}, timeout=15)
        assert r2.status_code in (200, 204), r2.text

        # Fetch job and check 2 are returned, 1 is still at_lab
        time.sleep(0.5)
        rj = requests.get(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=15)
        assert rj.status_code == 200
        updated_job = rj.json()
        by_id = {s["id"]: s for s in updated_job["stones"]}
        assert by_id[stone_ids[0]]["stone_status"] == "returned"
        assert by_id[stone_ids[1]]["stone_status"] == "returned"
        assert by_id[stone_ids[2]]["stone_status"] == "at_lab"

        # Critical: job.status must NOT have cascaded
        # We expect it to be whatever it was after send_stones_to_lab delivery (likely 'sent_to_lab' or similar)
        # The key assertion: it should NOT be 'stones_returned' / 'completed' from a partial return
        assert updated_job["status"] not in ("stones_returned", "completed"), \
            f"Partial return cascaded job.status unexpectedly: {updated_job['status']}"

    def test_notification_preview_partial(self, auth_headers):
        job = pytest.job_for_partial
        r = requests.get(
            f"{BASE_URL}/api/jobs/{job['id']}/notifications/preview/stones_returned",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        subject = body.get("subject") or ""
        html = body.get("html_body") or body.get("body") or body.get("html") or ""
        assert "Partial return" in subject, f"Subject missing 'Partial return': {subject}"
        assert "2 of 3" in subject, f"Subject should say '2 of 3': {subject}"
        assert "Returned in this shipment" in html
        assert "Still at the lab" in html
        # Fetch job stones and verify at least one SKU from each group appears in the email
        job_state = requests.get(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers).json()
        returned_skus = [s["sku"] for s in job_state["stones"] if s.get("stone_status") == "returned"]
        pending_skus = [s["sku"] for s in job_state["stones"] if s.get("stone_status") == "at_lab"]
        for sku in returned_skus + pending_skus:
            assert sku in html, f"SKU {sku} missing from email body"


# -------- Certificate partial return --------
class TestCertPartialReturn:
    def test_cert_partial_updates_only_selected(self, auth_headers, customer_id):
        """Create fresh job with all stones at_lab, then partial cert return."""
        payload = _make_job_payload(customer_id, 2)
        rj = requests.post(f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15)
        assert rj.status_code in (200, 201)
        job = rj.json()

        # send to lab
        s = requests.post(f"{BASE_URL}/api/shipments", headers=auth_headers, json={
            "shipment_type": "send_stones_to_lab", "job_ids": [job["id"]],
            "courier": "internal", "source_address": "A", "destination_address": "B",
            "tracking_number": "CERT-TEST-A"
        }, timeout=15)
        assert s.status_code in (200, 201), s.text
        sid = s.json()["id"]
        requests.put(f"{BASE_URL}/api/shipments/{sid}/status", headers=auth_headers, json={"status": "delivered"}, timeout=15)

        # get refreshed stone ids
        time.sleep(0.3)
        job = requests.get(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers).json()
        stone_ids = [x["id"] for x in job["stones"]]

        # partial cert return with 1 of 2
        r = requests.post(f"{BASE_URL}/api/shipments", headers=auth_headers, json={
            "shipment_type": "certificates_from_lab",
            "job_ids": [job["id"]],
            "stone_ids": [stone_ids[0]],
            "courier": "internal",
            "source_address": "Lab",
            "destination_address": "Office",
            "tracking_number": "CERT-PART-B",
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        cs = r.json()
        r2 = requests.put(f"{BASE_URL}/api/shipments/{cs['id']}/status", headers=auth_headers, json={"status": "delivered"}, timeout=15)
        assert r2.status_code in (200, 204)

        time.sleep(0.3)
        job2 = requests.get(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers).json()
        byid = {s["id"]: s for s in job2["stones"]}
        assert byid[stone_ids[0]]["cert_status"] == "delivered"
        assert byid[stone_ids[1]]["cert_status"] == "pending"
