"""Shared test configuration: credentials + URLs loaded from env vars.

Secrets are never hardcoded — they resolve from the following environment variables
(set these in a local `.env.test`, CI secret store, or your shell):

- TEST_BASE_URL (default: preview URL)
- TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
- TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD
- TEST_BRANCH_ADMIN_EMAIL / TEST_BRANCH_ADMIN_PASSWORD

This lets us commit the test suite publicly without leaking real creds while
still running green against a local dev DB.
"""

import os

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    os.environ.get(
        "NEXT_PUBLIC_API_URL",
        os.environ.get("TEST_BASE_URL", "http://localhost:8001/api"),
    ),
).rstrip("/")

# Credentials — read from env; fall back to the well-known dev seed account names
# used by the local Docker/MongoDB seed script. Override in CI via env vars.
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@bashari.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

CUSTOMER_EMAIL = os.environ.get("TEST_CUSTOMER_EMAIL", "customer@test.com")
CUSTOMER_PASSWORD = os.environ.get("TEST_CUSTOMER_PASSWORD", "customer123")

BRANCH_ADMIN_EMAIL = os.environ.get("TEST_BRANCH_ADMIN_EMAIL", "ofir1@bashds.com")
BRANCH_ADMIN_PASSWORD = os.environ.get("TEST_BRANCH_ADMIN_PASSWORD", "admin123")
