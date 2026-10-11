"""Hardening regression: /auth/login should 401 (not 500) when a user row
lacks password_hash; /api/users should 200 (not 500) when a row lacks
created_at. Both discovered in iter-46 and claimed fixed in iter-47."""
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth import get_password_hash  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
if not BASE_URL.endswith("/api"):
    BASE_URL = BASE_URL + "/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bashari_erp")


@pytest.fixture()
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


def _super_admin_token():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": "admin@bashari.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_login_no_password_hash_returns_401_not_500(db):
    email = f"nopw-{uuid.uuid4().hex[:8]}@example.com"
    db.users.insert_one({
        "email": email,
        "full_name": "No PW",
        "role": "customer",
        "email_verified": True,
        "created_at": datetime.now(timezone.utc),
        # intentionally no password_hash
    })
    try:
        r = requests.post(f"{BASE_URL}/auth/login",
                          json={"email": email, "password": "anything"})
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"
    finally:
        db.users.delete_one({"email": email})


def test_users_list_no_created_at_returns_200_not_500(db):
    email = f"nocreated-{uuid.uuid4().hex[:8]}@example.com"
    db.users.insert_one({
        "email": email,
        "password_hash": get_password_hash("x"),
        "full_name": "No Created",
        "role": "super_admin",
        "email_verified": True,
        # intentionally no created_at
    })
    try:
        token = _super_admin_token()
        r = requests.get(f"{BASE_URL}/users",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, f"GET /users failed {r.status_code}: {r.text[:400]}"
        rows = r.json()
        # list or {items:[]}
        if isinstance(rows, dict):
            rows = rows.get("users") or rows.get("items") or []
        matched = [u for u in rows if u.get("email") == email]
        assert matched, "seeded user not returned"
        # created_at either None or a usable string/datetime fallback
        assert "created_at" in matched[0]
    finally:
        db.users.delete_one({"email": email})
