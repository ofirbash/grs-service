"""
Tests for the 401-on-missing-auth fix (Bashari idle-session bug).

Verifies:
  - GET /api/jobs with no Authorization -> 401 "Not authenticated"
  - Malformed Authorization (Basic xxx)  -> 401 "Invalid authentication scheme"
  - Bad bearer token                      -> 401 "Invalid token"
  - Expired but well-signed JWT           -> 401 "Token expired"
  - Valid admin JWT                       -> 200 + JSON array
  - Customer JWT against admin endpoint   -> 403 mentioning "admin"
  - Smoke check of /auth/login flow       -> succeeds (Turnstile temporarily blanked)
"""

import os
import time
import shutil
import subprocess
import pytest
import requests
import jwt as pyjwt
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8001"
JWT_SECRET = "bashari-secret-key-2024-secure"
JWT_ALG = "HS256"

ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"
CUSTOMER_EMAIL = "customer@test.com"
CUSTOMER_PASSWORD = "customer123"

BACKEND_ENV = "/app/backend/.env"


# ---------- helpers ----------

def _restart_backend():
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False,
                   capture_output=True)
    # Wait for it to come back
    for _ in range(30):
        try:
            r = requests.get(f"{BASE_URL}/api/jobs", timeout=2)
            if r.status_code in (200, 401, 403):
                return
        except Exception:
            pass
        time.sleep(1)


def _blank_turnstile_secret_and_restart():
    """Temporarily blank TURNSTILE_SECRET_KEY in .env so login bypasses
    Cloudflare. Returns the original value so it can be restored."""
    with open(BACKEND_ENV) as f:
        content = f.read()
    original_line = None
    new_lines = []
    for line in content.splitlines():
        if line.startswith("TURNSTILE_SECRET_KEY="):
            original_line = line
            new_lines.append("TURNSTILE_SECRET_KEY=")
        else:
            new_lines.append(line)
    with open(BACKEND_ENV, "w") as f:
        f.write("\n".join(new_lines) + "\n")
    _restart_backend()
    return original_line


def _restore_turnstile(original_line):
    with open(BACKEND_ENV) as f:
        content = f.read()
    new_lines = []
    for line in content.splitlines():
        if line.startswith("TURNSTILE_SECRET_KEY="):
            new_lines.append(original_line if original_line else line)
        else:
            new_lines.append(line)
    with open(BACKEND_ENV, "w") as f:
        f.write("\n".join(new_lines) + "\n")
    _restart_backend()


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    """Log in as admin once. Blanks Turnstile for the call."""
    original = _blank_turnstile_secret_and_restart()
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "website": ""},
            timeout=10,
        )
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
        data = r.json()
        assert "access_token" in data
        token = data["access_token"]
    finally:
        _restore_turnstile(original)
    return token


@pytest.fixture(scope="module")
def customer_token():
    """The customer@test.com user in the DB is a setup-token stub without
    a password hash, so /auth/login can't issue a token. We mint a JWT
    directly for that user_id (same secret the backend uses); the auth
    decorator will load the user from Mongo and `require_super_admin`
    will deny because the role isn't 'super_admin'."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _find():
        c = AsyncIOMotorClient("mongodb://localhost:27017")
        db = c["bashari_erp"]
        u = await db.users.find_one({"email": CUSTOMER_EMAIL})
        return str(u["_id"]) if u else None

    user_id = asyncio.run(_find())
    if not user_id:
        pytest.skip("customer user not in DB")
    return pyjwt.encode(
        {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=1)},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


# ---------- 401 scenarios ----------

class TestUnauthedJobsReturns401:
    def test_no_auth_header_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/jobs", timeout=5)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
        assert r.json().get("detail") == "Not authenticated"

    def test_malformed_basic_auth_returns_401(self):
        r = requests.get(
            f"{BASE_URL}/api/jobs",
            headers={"Authorization": "Basic xxxxx"},
            timeout=5,
        )
        # HTTPBearer treats non-bearer scheme as "no credentials" so it's
        # the same code path as missing header -> 401.
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
        # Either "Not authenticated" (HTTPBearer rejects non-bearer) or
        # "Invalid authentication scheme" is acceptable - both are 401.
        detail = r.json().get("detail", "")
        assert detail in ("Not authenticated", "Invalid authentication scheme"), detail

    def test_invalid_bearer_token_returns_401(self):
        r = requests.get(
            f"{BASE_URL}/api/jobs",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=5,
        )
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid token"

    def test_expired_jwt_returns_401_token_expired(self):
        # Sign with the right secret but exp in the past.
        # Use a 24-char hex string that ObjectId can parse, even though the
        # user won't exist - the expiration check fires first.
        payload = {
            "sub": "0" * 24,
            "exp": datetime.utcnow() - timedelta(hours=1),
        }
        expired = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)
        r = requests.get(
            f"{BASE_URL}/api/jobs",
            headers={"Authorization": f"Bearer {expired}"},
            timeout=5,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
        assert r.json().get("detail") == "Token expired"


# ---------- 200 happy path ----------

class TestAuthedAccess:
    def test_valid_admin_jwt_returns_200_array(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/jobs",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"


# ---------- 403 for legitimate role denial ----------

class TestRoleBased403StillReturns403:
    def test_customer_hitting_admin_endpoint_gets_403(self, customer_token):
        # POST /api/users/admin is super_admin-only.
        r = requests.post(
            f"{BASE_URL}/api/users/admin",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={
                "email": "TEST_should_not_be_created@example.com",
                "full_name": "Should Not Be Created",
                "password": "irrelevant",
                "role": "branch_admin",
            },
            timeout=10,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "admin" in detail, f"expected detail to mention admin, got: {detail!r}"


# ---------- Login smoke check ----------

class TestLoginSmoke:
    def test_admin_login_returns_token(self, admin_token):
        # The admin_token fixture itself exercises POST /api/auth/login;
        # if we get here with a non-empty token, the smoke test passed.
        assert isinstance(admin_token, str) and len(admin_token) > 20
