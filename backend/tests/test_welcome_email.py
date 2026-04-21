"""Welcome email + regression tests for iteration 21.

Covers:
  - GET /api/notifications/welcome/preview  (default + personalised)
  - POST /api/notifications/welcome/bulk    (validation, mixed ids, skipped)
  - GET /api/jobs/{id}/notifications/preview/{type} for all 5 types (regression)
  - Auth login / clients / jobs list / job detail (regression)
"""
import os
import pytest
import requests

BASE_URL = "https://bashari-lab-direct.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@bashari.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------------------- REGRESSION: auth & listing -------------------
class TestRegressionAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@bashari.com", "password": "admin123"})
        assert r.status_code == 200
        data = r.json()
        assert (data.get("access_token") or data.get("token"))

    def test_customer_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "customer@test.com", "password": "customer123"})
        assert r.status_code == 200

    def test_invalid_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"})
        assert r.status_code in (400, 401)


class TestRegressionListing:
    def test_clients_list(self, admin_headers):
        r = requests.get(f"{API}/clients", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) > 0

    def test_jobs_list(self, admin_headers):
        r = requests.get(f"{API}/jobs", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) > 0

    def test_job_detail(self, admin_headers):
        jobs = requests.get(f"{API}/jobs", headers=admin_headers).json()
        job_id = jobs[0].get("id") or jobs[0].get("_id")
        r = requests.get(f"{API}/jobs/{job_id}", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert "stones" in body or "job_number" in body


# ------------------- WELCOME EMAIL PREVIEW -------------------
class TestWelcomePreview:
    def test_default_preview(self, admin_headers):
        r = requests.get(f"{API}/notifications/welcome/preview", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("subject", "html_body", "recipient_name", "recipient_email"):
            assert k in data, f"missing {k}"
        assert isinstance(data["html_body"], str) and len(data["html_body"]) > 50
        assert isinstance(data["subject"], str) and len(data["subject"]) > 0

    def test_personalised_preview(self, admin_headers):
        clients = requests.get(f"{API}/clients", headers=admin_headers).json()
        # pick a client that has a name
        target = next((c for c in clients if c.get("name")), clients[0])
        cid = target.get("id") or target.get("_id")
        name = target.get("name")
        r = requests.get(
            f"{API}/notifications/welcome/preview",
            params={"client_id": cid},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # html body should contain the name
        assert name in data["html_body"], f"Expected '{name}' in html_body"
        assert data["recipient_name"] == name

    def test_preview_requires_admin(self):
        r = requests.get(f"{API}/notifications/welcome/preview")
        assert r.status_code in (401, 403)


# ------------------- WELCOME EMAIL BULK -------------------
class TestWelcomeBulk:
    def test_empty_list_validation(self, admin_headers):
        r = requests.post(f"{API}/notifications/welcome/bulk", json={"client_ids": []}, headers=admin_headers)
        assert r.status_code == 400

    def test_invalid_object_id(self, admin_headers):
        r = requests.post(
            f"{API}/notifications/welcome/bulk",
            json={"client_ids": ["not-an-objectid"]},
            headers=admin_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert "results" in body and "summary" in body
        assert body["summary"]["failed"] >= 1
        first = body["results"][0]
        assert first["status"] == "failed"
        assert "Invalid client id" in first.get("error", "")

    def test_mixed_valid_and_invalid(self, admin_headers):
        # pick a client WITH an email (prefer test-looking emails)
        clients = requests.get(f"{API}/clients", headers=admin_headers).json()
        safe_keywords = ("ofir1@bashds", "ofir2@astteria", "ofir3@bashds", "test", "updated", "example.com")
        safe_client = None
        for c in clients:
            email = (c.get("email") or "").lower()
            if email and any(k in email for k in safe_keywords):
                safe_client = c
                break
        assert safe_client, "No safe test-email client available; cannot run mixed test without spamming real customers."
        safe_id = safe_client.get("id") or safe_client.get("_id")

        # pick a client with NO email on file
        no_email_client = next((c for c in clients if not c.get("email")), None)

        client_ids = ["badobjectid123", safe_id]
        if no_email_client:
            client_ids.append(no_email_client.get("id") or no_email_client.get("_id"))

        r = requests.post(
            f"{API}/notifications/welcome/bulk",
            json={"client_ids": client_ids},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "results" in body and "summary" in body
        summary = body["summary"]
        for k in ("sent", "mocked", "failed", "skipped"):
            assert k in summary
        assert summary["failed"] >= 1  # the bad id

        # the valid client entry must be sent OR mocked
        valid_entry = next((x for x in body["results"] if x.get("client_id") == safe_id), None)
        assert valid_entry is not None
        assert valid_entry["status"] in ("sent", "mocked"), f"unexpected status {valid_entry}"

        # no-email entry must be skipped
        if no_email_client:
            ne_id = no_email_client.get("id") or no_email_client.get("_id")
            ne_entry = next((x for x in body["results"] if x.get("client_id") == ne_id), None)
            assert ne_entry is not None
            assert ne_entry["status"] == "skipped"

    def test_bulk_requires_admin(self):
        r = requests.post(f"{API}/notifications/welcome/bulk", json={"client_ids": ["x"]})
        assert r.status_code in (401, 403)


# ------------------- JOB NOTIFICATION PREVIEWS (REGRESSION) -------------------
NOTIFICATION_TYPES = ("stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned")


class TestJobNotificationPreviewRegression:
    def _pick_job(self, admin_headers):
        jobs = requests.get(f"{API}/jobs", headers=admin_headers).json()
        # prefer a job with stones
        for j in jobs:
            jid = j.get("id") or j.get("_id")
            detail = requests.get(f"{API}/jobs/{jid}", headers=admin_headers).json()
            if detail.get("stones"):
                return jid
        return jobs[0].get("id") or jobs[0].get("_id")

    @pytest.mark.parametrize("ntype", NOTIFICATION_TYPES)
    def test_preview_all_types(self, admin_headers, ntype):
        jid = self._pick_job(admin_headers)
        r = requests.get(
            f"{API}/jobs/{jid}/notifications/preview/{ntype}",
            headers=admin_headers,
        )
        assert r.status_code == 200, f"{ntype} -> {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert "html_body" in data and len(data["html_body"]) > 50
        assert "subject" in data and "Job #" in data["subject"]
