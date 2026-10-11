"""Contract tests for the admin self-service 2FA endpoints.

Scope: the three endpoints referenced by the Profile page's TwoFactorCard —
`POST /auth/setup-2fa`, `POST /auth/enable-2fa`, `POST /auth/disable-2fa`.

Key invariants being pinned here (from the approved plan):
  * `setup-2fa` must NOT persist `two_factor_secret` to the DB — abandoning
    enrollment leaves nothing on the account.
  * `enable-2fa` round-trips the secret from the client; verifies the TOTP
    code against the submitted secret and only then persists both
    `two_factor_enabled=True` AND the secret in one update.
  * `disable-2fa` requires BOTH the account password AND a valid 6-digit
    code; either half failing returns 400 with a generic message (no
    oracle for an attacker holding only one half).

Follows the project's existing test style: live HTTP against the running
backend via REACT_APP_BACKEND_URL + a dedicated per-run admin seeded into
Mongo so this never collides with the real admin account.
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone

import pyotp
import pytest
import requests
from auth import get_password_hash, pwd_context  # noqa: F401  — share the exact passlib config
from pymongo import MongoClient

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
if not BASE_URL.endswith("/api"):
    BASE_URL = BASE_URL + "/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bashari_erp")

_pwd_context = None  # reuse the shared passlib context imported above


@pytest.fixture()
def seeded_admin():
    """Create a dedicated super_admin for this test, yield session data,
    then clean up. Isolated from the shared admin@bashari.com account."""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    email = f"2fa-ct-{uuid.uuid4().hex[:8]}@example.com"
    password = "VerySecret123!"
    user_doc = {
        "email": email,
        "password_hash": get_password_hash(password),
        "full_name": "2FA Contract Test",
        "role": "super_admin",
        "email_verified": True,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "created_at": datetime.now(timezone.utc),
    }
    db.users.insert_one(user_doc)

    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]

    yield {
        "email": email,
        "password": password,
        "token": token,
        "db": db,
    }

    db.users.delete_one({"email": email})
    client.close()


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_setup_2fa_does_not_persist_secret(seeded_admin):
    r = requests.post(f"{BASE_URL}/auth/setup-2fa", headers=_auth(seeded_admin["token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["secret"]
    assert body["qr_code"].startswith("data:image/png;base64,")

    doc = seeded_admin["db"].users.find_one({"email": seeded_admin["email"]})
    assert doc["two_factor_enabled"] is False
    assert doc.get("two_factor_secret") is None, \
        "setup-2fa must NOT persist the secret (plan: abandoning enrollment leaves nothing)"


def test_enable_2fa_persists_only_on_verified_code(seeded_admin):
    setup = requests.post(f"{BASE_URL}/auth/setup-2fa", headers=_auth(seeded_admin["token"]))
    secret = setup.json()["secret"]

    # Wrong code → 400 and nothing persisted.
    r_bad = requests.post(
        f"{BASE_URL}/auth/enable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"secret": secret, "totp_code": "000000"},
    )
    assert r_bad.status_code == 400
    doc = seeded_admin["db"].users.find_one({"email": seeded_admin["email"]})
    assert doc["two_factor_enabled"] is False
    assert doc.get("two_factor_secret") is None

    # Correct code → both flipped on in one update.
    r_ok = requests.post(
        f"{BASE_URL}/auth/enable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"secret": secret, "totp_code": pyotp.TOTP(secret).now()},
    )
    assert r_ok.status_code == 200, r_ok.text
    doc = seeded_admin["db"].users.find_one({"email": seeded_admin["email"]})
    assert doc["two_factor_enabled"] is True
    assert doc["two_factor_secret"] == secret


def test_enable_2fa_rejects_tampered_secret(seeded_admin):
    r = requests.post(
        f"{BASE_URL}/auth/enable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"secret": "not-base32!!!", "totp_code": "000000"},
    )
    assert r.status_code == 400


def test_disable_2fa_requires_both_password_and_code(seeded_admin):
    # Enable 2FA first.
    setup = requests.post(f"{BASE_URL}/auth/setup-2fa", headers=_auth(seeded_admin["token"]))
    secret = setup.json()["secret"]
    requests.post(
        f"{BASE_URL}/auth/enable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"secret": secret, "totp_code": pyotp.TOTP(secret).now()},
    )

    # Wrong password, right code.
    r1 = requests.post(
        f"{BASE_URL}/auth/disable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"password": "wrong-password", "totp_code": pyotp.TOTP(secret).now()},
    )
    assert r1.status_code == 400

    # Right password, wrong code.
    r2 = requests.post(
        f"{BASE_URL}/auth/disable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"password": seeded_admin["password"], "totp_code": "000000"},
    )
    assert r2.status_code == 400

    # Flag still on after both failures.
    doc = seeded_admin["db"].users.find_one({"email": seeded_admin["email"]})
    assert doc["two_factor_enabled"] is True

    # Generic error message — no oracle disclosure.
    assert r1.json()["detail"] == r2.json()["detail"]

    # Both halves correct → disables and clears the secret.
    r_ok = requests.post(
        f"{BASE_URL}/auth/disable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"password": seeded_admin["password"], "totp_code": pyotp.TOTP(secret).now()},
    )
    assert r_ok.status_code == 200, r_ok.text
    doc = seeded_admin["db"].users.find_one({"email": seeded_admin["email"]})
    assert doc["two_factor_enabled"] is False
    assert doc.get("two_factor_secret") is None


def test_disable_2fa_rejects_when_not_enabled(seeded_admin):
    r = requests.post(
        f"{BASE_URL}/auth/disable-2fa",
        headers=_auth(seeded_admin["token"]),
        json={"password": seeded_admin["password"], "totp_code": "000000"},
    )
    assert r.status_code == 400
    assert "not enabled" in r.json()["detail"].lower()


@pytest.fixture()
def seeded_customer():
    """A customer (non-admin) with a working login — for the role-gate tests."""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    email = f"2fa-cx-{uuid.uuid4().hex[:8]}@example.com"
    password = "CustomerPass123!"
    db.users.insert_one({
        "email": email,
        "password_hash": get_password_hash(password),
        "full_name": "2FA Customer Role Gate",
        "role": "customer",
        "email_verified": True,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "created_at": datetime.now(timezone.utc),
    })
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    yield {"email": email, "password": password, "token": token, "db": db}
    db.users.delete_one({"email": email})
    client.close()


def test_all_2fa_endpoints_reject_non_admin(seeded_customer):
    """Plan: 'customers out of scope'. All three 2FA endpoints must return
    403 for non-admin roles — not 400 (which was the pre-fix status-code
    oracle on disable-2fa, see iter-46 report)."""
    headers = _auth(seeded_customer["token"])
    r1 = requests.post(f"{BASE_URL}/auth/setup-2fa", headers=headers)
    r2 = requests.post(f"{BASE_URL}/auth/enable-2fa", headers=headers,
                       json={"secret": "AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH", "totp_code": "000000"})
    r3 = requests.post(f"{BASE_URL}/auth/disable-2fa", headers=headers,
                       json={"password": seeded_customer["password"], "totp_code": "000000"})
    assert r1.status_code == 403, f"setup-2fa expected 403, got {r1.status_code}: {r1.text}"
    assert r2.status_code == 403, f"enable-2fa expected 403, got {r2.status_code}: {r2.text}"
    assert r3.status_code == 403, f"disable-2fa expected 403, got {r3.status_code}: {r3.text}"
