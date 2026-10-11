# Admin self-service for Two-Factor Authentication

Lets admins turn two-factor authentication on and off for their own account from the Profile page, and makes the on/off state visible without reading the database. A reserved concession: if an admin loses their authenticator, there is no self-reset path — recovery requires support.

## Who it's for

Super-admins and branch-admins. Customer accounts are out of scope.

## Core features and experience

- **Status is always visible.** The Profile page shows "Two-Factor Authentication: Active" or "Not enabled" with a shield icon. A super-admin viewing the Users table sees a 2FA column with a green shield for every admin who has it on and a muted dash for every admin who doesn't.
- **Enabling** walks the admin through: tap "Enable 2FA" → see a QR code (with a copy-able key as a fallback) → scan with Google Authenticator / Authy / 1Password / any TOTP app → type the 6-digit code the app shows → confirm. Nothing is persisted until the 6-digit code is verified against the fresh secret.
- **Disabling** asks for the account password AND the current 6-digit code in the same dialog. Both must be correct for the switch to flip off. This blocks a laptop-left-unattended attack that a code-only disable wouldn't.
- **Enrollment is cancellable.** If the admin backs out mid-enrollment, nothing changes on the account.
- **One-attempt-per-click.** Wrong code shows a red inline message; the admin can try again without reloading. No forced lockout at this stage.
- **If an admin loses their authenticator**, the UI makes it explicit: "contact support" — no recovery codes, no self-reset.

## User flow

1. Admin signs in (with 2FA if already enrolled, as today) and opens the profile menu → "My Profile".
2. The Profile page shows two cards: Account Details (same as today) and Two-Factor Authentication.
3. The 2FA card has one of two states:
   - **Not enabled**: an "Enable 2FA" button.
   - **Active**: a muted "Disable 2FA" button, styled as a destructive action.
4. On **Enable**: card expands inline → QR code + manual key → "Enter the 6-digit code" input → "Verify & Enable" / "Cancel". On success, the card collapses, "Active" state is shown, and the user object in memory updates so the shield appears immediately.
5. On **Disable**: card expands inline → "Enter your account password" + "Enter the current 6-digit code" → "Confirm disable" / "Cancel". On success, the card collapses back to "Not enabled".
6. Logged-in super-admins visiting the Users admin table see a new "2FA" column between Role and Last Login, with a filled green shield for admins who have it on and a muted dash for admins who don't. This column is read-only — super-admins do NOT get a button to disable another admin's 2FA (see assumption on resets below).

## UI/UX feel

- The card stays within the existing Profile page's visual grammar — same navy accent, same card border and spacing as the Account Details card above it.
- The QR code sits on a clean white tile so phone cameras can scan it reliably even in a dark theme.
- The disable panel is tinted red to communicate consequence; the enable panel is tinted navy to match the rest of the dashboard.
- The 6-digit code input uses a wide, mono-spaced font with letter-spacing so the digits read like an airplane boarding pass — easy to compare visually against what the authenticator app shows.
- Error messages ("Invalid code — try again" / "Password doesn't match") appear inline inside the panel, not as a toast, so the admin never loses their place.

## Implementation phases

**Phase 1 — MVP (built now).** Everything in the sections above: self-enroll with QR + manual key, verify-before-enable, disable with password + current code, Profile page card, 2FA column in the Users admin table. The existing login flow (which already accepts a `totp_code`) continues to work unchanged against the newly-settable secrets.

**Phase 2 — later, not now.** Recent-devices visibility ("You last used 2FA from Tel Aviv on an iPad") and a one-time-use "trust this browser for 30 days" option.

**Phase 3 — later, not now.** Hardware-key (WebAuthn / passkey) as an alternative to TOTP for admins who prefer a YubiKey over a phone.

## Assumptions

- **Lost-phone recovery is intentionally hard.** As per your choice, there are no self-serve recovery codes and no cross-admin reset button. Admins who get locked out email support, who uses a direct database update to clear `two_factor_enabled` and `two_factor_secret`. This keeps the attack surface smaller.
- **No audit log entry per enable/disable in this phase.** It can be added later if needed; the user table column + the profile card make the current state obvious.
- **No rate-limit on the verify endpoints beyond what the global login rate-limit already provides.** TOTP codes expire every 30 seconds, which makes brute force expensive by itself.
- **Enrolling re-generates the secret each time.** If an admin starts enrollment, abandons it, and starts again, they get a fresh QR code. The old pre-verify secret is never persisted.
- **The frontend UI is already partly built** (TwoFactorCard component on the Profile page). The gap is the three backend endpoints it calls — these do not exist today, which is why your "Enable" and "Disable" buttons appear to do nothing in production.
- **The Users admin table currently has no 2FA column**. Adding it is a small addition to the existing table; nothing else about user administration changes.
- **Disable requires password + current TOTP code**, per your choice. The password is checked against the same hash used at login, so password-reset flows don't need any changes.
- **Scope stays super-admin + branch-admin**, per your choice. Customers continue not to have a 2FA option on their own profile.
- **"Not enabled" accounts aren't nagged** to turn it on. No banner, no email reminder. If you want a nudge later, that's a Phase 2 item.
