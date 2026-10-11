"""Frontend E2E tests for the admin self-service 2FA flows.

Covers: enable happy path, wrong code, abandonment, disable happy path,
disable wrong-password/wrong-code (generic error), disable button
disabled-state, users-table 2FA column, customer no-2fa.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import pyotp
import requests
from playwright.async_api import async_playwright
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from auth import get_password_hash  # noqa: E402

PREVIEW = "https://bashari-lab-direct.preview.emergentagent.com"
API = f"{PREVIEW}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bashari_erp")

mdb = MongoClient(MONGO_URL)[DB_NAME]


def seed_admin(enabled=False, secret=None):
    email = f"2fa-fe-{uuid.uuid4().hex[:8]}@example.com"
    pw = "VerySecret123!"
    doc = {
        "email": email,
        "password_hash": get_password_hash(pw),
        "full_name": "FE 2FA Test",
        "role": "super_admin",
        "email_verified": True,
        "two_factor_enabled": enabled,
        "two_factor_secret": secret,
        "created_at": datetime.now(timezone.utc),
    }
    mdb.users.insert_one(doc)
    return email, pw


def login(email, pw, totp_code=None):
    payload = {"email": email, "password": pw}
    if totp_code:
        payload["totp_code"] = totp_code
    r = requests.post(f"{API}/auth/login", json=payload)
    return r


async def inject_auth(page, token, user):
    import json as J
    auth_blob = J.dumps({"state": {"token": token, "user": user, "isAuthenticated": True}, "version": 0})
    await page.add_init_script(
        f"""
        window.sessionStorage.setItem('auth-storage', {J.dumps(auth_blob)});
        window.sessionStorage.setItem('token', {J.dumps(token)});
        """
    )


async def main():
    results = []

    def record(name, ok, detail=""):
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}  {detail}")
        results.append((name, ok, detail))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1920, "height": 4000})
        page = await ctx.new_page()
        page.on("console", lambda m: m.type == "error" and print("CONSOLE_ERR:", m.text))

        # ---- Test 1: Enable happy path + abandonment-returns-new-secret ----
        try:
            email, pw = seed_admin()
            r = login(email, pw)
            assert r.status_code == 200, r.text
            data = r.json()
            await inject_auth(page, data["access_token"], data["user"])
            await page.goto(f"{PREVIEW}/dashboard/profile/", wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="2fa-card"]', timeout=15000)

            # Idle state: Enable button visible
            assert await page.is_visible('[data-testid="2fa-enable-button"]')

            # Start enroll
            await page.click('[data-testid="2fa-enable-button"]')
            await page.wait_for_selector('[data-testid="2fa-enroll-code-input"]', timeout=10000)
            # QR present
            qr_img = await page.query_selector('img[alt="2FA QR code"]')
            assert qr_img, "QR code img missing"

            # DB check: secret NOT persisted
            doc = mdb.users.find_one({"email": email})
            assert doc.get("two_factor_secret") is None, "setup-2fa must not persist secret"
            record("enable_setup_does_not_persist", True)

            # Expand manual-key disclosure and read secret
            await page.click('summary:has-text("Can")')
            secret_text = await page.inner_text('details code')
            secret1 = secret_text.strip()
            assert secret1 and len(secret1) >= 16

            # Wrong code → error
            await page.fill('[data-testid="2fa-enroll-code-input"]', "000000")
            await page.click('[data-testid="2fa-enroll-confirm-button"]')
            await page.wait_for_selector('[data-testid="2fa-enroll-error"]', timeout=10000)
            err_text = await page.inner_text('[data-testid="2fa-enroll-error"]')
            assert "Invalid" in err_text or "invalid" in err_text, f"err={err_text}"
            # DB still clean
            doc = mdb.users.find_one({"email": email})
            assert not doc["two_factor_enabled"] and doc.get("two_factor_secret") is None
            record("enable_wrong_code_shows_error_and_no_persist", True, err_text)

            # Cancel abandon
            await page.click('button:has-text("Cancel")')
            await page.wait_for_selector('[data-testid="2fa-enable-button"]', timeout=5000)
            doc = mdb.users.find_one({"email": email})
            assert doc.get("two_factor_secret") is None, "abandon must leave DB clean"
            record("enable_abandon_leaves_db_clean", True)

            # Second enroll → new secret
            await page.click('[data-testid="2fa-enable-button"]')
            await page.wait_for_selector('[data-testid="2fa-enroll-code-input"]', timeout=10000)
            await page.click('summary:has-text("Can")')
            secret2 = (await page.inner_text('details code')).strip()
            assert secret2 != secret1, "second enroll must return a fresh secret"
            record("enable_second_enroll_new_secret", True)

            # Correct code → persisted
            code = pyotp.TOTP(secret2).now()
            await page.fill('[data-testid="2fa-enroll-code-input"]', code)
            await page.click('[data-testid="2fa-enroll-confirm-button"]')
            await page.wait_for_selector('[data-testid="2fa-disable-button"]', timeout=10000)
            doc = mdb.users.find_one({"email": email})
            assert doc["two_factor_enabled"] and doc["two_factor_secret"] == secret2
            # Idle shows "Active on this account"
            active_text = await page.inner_text('[data-testid="2fa-card"]')
            assert "Active on this account" in active_text
            record("enable_happy_path_persists_and_shows_active", True)

            mdb.users.delete_one({"email": email})
        except Exception as e:
            record("enable_flow_block", False, repr(e))

        # ---- Test 2: Disable flow (happy, both wrong, button-disabled) ----
        try:
            # Seed admin already enabled
            secret = pyotp.random_base32()
            email, pw = seed_admin(enabled=True, secret=secret)
            # Login requires 2FA code now
            r = login(email, pw)
            assert r.status_code == 200
            body = r.json()
            if body.get("requires_2fa"):
                r = login(email, pw, totp_code=pyotp.TOTP(secret).now())
                assert r.status_code == 200, r.text
                body = r.json()
            await inject_auth(page, body["access_token"], body["user"])
            await page.goto(f"{PREVIEW}/dashboard/profile/", wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="2fa-disable-button"]', timeout=15000)

            await page.click('[data-testid="2fa-disable-button"]')
            await page.wait_for_selector('[data-testid="2fa-disable-password-input"]', timeout=5000)
            await page.wait_for_selector('[data-testid="2fa-disable-code-input"]')

            # Button disabled with empty inputs
            confirm = page.locator('[data-testid="2fa-disable-confirm-button"]')
            assert await confirm.is_disabled(), "confirm must be disabled when empty"
            # Partial — password only
            await page.fill('[data-testid="2fa-disable-password-input"]', pw)
            assert await confirm.is_disabled(), "disabled with password only"
            # Partial — 5-digit code
            await page.fill('[data-testid="2fa-disable-code-input"]', "12345")
            assert await confirm.is_disabled(), "disabled with 5-digit code"
            # Full → enabled
            await page.fill('[data-testid="2fa-disable-code-input"]', "123456")
            assert not await confirm.is_disabled(), "should enable at 6 digits + password"
            record("disable_button_disabled_until_filled", True)

            # (a) Wrong password + right code
            await page.fill('[data-testid="2fa-disable-password-input"]', "wrong-password")
            await page.fill('[data-testid="2fa-disable-code-input"]', pyotp.TOTP(secret).now())
            await confirm.click()
            await page.wait_for_selector('[data-testid="2fa-disable-error"]', timeout=10000)
            err_a = (await page.inner_text('[data-testid="2fa-disable-error"]')).strip()
            doc = mdb.users.find_one({"email": email})
            assert doc["two_factor_enabled"], "still enabled after wrong-pw attempt"

            # (b) Right password + wrong code
            await page.fill('[data-testid="2fa-disable-password-input"]', pw)
            await page.fill('[data-testid="2fa-disable-code-input"]', "000000")
            await confirm.click()
            await page.wait_for_timeout(1500)
            err_b = (await page.inner_text('[data-testid="2fa-disable-error"]')).strip()
            doc = mdb.users.find_one({"email": email})
            assert doc["two_factor_enabled"], "still enabled after wrong-code attempt"
            assert err_a == err_b, f"errors differ! A={err_a!r} B={err_b!r}"
            record("disable_generic_error_both_halves", True, err_a)

            # Happy disable
            await page.fill('[data-testid="2fa-disable-password-input"]', pw)
            await page.fill('[data-testid="2fa-disable-code-input"]', pyotp.TOTP(secret).now())
            await confirm.click()
            await page.wait_for_selector('[data-testid="2fa-enable-button"]', timeout=10000)
            doc = mdb.users.find_one({"email": email})
            assert not doc["two_factor_enabled"] and doc.get("two_factor_secret") is None
            record("disable_happy_path_persists", True)

            mdb.users.delete_one({"email": email})
        except Exception as e:
            record("disable_flow_block", False, repr(e))

        # ---- Test 3: Users admin table 2FA column (super_admin) ----
        try:
            # Seed one admin with 2FA on, one off
            s_on = pyotp.random_base32()
            email_on, _ = seed_admin(enabled=True, secret=s_on)
            email_off, _ = seed_admin(enabled=False)
            # Login as the real super admin
            r = login("admin@bashari.com", "admin123")
            assert r.status_code == 200, r.text
            data = r.json()
            await inject_auth(page, data["access_token"], data["user"])
            await page.goto(f"{PREVIEW}/dashboard/settings/", wait_until="domcontentloaded")
            # Click Admin Users tab
            await page.wait_for_timeout(2000)
            tab = page.get_by_role("tab", name="Admin Users")
            if await tab.count() > 0:
                await tab.first.click()
            await page.wait_for_timeout(2000)

            # Find admin IDs
            doc_on = mdb.users.find_one({"email": email_on})
            doc_off = mdb.users.find_one({"email": email_off})
            id_on = str(doc_on["_id"])
            id_off = str(doc_off["_id"])

            cell_on = page.locator(f'[data-testid="admin-2fa-{id_on}"]')
            cell_off = page.locator(f'[data-testid="admin-2fa-{id_off}"]')
            await cell_on.wait_for(timeout=10000)
            await cell_off.wait_for(timeout=10000)

            # On: has svg with emerald class
            on_html = await cell_on.inner_html()
            assert "emerald-600" in on_html and "svg" in on_html.lower(), f"on cell html={on_html}"
            # Off: has em-dash, no svg
            off_html = await cell_off.inner_html()
            assert "—" in off_html and "<svg" not in off_html.lower(), f"off html={off_html}"
            assert "navy-300" in off_html

            # No clickable button inside either
            assert await cell_on.locator("button").count() == 0
            assert await cell_off.locator("button").count() == 0
            record("admin_table_2fa_column_rendering", True)

            # Header has 2FA
            headers = await page.locator('thead th').all_inner_texts()
            assert "2FA" in [h.strip() for h in headers], f"headers={headers}"
            record("admin_table_header_has_2fa", True)

            mdb.users.delete_one({"email": email_on})
            mdb.users.delete_one({"email": email_off})
        except Exception as e:
            record("admin_table_block", False, repr(e))

        # ---- Test 4: Customer sees no 2FA card + endpoints 403 ----
        try:
            r = login("customer@test.com", "customer123")
            if r.status_code != 200:
                record("customer_no_2fa_card", False, f"customer login failed {r.status_code} {r.text[:200]}")
            else:
                data = r.json()
                tok = data["access_token"]
                await inject_auth(page, tok, data["user"])
                await page.goto(f"{PREVIEW}/dashboard/profile/", wait_until="domcontentloaded")
                await page.wait_for_timeout(3000)
                cnt = await page.locator('[data-testid="2fa-card"]').count()
                assert cnt == 0, "Customer must not see 2FA card"
                record("customer_no_2fa_card", True)

                # Endpoint 403 for customer
                h = {"Authorization": f"Bearer {tok}"}
                r2 = requests.post(f"{API}/auth/setup-2fa", headers=h)
                r3 = requests.post(f"{API}/auth/enable-2fa", headers=h, json={"secret": "ABCDEFGHIJKLMNOP", "totp_code": "000000"})
                r4 = requests.post(f"{API}/auth/disable-2fa", headers=h, json={"password": "x", "totp_code": "000000"})
                assert r2.status_code == 403, f"setup-2fa customer: {r2.status_code} {r2.text}"
                assert r3.status_code == 403, f"enable-2fa customer: {r3.status_code} {r3.text}"
                assert r4.status_code == 403, f"disable-2fa customer: {r4.status_code} {r4.text}"
                record("non_admin_endpoints_403", True)
        except Exception as e:
            record("customer_block", False, repr(e))

        await browser.close()

    # Summary
    passed = sum(1 for _, ok, _ in results if ok)
    failed = len(results) - passed
    print(f"\n=== Summary: {passed} passed / {failed} failed / {len(results)} total ===")
    for n, ok, d in results:
        print(f"  {'OK ' if ok else 'XX '} {n} {d}")


# Playwright runner expects to use the shared `page` object. But since we need
# full control (seeding, multiple contexts, DB checks interleaved), we drive
# our own browser. The script's entrypoint is still an async function.
asyncio.run(main())
