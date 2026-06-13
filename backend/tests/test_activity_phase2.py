"""Phase 2 backend tests for the Activity Log feature.

Covers the new filter and pagination capabilities of GET /api/activity plus
the two new helper endpoints GET /api/activity/actions and
GET /api/activity/actors.

Run:
    pytest /app/backend/tests/test_activity_phase2.py -v \
        --junitxml=/app/test_reports/pytest/activity_phase2_results.xml
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"


# ---------- Fixtures ---------- #
@pytest.fixture(scope="session")
def admin_token() -> str:
    """Log in as super_admin (Turnstile assumed to be bypassed at run time)."""
    resp = requests.post(
        f"{API}/auth/login",
        json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "website": "",
            "turnstile_token": "",
        },
        timeout=15,
    )
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed ({resp.status_code}): {resp.text[:200]}")
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_user(admin_token: str) -> dict:
    r = requests.get(
        f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def auth_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def seeded_activity(auth_headers, admin_user):
    """Seed deterministic activity rows: a fresh login_success and a
    client_created + client_updated pair so date/action/actor filters can
    be exercised against known data."""
    # The login fixture itself produces a login_success row already.
    suffix = uuid.uuid4().hex[:6].upper()
    client_name = f"TEST_ActivityPhase2_{suffix}"
    # Need a real branch_id — pick the first available
    br = requests.get(f"{API}/branches", headers=auth_headers, timeout=10)
    assert br.status_code == 200, br.text
    branches = br.json()
    assert branches, "no branches available to seed test client"
    branch_id = branches[0]["id"]
    create = requests.post(
        f"{API}/clients",
        json={
            "name": client_name,
            "email": f"phase2_{suffix.lower()}@example.com",
            "phone": "+10000000000",
            "branch_id": branch_id,
        },
        headers=auth_headers,
        timeout=15,
    )
    assert create.status_code in (200, 201), create.text
    client = create.json()
    client_id = client.get("id") or client.get("_id")

    # Force an update so client_updated is logged.
    upd = requests.put(
        f"{API}/clients/{client_id}",
        json={"phone": "+19999999999"},
        headers=auth_headers,
        timeout=15,
    )
    assert upd.status_code == 200, upd.text
    return {"client_id": client_id, "client_name": client_name, "actor_id": admin_user["id"]}


# ---------- /api/activity/actions ---------- #
class TestActionsCatalogue:
    def test_actions_requires_auth(self):
        r = requests.get(f"{API}/activity/actions", timeout=10)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_actions_returns_14_codes(self, auth_headers):
        r = requests.get(f"{API}/activity/actions", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Must contain at least the spec'd 14 codes including these two
        codes = [item["code"] for item in data]
        labels = [item["label"] for item in data]
        assert len(data) == 14, f"expected 14 action codes, got {len(data)}: {codes}"
        assert "job_notification_sent" in codes
        assert "login_success" in codes
        # All entries are well-formed
        for item in data:
            assert isinstance(item["code"], str) and item["code"]
            assert isinstance(item["label"], str) and item["label"]
        # No duplicates
        assert len(set(codes)) == len(codes)
        assert all(labels)


# ---------- /api/activity/actors ---------- #
class TestActorsCatalogue:
    def test_actors_requires_auth(self):
        r = requests.get(f"{API}/activity/actors", timeout=10)
        assert r.status_code == 401

    def test_actors_returns_admin_with_metadata(self, auth_headers, admin_user, seeded_activity):
        r = requests.get(f"{API}/activity/actors", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        actors = r.json()
        assert isinstance(actors, list)
        assert len(actors) >= 1
        match = next((a for a in actors if a["actor_id"] == admin_user["id"]), None)
        assert match is not None, f"admin actor_id {admin_user['id']} not found in {actors[:3]}"
        assert match["name"]
        assert match["role"] == "super_admin"
        # last_seen must be ISO parseable
        assert match["last_seen"]
        datetime.fromisoformat(match["last_seen"].replace("Z", "+00:00"))


# ---------- /api/activity action= filter (repeatable) ---------- #
class TestActionFilter:
    def test_multiple_actions_repeated_query_param(self, auth_headers, seeded_activity):
        r = requests.get(
            f"{API}/activity",
            params=[("action", "login_success"), ("action", "client_updated"), ("limit", 200)],
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        # At least our seeded client_updated + the login from the fixture must appear
        assert len(rows) >= 2, f"expected at least 2 rows, got {len(rows)}"
        for row in rows:
            assert row["action"] in {"login_success", "client_updated"}, (
                f"unexpected action {row['action']} in filtered result"
            )

    def test_single_action_filter(self, auth_headers, seeded_activity):
        r = requests.get(
            f"{API}/activity",
            params={"action": "client_created", "limit": 50},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        # Every row must match the single filter
        for row in rows:
            assert row["action"] == "client_created"


# ---------- actor_id filter ---------- #
class TestActorFilter:
    def test_actor_id_filter_returns_only_matching(self, auth_headers, admin_user):
        r = requests.get(
            f"{API}/activity",
            params={"actor_id": admin_user["id"], "limit": 50},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) >= 1
        for row in rows:
            assert row["actor_id"] == admin_user["id"]

    def test_actor_id_bogus_returns_empty(self, auth_headers):
        r = requests.get(
            f"{API}/activity",
            params={"actor_id": "ffffffffffffffffffffffff_bogus", "limit": 50},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == []


# ---------- from_date / to_date filter ---------- #
class TestDateFilters:
    def test_date_window_inclusive_lower_exclusive_upper(self, auth_headers, seeded_activity):
        # Choose a tight window that includes the seeded events: now-1h..now+1h
        # Note: API returns created_at as naive UTC ISO (no offset), so we
        # build naive bounds for the comparison.
        now = datetime.utcnow().replace(microsecond=0)
        frm = (now - timedelta(hours=1)).isoformat()
        to = (now + timedelta(hours=1)).isoformat()
        r = requests.get(
            f"{API}/activity",
            params={"from_date": frm, "to_date": to, "limit": 200},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) >= 1
        frm_dt = datetime.fromisoformat(frm)
        to_dt = datetime.fromisoformat(to)
        for row in rows:
            created = datetime.fromisoformat(row["created_at"])
            assert frm_dt <= created < to_dt, (
                f"row created_at {row['created_at']} outside [{frm}, {to})"
            )

    def test_to_date_exclusive(self, auth_headers, seeded_activity):
        """A to_date in the past (yesterday) must exclude today's rows."""
        yesterday = (datetime.utcnow() - timedelta(days=1)).replace(microsecond=0)
        r = requests.get(
            f"{API}/activity",
            params={"to_date": yesterday.isoformat(), "limit": 50},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        for row in rows:
            created = datetime.fromisoformat(row["created_at"])
            assert created < yesterday, f"row {row['created_at']} not strictly older than {yesterday}"

    def test_from_date_invalid_returns_400(self, auth_headers):
        r = requests.get(
            f"{API}/activity",
            params={"from_date": "not-a-date"},
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


# ---------- before= cursor pagination ---------- #
class TestCursorPagination:
    def test_before_returns_strictly_older_rows(self, auth_headers, seeded_activity):
        # First page: newest 2
        first = requests.get(
            f"{API}/activity",
            params={"limit": 2},
            headers=auth_headers,
            timeout=15,
        )
        assert first.status_code == 200, first.text
        page1 = first.json()
        assert len(page1) == 2, f"need at least 2 rows for cursor test, got {len(page1)}"
        cursor = page1[-1]["created_at"]  # oldest of the page

        # Second page: ?limit=2&before=<oldest>
        second = requests.get(
            f"{API}/activity",
            params={"limit": 2, "before": cursor},
            headers=auth_headers,
            timeout=15,
        )
        assert second.status_code == 200, second.text
        page2 = second.json()
        # All rows in page2 must be strictly older than the cursor
        cursor_dt = datetime.fromisoformat(cursor)
        for row in page2:
            row_dt = datetime.fromisoformat(row["created_at"])
            assert row_dt < cursor_dt, (
                f"cursor pagination drift: row {row['created_at']} >= cursor {cursor}"
            )
        # Page2 must not overlap page1
        page1_ids = {r["id"] for r in page1}
        for row in page2:
            assert row["id"] not in page1_ids, "cursor returned a row already in the previous page"


# ---------- unauthed list ---------- #
class TestUnauthed:
    def test_activity_list_unauthed_returns_401(self):
        r = requests.get(f"{API}/activity", timeout=10)
        assert r.status_code == 401
