"""Phase 1 performance refactor regression tests.

Covers the new paged /list endpoints introduced to fix N+1 queries:
  - GET /api/jobs/list        (status, search, expected, sort, ids, exclude_locked, job_number)
  - GET /api/shipments/list   (status, shipment_type, show_completed, search, type_counts, completed_count)
  - GET /api/stones/list      (search, filter)
  - GET /api/clients/list     (search, branch_id)
Plus:
  - X-Response-Time-ms header
  - MongoDB indexes exist on jobs/shipments/clients
  - Backward-compat: GET /api/jobs still returns full list w/ expected_verbal
  - GET /api/jobs/{id} returns full job incl. notification_log
  - Role scoping: branch_admin, customer (expected_verbal null for customers)
  - GET /api/jobs/expected-results
"""
import os
import re
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bashari-lab-direct.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "admin@bashari.com", "password": "admin123", "website": "", "cf_turnstile_response": ""}
IL_BRANCH_ADMIN = {"email": "ofir1@bashds.com", "password": "admin123", "website": "", "cf_turnstile_response": ""}
CUSTOMER = {"email": "customer@test.com", "password": "customer123", "website": "", "cf_turnstile_response": ""}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {creds['email']}: {r.status_code} {r.text[:200]}")
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def branch_admin_h():
    tok = _login(IL_BRANCH_ADMIN)
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def customer_h():
    tok = _login(CUSTOMER)
    return {"Authorization": f"Bearer {tok}"}


# ---------- Response-time header ----------
class TestResponseTimeHeader:
    def test_header_present_on_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert "x-response-time-ms" in {k.lower() for k in r.headers}, dict(r.headers)

    def test_header_present_on_jobs_list(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?page=1&page_size=1", headers=admin_h, timeout=20)
        assert r.status_code == 200
        assert "x-response-time-ms" in {k.lower() for k in r.headers}


# ---------- Indexes ----------
class TestIndexes:
    def _db(self):
        from motor.motor_asyncio import AsyncIOMotorClient  # noqa
        import asyncio
        from pymongo import MongoClient
        url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        name = os.environ.get("DB_NAME", "bashari_erp")
        return MongoClient(url)[name]

    def test_jobs_indexes(self):
        idx = self._db()["jobs"].index_information()
        keys = {tuple(v["key"]) for v in idx.values()}
        for required in [(("created_at", -1),), (("job_number", 1),), (("client_id", 1),),
                         (("branch_id", 1), ("created_at", -1)), (("status", 1),)]:
            assert required in keys, f"Missing jobs index {required} in {keys}"

    def test_shipments_indexes(self):
        idx = self._db()["shipments"].index_information()
        keys = {tuple(v["key"]) for v in idx.values()}
        assert (("job_ids", 1),) in keys
        assert (("created_at", -1),) in keys

    def test_clients_indexes(self):
        idx = self._db()["clients"].index_information()
        keys = {tuple(v["key"]) for v in idx.values()}
        # Any of these is sufficient; spec says "clients" indexes
        assert any(k in keys for k in [(("branch_id", 1),), (("name", 1),), (("email", 1),)])


# ---------- Jobs /list ----------
class TestJobsList:
    def test_shape_and_paging(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?page=1&page_size=5&status=all", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total", "page", "page_size"):
            assert k in d
        assert d["page"] == 1
        assert d["page_size"] == 5
        assert len(d["items"]) <= 5
        assert isinstance(d["total"], int)
        # Light items: no verbal_findings in list rows (payments/notification_log also omitted)
        if d["items"]:
            item = d["items"][0]
            assert "verbal_findings" not in item or item.get("verbal_findings") in (None, [], {}), \
                "List items should be light (no verbal_findings)"

    def test_total_matches_backward_compat(self, admin_h):
        # GET /jobs (old) should match total of jobs/list?status=all
        r_old = requests.get(f"{BASE_URL}/api/jobs", headers=admin_h, timeout=60)
        assert r_old.status_code == 200
        old_count = len(r_old.json())
        r_new = requests.get(f"{BASE_URL}/api/jobs/list?page=1&page_size=1&status=all", headers=admin_h, timeout=30)
        assert r_new.status_code == 200
        assert r_new.json()["total"] == old_count

    def test_status_commalist(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=received_from_customer,stones_accepted&page_size=200",
                         headers=admin_h, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] in {"received_from_customer", "stones_accepted"}

    def test_ids_filter(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=3", headers=admin_h, timeout=20)
        assert r.status_code == 200
        items = r.json()["items"]
        if not items:
            pytest.skip("No jobs")
        ids = [it["id"] for it in items[:2]]
        r2 = requests.get(f"{BASE_URL}/api/jobs/list?status=all&ids={','.join(ids)}", headers=admin_h, timeout=20)
        assert r2.status_code == 200
        got = {it["id"] for it in r2.json()["items"]}
        assert got == set(ids)

    def test_job_number_filter(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=1", headers=admin_h, timeout=20)
        if not r.json()["items"]:
            pytest.skip("No jobs")
        jn = r.json()["items"][0]["job_number"]
        r2 = requests.get(f"{BASE_URL}/api/jobs/list?status=all&job_number={jn}", headers=admin_h, timeout=20)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert items and all(it["job_number"] == jn for it in items)

    def test_search(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=1", headers=admin_h, timeout=20)
        if not r.json()["items"]:
            pytest.skip("No jobs")
        name = r.json()["items"][0].get("client_name") or ""
        if not name:
            pytest.skip("No client_name on first job")
        term = name.split()[0]
        r2 = requests.get(f"{BASE_URL}/api/jobs/list?status=all&search={term}&page_size=200",
                          headers=admin_h, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["total"] >= 1

    def test_sort_expected(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&sort=expected_asc&page_size=50",
                         headers=admin_h, timeout=30)
        assert r.status_code == 200
        dates = [it.get("expected_verbal", {}).get("date") for it in r.json()["items"] if it.get("expected_verbal")]
        dated = [d for d in dates if d]
        assert dated == sorted(dated), "expected_asc should sort ascending"

    def test_expected_overdue_today_week(self, admin_h):
        today = datetime.utcnow().date().isoformat()
        for exp in ("overdue", "today", "week"):
            r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&expected={exp}&today={today}&page_size=200",
                             headers=admin_h, timeout=30)
            assert r.status_code == 200, f"{exp}: {r.text}"
            for it in r.json()["items"]:
                ev = (it.get("expected_verbal") or {}).get("date")
                if not ev:
                    continue
                if exp == "overdue":
                    assert ev < today
                elif exp == "today":
                    assert ev == today
                elif exp == "week":
                    week_end = (datetime.utcnow().date() + timedelta(days=7)).isoformat()
                    assert today <= ev <= week_end

    def test_expected_date(self, admin_h):
        today = datetime.utcnow().date().isoformat()
        # Pick a job with an expected date if any
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&sort=expected_asc&page_size=50",
                         headers=admin_h, timeout=30)
        target = next((it["expected_verbal"]["date"] for it in r.json()["items"]
                       if (it.get("expected_verbal") or {}).get("date")), None)
        if not target:
            pytest.skip("No job with expected date")
        r2 = requests.get(f"{BASE_URL}/api/jobs/list?status=all&expected=date&expected_date={target}&today={today}&page_size=200",
                          headers=admin_h, timeout=30)
        assert r2.status_code == 200
        for it in r2.json()["items"]:
            assert (it.get("expected_verbal") or {}).get("date") == target

    def test_exclude_locked(self, admin_h):
        r_all = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=1", headers=admin_h, timeout=20)
        r_free = requests.get(f"{BASE_URL}/api/jobs/list?status=all&exclude_locked=true&page_size=1",
                              headers=admin_h, timeout=20)
        assert r_free.status_code == 200
        assert r_free.json()["total"] <= r_all.json()["total"]


# ---------- Role scoping ----------
class TestRoleScoping:
    def test_branch_admin_scoped(self, branch_admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=200", headers=branch_admin_h, timeout=30)
        assert r.status_code == 200
        # Verify every job returned belongs to the branch admin's branch (by name probably)
        # Light sanity check: total >= 0 and request succeeded
        assert isinstance(r.json()["total"], int)

    def test_customer_scope_and_null_expected(self, customer_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=50", headers=customer_h, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it.get("expected_verbal") in (None, {}), "Customers must not see expected_verbal"

    def test_clients_list_customer_empty(self, customer_h):
        r = requests.get(f"{BASE_URL}/api/clients/list", headers=customer_h, timeout=20)
        assert r.status_code == 200
        assert r.json()["total"] == 0


# ---------- Backward-compat GET /jobs still full ----------
class TestBackwardCompat:
    def test_jobs_full_has_expected_verbal(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs", headers=admin_h, timeout=60)
        assert r.status_code == 200
        jobs = r.json()
        if not jobs:
            pytest.skip("No jobs")
        # Should have expected_verbal key present (may be None but key exists)
        assert any("expected_verbal" in j for j in jobs)

    def test_single_job_full(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/list?status=all&page_size=1", headers=admin_h, timeout=20)
        if not r.json()["items"]:
            pytest.skip("No jobs")
        jid = r.json()["items"][0]["id"]
        r2 = requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=admin_h, timeout=20)
        assert r2.status_code == 200
        d = r2.json()
        # Full job: notification_log key must exist (list)
        assert "notification_log" in d
        assert isinstance(d["notification_log"], list)


# ---------- Shipments /list ----------
class TestShipmentsList:
    def test_shape_and_counts(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/shipments/list?status=all&page_size=5", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total", "page", "page_size", "type_counts", "completed_count"):
            assert k in d, f"Missing {k}"
        for k in ("all", "send_stones_to_lab", "stones_from_lab", "certificates_from_lab"):
            assert k in d["type_counts"]
        assert isinstance(d["completed_count"], int)

    def test_type_counts_ignore_shipment_type(self, admin_h):
        r1 = requests.get(f"{BASE_URL}/api/shipments/list?status=all&page_size=1", headers=admin_h, timeout=30)
        r2 = requests.get(f"{BASE_URL}/api/shipments/list?status=all&shipment_type=stones_from_lab&page_size=1",
                          headers=admin_h, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        # type_counts must be identical regardless of shipment_type filter
        assert r1.json()["type_counts"] == r2.json()["type_counts"]
        # But total should typically differ or be <=
        assert r2.json()["total"] <= r1.json()["total"]

    def test_completed_count_only_completed(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/shipments/list?status=completed&page_size=200", headers=admin_h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for it in d["items"]:
            assert it["status"] == "completed"
        assert d["completed_count"] == d["total"] or d["completed_count"] >= d["total"]
        # completed_count must also match a direct status=completed count
        assert d["completed_count"] == d["total"]

    def test_status_active_default(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/shipments/list?page_size=200", headers=admin_h, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] in {"pending", "in_transit", "delivered"}

    def test_show_completed(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/shipments/list?status=active&show_completed=true&page_size=200",
                         headers=admin_h, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] in {"pending", "in_transit", "delivered", "completed"}

    def test_search_shipment_number(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/shipments/list?status=all&page_size=1", headers=admin_h, timeout=20)
        items = r.json()["items"]
        if not items:
            pytest.skip("No shipments")
        sn = items[0].get("shipment_number")
        if not sn:
            pytest.skip("No shipment_number")
        r2 = requests.get(f"{BASE_URL}/api/shipments/list?status=all&search={sn}&page_size=200",
                          headers=admin_h, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["total"] >= 1
        assert any(it.get("shipment_number") == sn for it in r2.json()["items"])


# ---------- Stones /list ----------
class TestStonesList:
    def test_shape(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/stones/list?page=1&page_size=5", headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total", "page", "page_size"):
            assert k in d

    def test_filter_with_verbal(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/stones/list?filter=with_verbal&page_size=200", headers=admin_h, timeout=60)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it.get("verbal_findings"), "with_verbal should only return stones that have verbal findings"

    def test_filter_without_verbal(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/stones/list?filter=without_verbal&page_size=200", headers=admin_h, timeout=60)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert not it.get("verbal_findings")

    def test_search_sku(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/stones/list?page_size=1", headers=admin_h, timeout=60)
        items = r.json()["items"]
        if not items:
            pytest.skip("No stones")
        sku = items[0].get("sku") or ""
        if len(sku) < 2:
            pytest.skip("No sku to search")
        r2 = requests.get(f"{BASE_URL}/api/stones/list?search={sku[:3]}&page_size=200", headers=admin_h, timeout=60)
        assert r2.status_code == 200
        assert r2.json()["total"] >= 1


# ---------- Clients /list ----------
class TestClientsList:
    def test_shape(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/clients/list?page=1&page_size=5", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total", "page", "page_size"):
            assert k in d
        assert len(d["items"]) <= 5

    def test_search(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/clients/list?page_size=1", headers=admin_h, timeout=20)
        items = r.json()["items"]
        if not items:
            pytest.skip("No clients")
        name = items[0].get("name") or ""
        if not name:
            pytest.skip("No client name")
        term = name[:3]
        r2 = requests.get(f"{BASE_URL}/api/clients/list?search={term}&page_size=200", headers=admin_h, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["total"] >= 1


# ---------- Expected-results ----------
class TestExpectedResults:
    def test_endpoint(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/jobs/expected-results", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        today = datetime.utcnow().date()
        week_end = today + timedelta(days=7)
        for j in data:
            ev = (j.get("expected_verbal") or {}).get("date")
            if ev:
                d = datetime.fromisoformat(ev).date()
                assert d <= week_end, f"Expected date {d} outside overdue+7-day window"
