"""
Regression test for the /pay page notify_url_address absolute-URL fix
(Jul 2026 BIT bug — pending-forever due to relative notify URL).

Verifies:
 1. Full payment flow: create job with fee -> mint token -> notify with Response=000
    -> status transitions to 'paid'.
 2. Failure path: Response != '000' keeps status 'pending'.
 3. notify with unknown token returns {status:'error'} (does NOT 500).
"""
import pytest
import requests
import uuid

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_config import BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD


@pytest.fixture(scope="module")
def auth_headers():
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def fresh_payment_token(auth_headers):
    """Create a brand-new job with a positive fee and mint a payment token."""
    clients = requests.get(f"{BASE_URL}/clients", headers=auth_headers).json()
    branches = requests.get(f"{BASE_URL}/branches", headers=auth_headers).json()
    assert clients and branches, "Need at least one client & branch"

    job_payload = {
        "client_id": clients[0]["id"],
        "branch_id": branches[0]["id"],
        "service_type": "Grading",
        "certificate_units": [],
        "stones": [{
            "sku": f"TEST-NOTIFY-{uuid.uuid4().hex[:6]}",
            "stone_type": "Diamond",
            "weight": 1.0,
            "fee": 42
        }],
    }
    resp = requests.post(f"{BASE_URL}/jobs", headers=auth_headers, json=job_payload)
    assert resp.status_code in (200, 201), f"Job create failed: {resp.text}"
    job_id = resp.json()["id"]

    tok_resp = requests.post(f"{BASE_URL}/jobs/{job_id}/payment-token", headers=auth_headers)
    assert tok_resp.status_code == 200, tok_resp.text
    return tok_resp.json()["payment_token"], job_id


class TestNotifyEndpointRegression:
    """The frontend fix passes an ABSOLUTE notify URL to Tranzila. That means
    Tranzila's servers can now actually POST to /api/payment/{token}/notify.
    These tests verify the receiving side is wired correctly and unchanged."""

    def test_notify_success_marks_paid(self, fresh_payment_token):
        token, _ = fresh_payment_token
        # Pre-condition: status is pending
        pre = requests.get(f"{BASE_URL}/payment/{token}/status")
        assert pre.status_code == 200
        assert pre.json()["status"] == "pending"

        # Simulate Tranzila's server-to-server POST (form-encoded, Response=000)
        notify_payload = {
            "Response": "000",
            "index": "TEST-TXN-12345",
            "ConfirmationCode": "CONF-42",
            "sum": "42.00",
            "currency": "2",
            "ccno": "1111",
            "cardtype": "1",
        }
        resp = requests.post(
            f"{BASE_URL}/payment/{token}/notify",
            data=notify_payload,  # form-encoded — matches Tranzila's behaviour
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("status") == "ok", f"Expected status=ok, got {body}"

        # Post-condition: status is paid, and matches what pollPaymentStatus watches
        post = requests.get(f"{BASE_URL}/payment/{token}/status")
        assert post.status_code == 200
        post_body = post.json()
        assert post_body["status"] == "paid", f"Expected paid, got {post_body}"
        assert post_body.get("transaction_id") == "TEST-TXN-12345"
        assert post_body.get("paid_at") is not None

    def test_notify_failure_keeps_pending(self, fresh_payment_token):
        token, _ = fresh_payment_token
        resp = requests.post(
            f"{BASE_URL}/payment/{token}/notify",
            data={"Response": "999", "index": "FAIL-1", "sum": "42.00"},
        )
        assert resp.status_code == 200
        assert resp.json().get("status") == "ok"

        # Still pending after failure
        post = requests.get(f"{BASE_URL}/payment/{token}/status")
        assert post.json()["status"] == "pending"

    def test_notify_unknown_token_soft_fails(self):
        """Unknown token must NOT 500 — Tranzila will retry indefinitely if
        we return 5xx, so we return 200 with {status:'error'}."""
        resp = requests.post(
            f"{BASE_URL}/payment/bogus-token-xxx/notify",
            data={"Response": "000"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("status") == "error"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
