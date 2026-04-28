# Test Credentials

## Admin Accounts
- **Super Admin**: admin@bashari.com / admin123
- **Super Admin 2**: ofir@bashds.com / admin123
- **Israel Branch Admin**: ofir1@bashds.com / admin123
- **USA Branch Admin**: ofir2@bashds.com / admin123

## Customer Accounts
- **Test Customer**: customer@test.com / customer123

## Login security notes (Apr 28, 2026)
- `/auth/login` now requires a **Cloudflare Turnstile token** (set in `TURNSTILE_SECRET_KEY` in backend/.env).
  Automated tests need to either:
  - Complete the Turnstile widget interactively in a real browser, OR
  - Temporarily blank the backend `TURNSTILE_SECRET_KEY` for the test run (the server skips verification when the secret is empty).
- The endpoint also rejects requests where the `website` field (hidden honeypot) has any value.
- 10 failed attempts per IP in 15 minutes triggers HTTP 429.

## 2FA (TOTP)
- Admins can enable 2FA in **Dashboard → Profile → Two-Factor Authentication**.
- When enabled, login returns `requires_2fa: true` after password; user is prompted for the 6-digit code on a second step.
- To reset 2FA for a locked-out admin, set `two_factor_enabled: false` directly in the `users` collection.
