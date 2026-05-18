# GRS Global - Lab Logistics & ERP System

## Product Requirements Document (PRD)

### Overview
GRS Global is a laboratory logistics and ERP application for gemstone testing, built for Bashari. It's a desktop-first responsive web application inspired by the design of GRS GemResearch Swisslab (gemresearch.ch).

### Tech Stack
- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Python FastAPI, Pydantic models
- **Database**: MongoDB
- **Authentication**: JWT with optional 2FA

### Core Entities
1. **User** - Super Admin, Branch Admin, Customer roles
2. **Branch** - Office locations (e.g., Israel, USA)
3. **Client** - Customer profiles linked to branches
4. **Job** - Work orders containing stones for testing
5. **Stone** - Individual gemstones with SKU, weight, type, value
6. **Shipment** - Container for jobs being shipped to/from labs

### User Roles
- **Super Admin**: Full access to all branches and features
- **Branch Admin**: Access limited to their branch
- **Customer**: Can view their own jobs and status

---

### Session: Feb 18, 2026 — Stone Editing Modal UX fixes (P0 completed)

User-reported issues with the **Stone details / edit modal** (`/dashboard/stones`):

1. **Modal width** — was cramped on desktop (`sm:max-w-2xl`). Now `sm:max-w-4xl lg:max-w-5xl` so the verbal-findings grid breathes properly on wide screens.
2. **Certificate Scan pinned to bottom** — moved out of the scrolling area and into a sticky `flex-shrink-0` footer block right above the dialog footer. Shows the Upload / Replace / View Scan controls, status badge, and the optional "Group N" notice in one row.
3. **Clearable dropdowns** — `SearchableSelect` now renders an inline × button (next to the chevron) whenever a value is selected. Clicking it resets the field to empty without opening the dropdown. Test id: `<base>-clear`.
4. **Stone-type-aware dropdown filtering** — added `filterOptionsForStone(opts, stoneType, currentValue)` in `stones/page.tsx`. Logic:
   - Options with no `stone_types` OR containing the sentinel `"all"` (case-insensitive) are universal.
   - Other options are only shown if their `stone_types` array contains the current `stone_type` (case-insensitive).
   - The current value is force-included so legacy data still renders in the trigger.
   - Wired into all four `SearchableSelect` instances: Identification, Color, Origin, Comment.

**Files touched:**
- `frontend/src/app/dashboard/stones/page.tsx` — modal width, filter helper, footer Certificate Scan section.
- `frontend/src/components/ui/searchable-select.tsx` — actual clear-button rendering.

**Verification:** Logged in as `admin@bashari.com`, opened a stone, switched to Edit mode, selected `RED` in Color → × clear button appeared → clicking it reset the field. Screenshots confirm widened modal, pinned bottom Certificate Scan, and × clear behaviour. TypeScript build green; static export rebuilt successfully (`yarn build`).

**Backend untouched** — pure frontend change. Turnstile was temporarily blanked in `.env` for screenshot login and **restored** at the end of the session.

---



### Session: May 17, 2026 — Invoice redesigned (black-only, Bashari branded)

**Header + footer** rendered on every page via `_draw_invoice_chrome` callback (`onFirstPage` + `onLaterPages`):
- Header: square Bashari mark (loaded from `backend/assets/bashari-square.png`) + `ELIYAHU BASHARI DIAMONDS LTD.` company line + 0.6pt hairline rule.
- Footer: hairline rule + centered postal line "Diamond Tower, 1 Jabotinsky St., 12th floor, Ramat Gan 5252002, Israel · Tel: +972-3-7521295 · info@bashari.co" + page number.

**Body**: invoice title, INVOICE NO. / JOB / DATE / BILL TO meta block, line items table with columns `#  SKU  STONE TYPE  WEIGHT (CT)  VALUE (USD)  FEES (USD)`, totals row, Amount Due, PAYMENT TERMS section ("Due upon collection of gemstones."), and a two-column WIRE TRANSFER + PAY ONLINE block.

**Wire transfer details** (hardcoded — same on every invoice):
- Account Name: ELIYAHU BASHARI DIAMONDS LTD.
- Bank Name: Bank Mizrahi Tefahot
- Account No.: 164265
- IBAN / ACH Routing: IL600204660000000164265
- SWIFT Code: MIZBILITDMD

**Pay Online**: clickable link to `${FRONTEND_URL}/pay?token=<payment_token>`. Token is minted lazily on the job document (via `_get_or_create_payment_url`) and reused across invoice regenerations.

**Black-only palette** (no navy/red/grey except a 0.25pt `#cccccc` rule between line items for readability).

**Files**:
- `backend/routes/pdf.py` — added `_format_money`, `_coerce_float`, `_draw_invoice_chrome`, `_get_or_create_payment_url`; rewrote `_build_invoice_pdf_buffer`.
- `backend/utils.py` — added `download_square_logo()` with local-file priority.
- `backend/assets/bashari-square.png` — bundled logo asset.

**Verified on preview**: 19KB PDF rendered in 430ms; visual analysis confirms correct header, footer, table, totals, payment terms, wire block, and clickable pay-online link.


### Session: May 15, 2026 — Real fix for invoice 520: blocking sync call in async route

**Round 1 fix (May 13) was incomplete.** Defensive None handling helped, but the real culprit was a blocking sync call inside an async route handler.

**Diagnosis from user's DevTools**: the response body for `POST /api/jobs/{id}/generate-invoice` was literally the Cloudflare 520 HTML page — the backend never responded at all. Combined with "the whole site goes down for a few minutes after, then recovers", this is the classic `cloudinary.uploader.upload()` (sync, uses `requests`) called inside `async def` route → blocks the entire uvicorn event loop for the duration of the HTTP upload → all other requests queue up → Cloudflare's 30s edge timeout fires → site-wide 520 cascade.

**Fix** (`backend/routes/pdf.py`):
- `_build_invoice_pdf_buffer` (ReportLab) wrapped in `asyncio.to_thread(...)` for both GET and POST endpoints.
- `cloudinary.uploader.upload(...)` wrapped in `asyncio.to_thread(...)` and additionally bounded by `asyncio.wait_for(..., timeout=28)` so a Cloudinary stall returns 504 instead of dropping the connection (which Cloudflare wraps as 520).
- Distinct `asyncio.TimeoutError` handler returns a clean 504 with `Invoice upload timed out. Please try again.`

**Verified on preview**:
- ✅ Single invoice generation: GET 2.6s, POST 2.8s, both 200.
- ✅ **Concurrency**: 3 invoice POSTs running in parallel + 1 `/dashboard/stats` request → all 200, stats endpoint responds in **180ms** while uploads are in flight. Before the fix, stats would have queued behind the uploads (often beyond Cloudflare's 30s timeout).

**Files**: `backend/routes/pdf.py`.


### Session: May 13, 2026 — Invoice generation crash + Cloudflare 520 root cause

**Problem on production**: Clicking "Generate Invoice" on a job returned an error, then subsequent requests showed `Cloudflare 520 — Web server returned an unknown error`.

**Root causes (3 bugs in `backend/routes/pdf.py`)**:

1. **`stone.get('fee', 0)` returns `None` when fee is explicitly null** (default only kicks in for missing keys). `total_estimated += None` raised TypeError, the worker crashed before responding, Cloudflare wrapped the dropped connection as a 520. Same issue for `stone['value']` (KeyError on missing key) and `stone['sku']`.
2. **Cancelled stones were still included in the invoice** — recently added cancellation feature wasn't wired into the PDF renderer.
3. **Cloudinary upload had no client-side timeout** — slow uploads could hang the uvicorn worker past Cloudflare's 30s edge timeout, producing a 520.

**Fix**:
- Extracted invoice rendering into `_build_invoice_pdf_buffer()` so GET (preview) and POST (save to Cloudinary) share the exact same code.
- Defensive helpers `_coerce_float(v)` and `_format_money(v)` coerce None / missing / non-numeric to 0 gracefully.
- All `stone[...]` accesses → `stone.get(..., '')`.
- Cancelled stones filtered out: `stones = [s for s in job.get('stones', []) if not s.get('cancelled')]`.
- Cloudinary upload gets `timeout=25` (5s under Cloudflare's 30s edge timeout, so we always return a proper 5xx instead of a dropped connection).
- Both endpoints wrap render + upload in `try/except` with `logger.exception(...)` so future failures show full tracebacks in prod logs.

**Verified end-to-end on preview**:
- ✅ Normal case: GET returns 342KB PDF, POST uploads to Cloudinary and stores URL.
- ✅ Stress case: stone with `fee: null` + missing `value` field → PDF renders cleanly (renders as $0.00).
- ✅ Cancelled stone present → correctly excluded from totals + PDF (size identical to clean run).

**Files**: `backend/routes/pdf.py`.


### Session: May 10, 2026 — Stone & shipment cancellation with double-confirm

**1. Reusable `<DoubleConfirmDialog>`** (`frontend/src/components/DoubleConfirmDialog.tsx`)
- Two-click pattern: step 1 explains the action, step 2 forces a second click. Async `onConfirm`, auto-closes on success, surfaces error on failure. Used everywhere we need a "really sure?" beat.

**2. Stones can now be individually cancelled**
- New endpoints: `PATCH /api/stones/{id}/cancel` + `PATCH /api/stones/{id}/uncancel` (admin-only).
- Cancelled flag persisted on the stone object inside the parent job's `stones` array (audit trail kept).
- Job's stored `total_stones / total_value / total_fee` are recomputed in `_recompute_job_totals` after every cancel/uncancel so dashboard aggregates stay correct.
- `GET /api/stones` excludes cancelled by default; pass `?include_cancelled=true` to surface them.
- Stones page UI: per-row red Cancel button, "Show cancelled" toggle, restore button on cancelled rows, line-through styling. Mobile cards mirror the same.

**3. Shipments**: existing `cancelled` status already worked via the status dropdown; added a discoverable Cancel button (with double-confirm) in the shipment detail view header. Reuses existing `PUT /shipments/{id}/status` with `cancelled` + `cascade_to_jobs=true` (jobs revert to pre-shipment state).

**Verified via curl + Mongo**:
- ✅ Cancel flag persists with `cancelled_by` audit field.
- ✅ Default GET hides cancelled stones; `?include_cancelled=true` shows them.
- ✅ Job totals correctly drop to 0 on cancel and restore exactly to original on uncancel ($55,555 value / $700 fee in test case).

**Files**:
- `backend/routes/stones.py` — `_recompute_job_totals` helper, `cancel_stone`, `uncancel_stone`, updated `get_all_stones` filter.
- `frontend/src/components/DoubleConfirmDialog.tsx` (new).
- `frontend/src/lib/api.ts` — `stonesApi.cancel/uncancel` + `getAll` accepts `include_cancelled`.
- `frontend/src/app/dashboard/stones/page.tsx` — toggle, cancel/restore buttons, dialog.
- `frontend/src/app/dashboard/shipments/page.tsx` — Cancel button + dialog.


### Session: May 6, 2026 — Public landing page + Request Access (OTP) signup flow

**1. Landing page at `/`**
- Editorial-luxury layout (Playfair Display headline, navy + amber + cream palette, gem-card hero composition, 5 feature cards, dark closing CTA + footer).
- Top nav: `Login` + `Request Access` buttons.
- File: `frontend/src/app/_landing/LandingPage.tsx` (new). Wired into the SPA router at `app/page.tsx` so unauth `/` → landing, auth `/` → `/dashboard`, unauth deep link → login (no marketing-page leak).
- Playfair Display loaded via Google Fonts in `app/layout.tsx`.

**2. Request Access dialog (3-step modal: form → OTP → success)**
- Cloudflare Turnstile + honeypot on every step.
- Fields: Full Name, Company, Email, Phone (all required).
- Email OTP: 6-digit, 30-minute TTL, 5 attempts max, stored in `access_otps` collection.
- Duplicate check: if email already has a user, silently triggers a fresh setup-token + reset email and returns the same `ok: true` shape (no enumeration).

**3. Backend (`routes/access_requests.py` — new, ~330 lines)**
- `POST /api/access-requests/send-otp` — public, Turnstile + honeypot guarded, generates OTP or silently-resets, sends email via Resend.
- `POST /api/access-requests/verify-and-submit` — public, validates OTP (TTL + attempt cap), persists pending row, prevents duplicate pendings.
- `GET /api/access-requests?status=pending|approved|rejected` — admin-only, sorted by submitted_at desc.
- `POST /api/access-requests/{id}/approve` — admin-only. Creates client (if needed) + customer user with fresh setup_token, sends invitation email via existing welcome template, marks request approved.
- `POST /api/access-requests/{id}/reject` — admin-only, optional reason, no email sent.

**4. Admin UI**
- New "Access Requests" tab inside `/dashboard/clients` (super_admin only).
- Pending / Approved / Rejected filter pills with counts, full-text search, approve/reject actions, reject-reason dialog.
- File: `frontend/src/app/dashboard/clients/_components/AccessRequestsTab.tsx` (new).

**5. Other**
- `accessRequestApi` added to `frontend/src/lib/api.ts`.
- Public access-request endpoints whitelisted in the 401 redirect interceptor.
- `User` store type unchanged (we already added `two_factor_enabled` last session).

**Verified end-to-end** (curl + Playwright):
- ✅ Landing page renders, Request Access dialog opens with all fields + Turnstile widget.
- ✅ `send-otp` → email sent via Resend, OTP stored.
- ✅ `verify-and-submit` matches OTP, creates pending row.
- ✅ Admin lists pending, approves → user (role=customer, setup_token issued), client (with company), request marked `approved` + reviewer name; invitation email sent.
- ✅ Login page still works for deep links while unauthenticated.
- ✅ Test data cleaned up.


### Session: Apr 28, 2026 — Account setup flow + login bot protection + admin 2FA

**1. Welcome email → guided setup page**
- Welcome email CTA now deep-links to `/setup-password?token=...`. New `setup_token` is issued per client when the bulk welcome is sent.
- `/setup-password` page enhanced: shows locked Name + Email (admin-entered identity), editable Phone/Company/Address prefilled from the client record, plus password fields. One submit saves everything and signs the user in.
- New `GET /api/auth/setup-info` endpoint returns profile prefill for a valid token.
- `POST /api/auth/setup-password` now accepts `phone`, `company`, `address` and mirrors them into the linked client record.
- Files: `backend/email_templates.py`, `backend/routes/notifications.py`, `backend/routes/auth_routes.py`, `backend/models.py`, `frontend/src/app/setup-password/page.tsx`, `frontend/src/lib/api.ts`.

**2. Login bot protection — 3 layers**
- **Honeypot**: hidden `website` input on the login form; any non-empty value → 400 "Invalid request".
- **Rate limit**: 10 failed logins per IP per 15 minutes (stored in `login_attempts` collection); success resets the counter. 11th attempt → HTTP 429 with retry window.
- **Cloudflare Turnstile**: server-side siteverify using `TURNSTILE_SECRET_KEY`. Widget on login page via `@marsidev/react-turnstile`. If secret env is blank, verification is skipped (local dev). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` baked into the frontend build.
- Files: `backend/login_security.py` (new), `backend/routes/auth_routes.py`, `backend/models.py`, `frontend/src/app/login/page.tsx`.

**3. TOTP 2FA for admins**
- Admin-only gate added on existing `/auth/setup-2fa` + `/auth/enable-2fa` endpoints (customers get 403).
- Login step 2 rendered when `requires_2fa: true` — 6-digit code box; login re-submits with `totp_code`.
- Profile page now has a "Two-Factor Authentication" card (enable shows QR + manual secret, verify with first code; disable requires a current code).
- Files: `backend/routes/auth_routes.py`, `frontend/src/app/dashboard/profile/page.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/store.ts` (User type).

**Verified**:
- curl: login rejected without Turnstile token (`Bot verification required`); rejected with honeypot filled (`Invalid request`).
- curl: admin JWT can hit `/auth/setup-2fa` and receives a valid base32 secret + base64 QR + provisioning URI.
- curl: `/auth/setup-info` returns correct profile prefill for a valid token.
- Playwright DOM eval: setup-password page renders `setup-password-card` with locked name/email + editable phone/company/address + password fields.
- Playwright screenshot: login page shows Cloudflare Turnstile "Verify you are human" widget; client-side guard says "Please complete the bot verification below." on empty token.


### Session: Apr 27, 2026 — Cancelled jobs excluded from dashboard summary

**Change**: Cancelled jobs no longer skew dashboard cards or panels. Backend `_build_jobs_query` now adds `status != cancelled` for every dashboard scope (super_admin/branch_admin/customer/global), and the active-jobs count + clients-with-active-jobs both exclude cancelled. Frontend Recent Jobs panel filters cancelled out before slicing.

**Files**:
- `backend/routes/dashboard.py` — base query excludes cancelled; `active_jobs` uses `$nin: [delivered, cancelled]`; clients-with-active-jobs uses `$nin: [done, cancelled]`.
- `frontend/src/app/dashboard/page.tsx` — `recentJobs`/`allJobs` filter out cancelled before render.

**Verified**: Inserted a test cancelled job with $100k value; before-fix `active_jobs=2`, after-fix `active_jobs=1`. Totals (value/fee/stones) and `jobs_by_status` confirmed to exclude cancelled. Test record cleaned up.


### Session: Apr 27, 2026 — Verbal Findings dynamic stone types

**Change**: Removed the hardcoded `STONE_TYPES` constant (`Emerald/Sapphire/Ruby/Diamond/Spinel/Tanzanite/Other`) from `settings/_types.ts`. The "Stone Type Filter" badges in the Verbal Findings Dropdown Options (both Add and Edit modes) now derive from `pricing_config.stone_types` so admins manage one list in **Stones Settings** and see it everywhere. Added a memoized `stoneTypeOptions = ['all', ...pricing.stone_types]` in `settings/page.tsx` and replaced both `STONE_TYPES.map(...)` usages.

**Files**:
- `frontend/src/app/dashboard/settings/_types.ts` — removed `STONE_TYPES` export
- `frontend/src/app/dashboard/settings/page.tsx` — added `useMemo` import + `stoneTypeOptions` derived from pricing.stone_types, replaced both badge renders.

**Verified**: Production build passes, screenshot confirms dialog shows dynamic list (Ruby/Sapphire/Emerald/Alexandrite/Spinel/Padparadscha/Paraiba/Tanzanite/Other).


## What's Been Implemented

### Session: Apr 26, 2026 (deployment fix) — Static export migration

**Problem**: First production deploy attempt failed with:
```
DETECTED: nginx default page on HTTP 200 - template mismatch
```
The Emergent native deployment template is CRA-style — it auto-injects `REACT_APP_BACKEND_URL` and serves a static `frontend/build/` directory via nginx. Our app was a Next.js 14 SSR build, so nginx had nothing to serve.

**Fix** (code only, no docker changes):
1. **`frontend/next.config.mjs`** — added `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`, and `eslint.ignoreDuringBuilds: true`. App is fully client-rendered (zero `app/api/`, zero server actions, zero `next/headers`), so static export is safe.
2. **`frontend/package.json`** — `build` now runs `next build && rm -rf build && mv out build` so output lives at `frontend/build/` (CRA convention). `start` switched from `next start -p 3000` to `serve -s build -l 3000` so the local supervisor still has a server to run on port 3000.
3. **`frontend/package.json`** — added `serve@^14` as devDep.
4. **`(dashboard)/dashboard/jobs/page.tsx`** — wrapped the page (which uses `useSearchParams()`) in `<Suspense>`, required by Next.js 14 for static export. The other two `useSearchParams` callers (`/pay`, `/setup-password`) already had Suspense.
5. **`backend/server.py`** — added a top-level `@app.get("/health")` route (in addition to the existing `/api/health`) so the deployment health check at `/health` succeeds under any probe convention.

**Verified locally**:
- `yarn build` → all 11 routes prerendered as static, output in `frontend/build/index.html`, `/dashboard/jobs/index.html`, etc.
- `supervisorctl restart frontend` → `serve` running on port 3000.
- `/login` → 200 (HTML), `/api/health` → 200, `/health` → 200, login + dashboard load + render data.

**Deployment-readiness ground truth**: `frontend/build/` now contains a self-contained static SPA the deployment template can pick up directly.

### Session: Apr 26, 2026 (evening) — Cancel jobs, branch removal, data wipe, client delete, couriers manager, shipment-memo polish v3

**Job-memo print v3** (file: `jobs/page.tsx → handlePrintJob`):
- 🎨 Stones table headers changed from black/white to white background + black bottom border (matches the shipment-memo style)
- ➕ Added a totals row inside `<tfoot>`: `Total — N stones · N certs` · total weight (XX.XX ct) · total value · total fees, no black background
- 🗑️ Removed the Lab Branch card entirely
- 🗑️ Removed the entire `Job Summary` meta-grid (5-cell row with Service/Status/Total Stones/Total Certs/Declared Value)
- ➕ Replaced both with a single slim `.job-meta-row` showing **only Client (name · email · phone)** and **Service Type**
- 🗑️ Removed the standalone `.fee-summary` box (fee total now lives in the new tfoot row); when discount > 0, a one-line inline summary still shows Subtotal · Discount · Total Fee
- 💲 Per-stone value/fee + all totals now use 2-decimal formatting (`$1,500.55` / `$12,101.54`)
- 📐 Compressed body padding, header gap, section margins, terms padding and signature block height
- ✅ **Verified**: a 5-stone job memo now renders in 807 px total height (A4 = ~1100 px), comfortably fitting on a single page

**Shipment-memo print v3** (file: `_print/shipment-memo.ts`):
- 🗑️ Removed `Date Sent` field from the Shipment Details meta-grid (date stayed in the title bar — was duplicated)
- 💲 All stone values now formatted with 2 decimal places (`$1,500.55`, `$79,000.00`)
- 🏠 **Full addresses now resolve in the print**: shipments page builds a `name -> "Name\nFull street address"` lookup from `branchesApi.getAll()` + `addressesApi.getAll()` and passes it as `addressBook` to `printShipmentMemo`. The print resolves `source_address`/`destination_address` through this lookup, falling back to the raw stored value if no entry is found.
- 🎨 Stones table headers changed from black/white to white/black with a black bottom border (cleaner, easier to print)
- 📅 **Editable `date_sent`**: model already supported it; added a `<input type="date">` field to both the Create Shipment and Edit Shipment dialogs (next to Tracking Number). Empty field → backend defaults to `datetime.utcnow()`. Frontend api wrapper signatures updated; `Shipment` type extended with `date_sent?: string`.

**Curl + Playwright verified end-to-end** — created a shipment with `date_sent="2026-04-20"`, full-address memo rendered correctly with `$79,000.00` total and the picked date in the header.

**Features**:
- **Couriers manager (admin)**: new "Couriers" card in Settings → Payments tab, identical UX to the existing Payment Destinations card (add via input + Enter / Plus, delete via red X, dedicated Save button). Backend: `pricing_config.couriers` array, exposed via `GET /api/pricing` and persisted via `PUT /api/pricing` (`couriers` is now an `Optional[List[str]]` field on `PricingUpdateRequest`). The shipments-options endpoint (`GET /api/shipments/config/options`) now reads couriers from `pricing_config` (with `DEFAULT_COURIERS` fallback) so the Create Shipment dialog instantly reflects admin changes. End-to-end curl-verified: GET → defaults; PUT → custom list persisted; subsequent GET on shipments/config/options returns the same custom list.
- **Delete client (admin)**: new `DELETE /api/clients/{id}` endpoint, hard-delete only when `db.jobs.count_documents({client_id})` is 0 (stones live embedded in jobs so the same check covers them). Otherwise returns 409 with the blocking job count. Cascades and removes any linked customer login user. UI: red trash next to pencil on every clients row (mobile + desktop) with a confirm dialog. Curl-verified: 200 when no jobs, 409 with helpful message when blocked.
- **Cancel job status**: New `cancelled` status added to `valid_statuses` in `routes/jobs.py` (both `POST status` and `PUT job` endpoints accept it). Selectable in the Job-edit `JobSummaryGrid` and the bulk-status `MiscDialogs`. Renders with a grey strike-through badge.
- **Default-hide DONE & CANCELLED on the Jobs page**: filter dropdown's new default is `Active (hide Done & Cancelled)`. Other options unchanged + a new `Cancelled` filter chip.
- **Branch removal (super_admin only)**: new `DELETE /api/branches/{id}` endpoint performs a *soft delete* (`is_active=False`, `deactivated_at=now`). Branch disappears from `GET /api/branches` (already filtered by `is_active: True`) and from all dropdowns. Existing clients/jobs/users keep their `branch_id` references intact so historical records stay readable. UI: red trash button next to the pencil in `dashboard/settings → Branches` (mobile + desktop) with a confirm dialog explaining the soft-delete behaviour.
- **Frontend API**: added `branchesApi.remove(id)` in `lib/api.ts`.

**Data wipe (one-time, executed)**:
- Deleted **44 jobs** (with embedded stones + payments) and **45 shipments**.
- Dropped now-empty `manual_payments` / `payments` / `payment_tokens` collections (will be re-created lazily by the routes that use them).
- Untouched: clients (95), branches (6), users (11), pricing_config, dropdown_settings, addresses.
- Cloudinary files for those jobs left orphaned per agreed scope.

**Verification** (curl + UI screenshots):
- `GET /api/jobs` → `count=0`, `GET /api/shipments` → `count=0` ✅
- `DELETE /api/branches/{id}` → 200 + `is_active: False` in DB; branches list count drops by one ✅
- `PUT /api/jobs/{id}` with `status=cancelled` → 200, persisted ✅
- Jobs page default view: `All Jobs (0)`, the cancelled test job is hidden; flipping filter to `All Statuses` reveals the strike-through `Cancelled` badge ✅

### Session: Apr 26, 2026 (afternoon) — Code-review batch (security + correctness)

**Security/correctness fixes applied** (per code-review report):
- Removed all 3 `printWindow.document.write(...)` call sites — replaced with a new `openPrintWindow(html)` helper in `lib/sanitize.ts` that uses a Blob URL (no XSS-flaggable API surface). Inline auto-print scripts were added to the shipment-job HTML so the print dialog still fires automatically.
- Hardcoded test credentials in `tests/test_partial_shipments_e2e.py` moved to env vars (`TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_CUSTOMER_EMAIL`, `TEST_CUSTOMER_PASSWORD`) with seeded-account defaults.
- Replaced `key={index}` anti-pattern in `NotificationPanel.tsx` (attachments → keyed by `att.name`) and in the Create Job stones grid (added per-row `_uid` generated via `crypto.randomUUID()`).
- Empty `catch {}` blocks replaced with `console.warn` logging in `pay/page.tsx` (×2) and `dashboard/page.tsx` (×1).
- Memoized the Welcome-email recipient list in `clients/page.tsx` with `useMemo` (avoids re-running `filter().map().join()` on every keystroke).

**Verification**: `yarn build` passes; all 5 e2e tests in `test_partial_shipments_e2e.py` pass; preview URL renders cleanly (smoke screenshot taken).

**Findings deliberately skipped** (false positives or out-of-scope refactors):
- `routes/users.py:81,83,87,91` and `routes/stones.py:85,113` — flagged for `is` vs `==`. All occurrences are `is None` / `is not None` checks, which is the correct Python idiom (PEP 8). False positive.
- `tests/test_tranzila_payment.py:71` — flagged for "hardcoded secret"; that line is `assert "/pay?token=" in data["payment_url"]`, a URL-pattern assertion. False positive.
- Long-function extraction in `routes/jobs.py`, `routes/auth_routes.py`, `routes/manual_payments.py`, `email_templates.py` — deferred per agreed scope (low risk, big refactor).
- Massive component splits (`shipments/page.tsx` 2,175 / `settings/page.tsx` 1,968 / `clients/page.tsx` 1,000) — already on the P3 backlog; jobs/page.tsx already split down from 3,845 → 2,455.
- Hook-deps cleanup — kept `eslint-disable` lines in `pay/page.tsx`, `jobs/page.tsx`, `dashboard/page.tsx`, etc. Each was inspected; the disables are intentional (otherwise `fetchData`/`pollPaymentStatus` re-creation would cause refetch loops).
- Per-group `reduce` sums in jobs/shipments tables — micro-optimisation, deferred.
- 51 `console.*` cleanup — deferred.

### Session: Apr 26, 2026 - Bug fixes verification + SMS sender unblock

**Verified fixes** (from prior session, now confirmed working):
- Job modal **sticky footer** (`Close` / `Save Changes` always anchored as the body scrolls)
- Manual Payment button trimmed to **"Record Payment"** (was previously too long)
- **`stones_accepted`** notification now shown as Available when a job's status is `sent_to_lab` (backend `status_to_notifications` map already includes it; verified via `GET /api/jobs/{id}/notifications/status`)
- Bonus fix: deep-link `?jobId=` now also fetches notification statuses (parity with click-to-open flow in `openViewDialog()`)

**SMS sender unblock**:
- `SMS4FREE_SENDER` switched from `BASHARI` (rejected with status `-2`) to phone `0542909005`
- Direct probe now returns `-6 Sender verification required` — i.e., SMS4Free accepts the sender format but the **owner of `0542909005` must complete OTP verification in their SMS4Free dashboard** before SMS will deliver
- Action item handed back to user: complete sender verification in SMS4Free dashboard

### Session: Feb 23, 2026 - Create Job UX + Verbal Email polish (Iter 27)

**Create Job dialog**:
- Client picker upgraded from plain `Select` to `SearchableSelect` — search by **name, company, or email**; list also shows `Name · Company — email` for disambiguation
- **Branch field removed** — branch is now auto-derived from the selected client (no cross-branch jobs possible). A small helper line under the picker shows the inherited branch + code. Backend `POST /jobs` also enforces: `branch_id` must match `client.branch_id` (400 if mismatched; silently overwritten if omitted).

**Verbal results email**:
- Added **Weight** column (pulls from `stone.weight`, falls back to `vf.weight` if the lab overrode during grading)
- Renamed **Treatment → Comment** (source field was always `comment`; matches the admin UI terminology)



### Session: Feb 23, 2026 - Partial Return Shipments (Iter 26) 🆕 MAJOR FEATURE

**Scenario**: job with 5 stones, lab tested 4 and wants to return them while the 5th stays for later grading. Same for certificates.

**Per-stone lifecycle tracking**:
- `Stone.stone_status`: `at_office` → `at_lab` → `returned` (one-way progression; rechecks = new job)
- `Stone.cert_status`: `pending` → `delivered`
- Only NEW jobs get these fields (no retroactive migration — legacy jobs keep job-level flow)

**Partial-shipment scope**:
- `Shipment.stone_ids[]` — optional; empty ⇒ all stones of included jobs (back-compat)
- `shipment.total_stones` / `total_value` count only the selected stones

**Delivery hook** (`_apply_stone_lifecycle`): when shipment transitions to `delivered` (or `in_transit` for send-to-lab), updates status of included stones only. Partial shipments **skip** the job.status cascade — per-stone badges in UI reflect reality, job.status stays untouched.

**Email enumeration**: `stones_returned` and `cert_returned` templates now partition stones into **Returned in this shipment** and **Still at the lab** tables (Type/Weight/SKU per row). Subject becomes "Partial return — 2 of 3 stones ready" when partial; falls back to old wording for fully-returned or legacy jobs.

**Frontend**:
- `shipments/_components/PartialStonesPicker.tsx` (NEW) — per-certificate-group checkboxes in Create Shipment dialog for return flows; legacy jobs show amber "whole job ships" badge
- `jobs/_components/StoneStatusBadges.tsx` (NEW) — pill badges next to each SKU in View Job dialog (3 render sites: mobile card, desktop ungrouped table, desktop grouped table)
- Ungrouped stones each render as a singleton picker group
- `shipmentsApi.create` + backend POST both accept/return `stone_ids`

**Testing**:
- Backend: 58/58 pytest tests pass, +10 new `tests/test_partial_shipments.py` covering helpers, partial flows, legacy compat, email enumeration
- End-to-end curl: created 3-stone job → stones `at_office/pending` → sent to lab delivered → all `at_lab` → partial return of 2 → 2 `returned` + 1 `at_lab`, job.status unchanged, email subject "Partial return — 2 of 3 stones ready"
- Testing agent (iter 26) confirmed zero regressions, legacy jobs use old wording, frontend badges render correctly; fixed one non-blocking bug where POST /shipments response omitted stone_ids



### Session: Feb 23, 2026 - View Job Dialog Partial Split (Iter 25)

**Phase 3 View Job Dialog decomposition** (3 of 5 planned sub-components done):
- `_components/JobSummaryGrid.tsx` (125 lines) — top info grid (client/branch/service/status/value/fee/discount/net) + notes section, supports edit-mode with `EditJobFormData` interface
- `_components/JobPaymentCard.tsx` (249 lines) — full payment panel: balance strip with progress bar, manual-payment button, payment history list, adjustment-mode flow, payment-link generate/copy/open
- `_components/JobNotificationsCard.tsx` (97 lines) — per-type preview/resend email + SMS buttons, filters by `is_available`

**Net**: jobs/page.tsx **2,864 → 2,544 (−320 this iter)**. Cumulative: **3,845 → 2,544 (−1,301 / −33.8%)**

**Deferred**:
- `JobStonesSection` — highly coupled to edit-mode, stone selection, certificate grouping, nested stone dialog; needs dedicated session
- `JobActionsRow` (Memo + Lab Invoice upload cards) — couples to `fileInputRef`/`labInvoiceInputRef` + upload handlers

**Testing (iter 25)** — frontend testing agent reports zero regressions. Summary grid edit mode, payment balance strip, adjustment flow, payment-link copy/open, and notification preview/SMS all verified to work identically.



### Session: Feb 23, 2026 - Code Quality Phase 3 + useMemo (Iter 24)

**Phase 3 frontend splitting** (P0) — extracted 3 more dialogs:
- `_components/StoneDialogs.tsx` — GroupStonesDialog + AddStoneDialog
- `_components/CreateJobDialog.tsx` — full New Job creation modal (200 lines) with typed `JobFormData` / `StoneInput` props
- `jobs/page.tsx`: **3,156 → 2,864 lines (−292 this iter; cumulative 3,845 → 2,864, −981 / −25.5%)**

**`useMemo` optimizations** (P1):
- `filteredJobs` in jobs/page.tsx — re-computes only when jobs / searchTerm / statusFilter change (previously recomputed on every keystroke)
- `selectedJobStoneGroups` + `selectedJobUngroupedStones` — memoised derivations for the View Job Dialog
- `filteredShipments` + `typeCounts` in shipments/page.tsx
- All verified reactive via testing agent (typing in search still updates live)

**View Job Dialog deferred** — the 800-line View Job Dialog with edit mode, payment section, notifications panel, and actions sidebar has deep state coupling and needs its own dedicated session to split into sub-components (JobSummaryHeader, JobStonesSection, JobPaymentSection, JobNotificationsPanel, JobActionsSidebar).

**Custom data-loading hooks deferred** — `useJobsData` / `usePricing` would require migrating 15+ state setters out of JobsPage and into hooks. Deferred as a separate clean-up session to avoid risk.

**Testing (iter 24)** — frontend testing agent reports zero failures; all extracted dialogs work identically, memoized filters remain reactive, all iter-23 dialogs still functional.



### Session: Feb 23, 2026 - Code Quality Phase 2 + Security + Print (Iter 23)

**Phase 2 frontend splitting** — extracted 7 self-contained dialog components from the jobs page:
- `_components/ManualPaymentDialog.tsx` — manual wire/cash payment recording flow
- `_components/DocumentViewerDialog.tsx` — unified PDF/image viewer (replaces 3 near-identical dialogs: certificate scan, signed memo, lab invoice)
- `_components/SmsPreviewDialog.tsx` — SMS preview & send
- `_components/EmailPreviewDialog.tsx` — sandboxed-iframe email preview & send
- `_components/MiscDialogs.tsx` — UnsavedChangesDialog, BulkStatusDialog, ClientInvoiceDialog
- `jobs/page.tsx`: 3,547 → 3,156 lines (−391 this iter; cumulative 3,845 → 3,156, −689 lines / −17.9%)

**Printable shipment document (P1)** — `shipments/_print/shipment-memo.ts`:
- New `printShipmentMemo({ shipment, jobs })` helper replaces the old generic `handleGeneratePdf` inline code
- Memo-style design matching the job memo: charcoal/red palette, square logo + company header, route card with arrow, jobs-in-shipment table, unified stones manifest, totals panel, and 3-signature block (Sender / Courier / Receiver)
- Proper HTML escaping via local `esc()`, status badges, branded footer with VAT info

**localStorage auth-token security (P1)** — `lib/tokenStorage.ts`:
- New helper wraps all token I/O via sessionStorage (cleared on tab close → smaller XSS blast radius)
- One-time migration reads a legacy `localStorage.token` once and promotes it to sessionStorage
- `store.ts` Zustand `auth-storage` persistence moved from localStorage → `createJSONStorage(() => sessionStorage)`
- `api.ts` interceptor, `NotificationPanel.tsx` (3 sites), `profile/page.tsx` (1 site) all updated to use `getToken()` / `clearToken()`
- Verified in Playwright: after login, `sessionStorage['token']` set (len=215), `localStorage['token']` and `localStorage['auth-storage']` both null; logout clears everything

**Production build + restart** — prior frontend was running `next start` with a stale bundle; rebuilt (fixed 4 unused-import ESLint errors) and restarted so the new code is live.

**Testing (Iter 23)** — testing agent (frontend only) reports zero failures across: auth sessionStorage migration, jobs dialog regressions, shipment memo print popup. Backend regression (48 pytest tests) still passes.



### Session: Feb 23, 2026 - Code Quality Report Remediation (Iter 22)
- ✅ **Backend complexity refactor** — split three hot-spot functions into small, single-responsibility helpers with no behaviour change:
  - `routes/dashboard.py::get_dashboard_stats` → `_build_jobs_query`, `_aggregate_job_totals`, `_aggregate_status_breakdown`, `_count_clients`
  - `routes/manual_payments.py::record_manual_payment` → `_compute_balance`, `_build_payment_record`, `_load_client_context`, `_send_payment_email`, `_send_payment_sms`
  - `routes/jobs.py::build_job_response` → `_resolve_shipment_ids`, `_fetch_latest_shipment_info`, `_serialize_payments`, `_build_payment_url`
- ✅ Verified email_templates dispatcher refactor — fixed stale `GRS Global` assertion in `test_notifications_api.py`; all 13 notification tests pass.
- ✅ **Frontend monolith splitting (phase 1)** — extracted types/constants/subcomponents from the 3 largest files:
  - `jobs/page.tsx` (3,845 → 3,546 lines): new `_types.ts`, `_helpers.ts`, `_components/ShipmentChip.tsx`
  - `shipments/page.tsx` (2,479 → 2,414 lines): new `_types.ts`
  - `settings/page.tsx` (2,062 → 2,029 lines): new `_types.ts`
- ✅ Zero TypeScript errors across the repo.
- ✅ Testing agent (iter 22) — **61/61 tests passed** (48 regression + 13 new refactor verification). All notification-preview types emit the correct brand string; manual-payment validation (zero/negative/over-balance) returns 400; partial/paid flow works end-to-end.



### Session: Feb 22, 2026 - Codebase Restoration & Verification
- ✅ Pulled codebase from GitHub (ofirbash/grs-service)
- ✅ Fixed TypeScript lint errors in jobs, shipments, stones, settings pages
- ✅ Fixed shadcn/ui component interface errors (input.tsx, textarea.tsx, dialog.tsx)
- ✅ Built Next.js production build successfully
- ✅ Configured environment files (.env for frontend and backend)
- ✅ Seeded test data (admin user, branches, client, job with stones)
- ✅ Initialized dropdown settings for verbal findings
- ✅ All services running (backend, frontend, MongoDB)
- ✅ **Full E2E testing passed: 100% success rate**

### Session: Feb 22, 2026 - Feature Enhancements (v2)
**Client Enhancements:**
- ✅ Added Edit functionality for existing clients (PUT /api/clients/{id})
- ✅ Added Secondary Email field to client profiles
- ✅ Added Secondary Phone field to client profiles
- ✅ Added Notes field for client remarks
- ✅ Reorganized form into compact 2-column grid layout:
  - Row 1: Name | Company
  - Row 2: Primary Email | Primary Phone  
  - Row 3: Secondary Email | Secondary Phone
  - Row 4: Branch | Address
  - Row 5: Notes (full width)
- ✅ Dialog made wider (max-w-2xl) and scrollable

**Stone Verbal Findings Improvements:**
- ✅ Certificate ID now mandatory with red asterisk (*) indicator
- ✅ "Required field" validation message shown under empty Certificate ID
- ✅ Verbal findings form locks after saving (view mode with disabled/greyed inputs)
- ✅ "Completed" badge (green) appears next to Verbal Findings header when saved
- ✅ "Edit" button appears next to Completed badge to unlock form
- ✅ SearchableSelect component updated with disabled state support

**Job Stone Grouping Improvements:**
- ✅ Already grouped stones show "Ungroup X Stones" button (red styling)
- ✅ Ungrouped stones show "Group X Stones for Certificate" button
- ✅ Fixed blinking header on grouped stones (added hover:bg-navy-800 to prevent flickering)
- ✅ Added PUT /api/jobs/{job_id}/ungroup-stones endpoint

### Phase 1: Frontend Rebuild (Complete) - Feb 19, 2026
- ✅ Removed Expo/React Native frontend (rejected by user)
- ✅ Created new Next.js 14 project with App Router
- ✅ Integrated Tailwind CSS with GRS-inspired color scheme (navy blue, gold accents)
- ✅ Built shadcn/ui component library
- ✅ Login page with JWT authentication
- ✅ Dashboard layout with collapsible sidebar
- ✅ Dashboard page with stats cards (Jobs, Clients, Value, Fees)
- ✅ Recent Shipments and Recent Jobs sections
- ✅ Jobs by Status breakdown

### Phase 2: Core Features (Complete) - Feb 19, 2026
- ✅ **Shipments Page**
  - List all shipments with filtering
  - Create Shipment dialog with job selection
  - View shipment details
  - Update shipment status (pending → in_transit → delivered)
  - Add jobs to shipment after creation
  - Print shipment PDF
- ✅ **Jobs Page** (Fully Tested)
  - Wide data table with all job info
  - Create Job dialog with stone entry
  - Clickable job rows to view details
  - **Edit Job** - Update status and notes
  - **Print Job** - Generate printable job details with certificate groupings
  - **Upload Signed Memo** - Attach signed documents to jobs
  - **Group Stones for Certificate** - Group up to 30 stones for single certificate
  - **Visual Certificate Organization** - Stones displayed grouped by certificate with:
    - Certificate Summary (e.g., "Cert 1: 2 stones (Pair), Cert 2: 6 stones (Layout)")
    - Color-coded certificate headers
    - Group totals per certificate
    - Support for multiple groups per job (pairs, singles, layouts)
- ✅ **Clients Page**
  - Client list with branch filtering
  - Add Client dialog
- ✅ **Settings Page**
  - Profile information
  - Security settings (2FA placeholder)
  - System information

### Phase 3: Bug Fixes (Complete) - Feb 19, 2026
- ✅ Fixed SKU generation bug: weights with trailing zeros (e.g., 2.50 → "250" instead of "25")
- ✅ Added "received" status to valid job statuses list
- ✅ Fixed StoneResponse model to include certificate_group field

### Phase 7: Admin Settings Page (Complete) - Feb 23, 2026
- ✅ **Multi-Tab Settings Page**
  - Tab 1: Verbal Dropdowns - Manage dropdown options (Identification, Color, Origin, Comment) with stone type filtering
  - Tab 2: Branches - CRUD for office locations with address, return address, phone, email
  - Tab 3: Pricing - Configure service fees and value brackets
- ✅ **Verbal Dropdowns Tab Features**
  - Field selector dropdown to switch between Identification, Color, Origin, Comment
  - **Search/filter input** - instant filtering of options as you type
  - Table of options with Value and Stone Types columns
  - Add/Edit/Delete options with inline editing
  - Stone type badges with click-to-toggle filtering (all, Emerald, Sapphire, Ruby, etc.)
  - Shows filtered count vs total count when searching
- ✅ **Branches Tab Features**
  - Table displaying all branches with Name, Code, Address, Return Address, Contact
  - Add Branch dialog with all required fields
  - Edit Branch button for each row
  - Super Admin only can add/edit branches
- ✅ **Pricing Tab Features**
  - Color Stability Test Fee display and editing
  - Value Brackets table with Min/Max Value, Express/Normal/Recheck fees
  - Edit Pricing mode with editable inputs
  - Add/Remove bracket functionality
  - Available Service Types display

### Phase 4: UX Enhancements (Complete) - Feb 21, 2026
- ✅ **Stacked/Nested Modals Feature**
  - Click job in Shipment details → Job dialog opens on top
  - Click stone in Job dialog → Stone dialog opens on top
  - 3-level stacking: Shipment → Job → Stone (all layers visible)
  - Works from both Jobs page and Shipments page
- ✅ **Stone Dialog Features**
  - Displays stone details (type, weight, shape, value, fee, certificate group)
  - Verbal findings textarea with save functionality
  - Certificate scan upload button
  - Group warning for grouped stones (scan applies to all in group)

### Phase 5: Structured Verbal Findings (Complete) - Feb 22, 2026
- ✅ **Verbal Findings Form**
  - Certificate ID (text input)
  - Weight (number input, pre-filled with stone weight, editable)
  - Identification (dropdown from configurable settings)
  - Color (dropdown from configurable settings)
  - Origin (dropdown from configurable settings)
  - Comment (dropdown from configurable settings)
- ✅ **Search in Dropdowns**
  - All 4 dropdown fields (Identification, Color, Origin, Comment) have search/filter boxes
  - Instant filtering as you type
- ✅ **Dropdown Settings System**
  - Backend API: GET/PUT/POST /api/settings/dropdowns
  - All dropdown values stored in MongoDB
  - Global values (applicable to all stone types)
  - Prepared for future: stone-type-specific filtering
- ✅ **Default Values Loaded from PDFs**
  - 35+ identification values (NATURAL RUBY, NATURAL SAPPHIRE, etc.)
  - 35+ color values (VIVID RED PIGEON BLOOD, VIVID BLUE ROYAL BLUE, etc.)
  - 19 origin values (BURMA, SRI LANKA, KASHMIR, COLOMBIA, etc.)
  - 22 comment values (HEATED, H(a), H(b), NO INDICATION OF TREATMENT, etc.)
- ✅ **Updated ALL Pages with New Verbal Findings Form**
  - Jobs page stone dialog: structured form with search
  - Shipments page nested stone dialog: structured form with search
  - Stones page stone details: structured form with search
- ✅ **Fixed Nested Job Modal in Shipments**
  - Now matches full job modal design
  - Shows certificate grouping
  - "Open in New Tab" button to view in Jobs page
  - **Memo upload functionality** added to nested job modal

### Phase 6: UI/UX Bug Fixes (Complete) - Feb 22, 2026
- ✅ **Stone Modal Height Fix**
  - Modal uses flex layout with fixed header/footer and scrollable content
  - Close button always visible regardless of content height
  - Dropdown menus detect available space and position up/down accordingly
- ✅ **Nested Job Modal Context Preservation**
  - Full job details modal opens on top of shipment modal
  - Memo upload functionality works in nested context
  - 3-level stacking supported: Shipment → Job → Stone
- ✅ **SearchableSelect Dropdown Positioning**
  - Dropdowns detect viewport boundaries
  - Opens upward when near bottom of viewport
  - Increased z-index for proper layering in modals
- ✅ **Nested Job Modal Full Features**
  - Print button opens print-friendly popup with full job details
  - Edit button shows edit form (status dropdown, notes textarea)
  - Memo upload works correctly with file input
- ✅ **Group Certificate Scan Route Fix**
  - Fixed FastAPI route ordering issue
  - `/stones/group/certificate-scan` defined before `/stones/{stone_id}/certificate-scan`
  - Both endpoints work correctly now

### Phase 10: 5-Stage Email Notification System (Complete) - Feb 24, 2026
- ✅ **Resend Integration**
  - Added Resend API key to backend .env
  - Email sending via Resend API with HTML templates
  - Attachment support for PDF files (Memo-In, Invoice)
- ✅ **5 Notification Types**
  1. `stones_accepted` - Stones Received confirmation with stones table and fees
  2. `verbal_uploaded` - Lab findings with verbal results table
  3. `stones_returned` - Notice that stones are ready for collection
  4. `cert_uploaded` - Digital certificate scans available with download links
  5. `cert_returned` - Physical certificates ready for final collection
- ✅ **Backend API Endpoints**
  - GET `/api/jobs/{job_id}/notifications/status` - Returns available notifications based on job status
  - GET `/api/jobs/{job_id}/notifications/preview/{type}` - Preview email content (subject, HTML body, recipient)
  - POST `/api/jobs/{job_id}/notifications/send/{type}` - Send email via Resend
- ✅ **Frontend "Review & Send" Workflow**
  - Email Notifications section in Job detail modal (admin only)
  - Shows available notifications based on job status
  - "Review" button to preview email content
  - Email preview modal with recipient info, subject, and rendered HTML
  - "Send Email" button to send after review
  - Sent notifications shown with green checkmark and timestamp
- ✅ **Email Templates**
  - Professional GRS Global branded header
  - Dynamic data tables (stones, fees, verbal results, certificate links)
  - Personalized greeting with client name
  - Attachment indicators for PDF files

### Backend (Previously Complete)
- ✅ Full CRUD APIs for all entities
- ✅ Shipment workflow with job linking
- ✅ Auto-SKU generation for stones (FIXED)
- ✅ PDF generation (Memo-in, Invoice, Shipment docs)
- ✅ Dashboard stats API
- ✅ Notification system (MOCKED - no Twilio/SMTP)
- ✅ Stone grouping for certificates API
- ✅ Memo upload API
- ✅ **Cloudinary Integration** (Feb 23, 2026)
  - GET /api/cloudinary/signature - Generate secure upload signatures
  - POST /api/cloudinary/delete - Delete files from Cloudinary
  - Files stored in Cloudinary folders: certificates/, memos/, uploads/
  - Backward compatible - legacy base64 URLs still display correctly

### Phase 8: Cloud File Storage - Cloudinary (Complete) - Feb 23, 2026
- ✅ **Backend Cloudinary Endpoints**
  - Signature generation endpoint for secure direct uploads
  - Delete endpoint for file removal
  - Folder validation (certificates/, memos/, uploads/, invoices/)
- ✅ **Frontend Cloudinary Integration**
  - cloudinaryApi in api.ts with uploadFile() and deleteFile() functions
  - Direct upload to Cloudinary (bypasses server for file data)
  - URL saved to backend after successful upload
- ✅ **Updated Pages**
  - Jobs page: Memo upload now uses Cloudinary
  - Jobs page: Certificate scan upload now uses Cloudinary
  - Jobs page: Lab Invoice upload (admin only) - NEW
  - Stones page: Certificate scan upload now uses Cloudinary
  - Shipments page: Memo and certificate scan uploads use Cloudinary
- ✅ **Display Support**
  - PDF detection for both base64 prefix and .pdf extension
  - Images display from Cloudinary URLs
  - Backward compatible with legacy base64 data
- ✅ **Lab Invoice Feature (Admin Only)**
  - New field: lab_invoice_url, lab_invoice_filename on Job model
  - Upload/View buttons in Job details dialog
  - Marked as "Admin Only" with warning "not visible to customers"
  - Stored in Cloudinary invoices/ folder

### Phase 9: Customer Role & Access Control (Complete) - Feb 23, 2026
- ✅ **Customer Role Implementation**
  - Added `customer` role alongside `super_admin` and `branch_admin`
  - Customer accounts linked to a specific client via `client_id`
  - Test account: `customer@test.com` / `customer123`
- ✅ **Backend Access Control**
  - Jobs, Stones, Shipments endpoints filter by `client_id` for customer role
  - Clients page restricted to admin only
  - Settings page restricted to admin only
  - Dashboard stats filtered for customer role
- ✅ **Frontend Navigation Restrictions**
  - Customer sidebar shows: Dashboard, Jobs, Stones only
  - Admin sidebar shows all options including Clients and Settings
- ✅ **Verbal Findings Access Control**
  - Customers can VIEW verbal findings but cannot EDIT
  - Edit button hidden from customers (both Jobs and Stones pages)
  - Save button hidden from customers
  - All form fields disabled for customers
  - Certificate Scan upload button hidden from customers
- ✅ **Dashboard Job Navigation**
  - Recent Jobs in dashboard are clickable
  - Click navigates to `/dashboard/jobs?jobId={id}` with modal auto-open
  - Works for both admin and customer roles

### Phase 11: UI/UX Refinements - Unified Edit Mode (Complete) - Feb 24, 2026
- ✅ **Email Notification Refresh**: Notifications refresh immediately after job status change without closing/reopening the modal
- ✅ **Actual Fee Display in Stones List**: Job modal stone table shows "Actual: $XXX" for stones with fees differing from estimated
- ✅ **Unified Edit Mode (Jobs Page)**: Stone detail dialog opens locked; single "Edit" button enables all fields (verbal findings + actual fee + color stability); single "Save Changes" saves everything
- ✅ **Unified Edit Mode (Stones Page)**: Same unified edit behavior with combined save for verbal findings and fees
- ✅ **Null Actual Fee Bug Fix**: Fixed crash when stones had null actual_fee values (changed `!== undefined` to `!= null`)
- ✅ **Lock Indicator**: Shows "Click Edit to modify fees and verbal findings" when fields are locked on both pages
- ✅ **Removed Redundant Edit Buttons**: Cleaned up duplicate edit buttons in verbal findings section headers

### Phase 12: Dynamic Service Types & Pricing (Complete) - Feb 24, 2026
- ✅ **Add Service Types from Settings**: Admins can add new service types from the Pricing tab in Settings (input + Add button in edit mode)
- ✅ **Dynamic Pricing Columns**: Each service type gets its own fee column in the pricing brackets table
- ✅ **Dynamic Fee Calculation**: Backend calculates fees using the service type's fee from DB brackets (not hardcoded)
- ✅ **Backward Compatibility**: Old bracket format (express_fee/normal_fee/recheck_fee) auto-converts to new `fees` dict format
- ✅ **Dynamic Service Types in Jobs**: Jobs page fetches service types from pricing config instead of hardcoded list
- ✅ **No Deletion**: Service types cannot be removed (protects existing jobs)
- ✅ **Duplicate Prevention**: Cannot add a service type that already exists (case-insensitive check)

### Phase 13: Client Account Self-Setup (Complete) - Feb 24, 2026
- ✅ **Auto-create customer user account**: When admin creates a client, a customer user account is auto-created with a setup token (30-day expiry)
- ✅ **Welcome email via Resend**: Setup email sent to client's primary email with branded HTML and "Set Up Your Password" link
- ✅ **Setup password page** (`/setup-password?token=xxx`): Clean password form, validates token, sets password, auto-logs in
- ✅ **Token expiry**: 30-day expiry enforced server-side
- ✅ **Duplicate handling**: Skips user creation if email already exists in users collection

### Phase 14: Branch-First Architecture (Complete) - Feb 24, 2026
- ✅ **Admin accounts created**: ofir1@bashds.com (IL branch_admin), ofir2@bashds.com (US branch_admin), ofir@bashds.com (super_admin)
- ✅ **Branch isolation enforced**: Clients, Jobs, Stones, Shipments, Dashboard all scoped by branch for branch_admins
- ✅ **Super-admin branch toggle**: Dropdown in top bar to switch between "All Branches", "Israel", "USA-NY"
- ✅ **Branch filter persisted**: Selected branch stored in Zustand with localStorage persistence
- ✅ **All pages updated**: Dashboard, Jobs, Stones, Clients, Shipments all respect branch filter
- ✅ **Shipment filtering via jobs**: Since shipments don't have branch_id, filtered via their job associations
- ✅ **85 legacy clients imported** from SQL file (all assigned to Israel branch)

### Phase 15: Admin User Management (Complete) - Feb 24, 2026
- ✅ **Admin Users tab** in Settings (visible only to super_admin)
- ✅ **List admin users**: Shows all super_admin and branch_admin accounts with name, email, role, branch
- ✅ **Create admin user**: Dialog with name, email, password, access level (Super Admin / Branch Admin), branch selector, phone
- ✅ **Edit admin user**: Update name, role, branch, phone, and optionally reset password
- ✅ **Backend endpoints**: `GET /api/users`, `POST /api/users/admin`, `PUT /api/users/{id}`

### Phase 16: Payment Gateway - Tranzilla (Complete) - Mar 2026
- ✅ **Public payment page** (`/pay?token=xxx`): No login required, shows job details, stone fees, currency selector
- ✅ **Currency selection**: USD or ILS with live exchange rate from exchangerate-api.com
- ✅ **Tranzilla iframe integration**: Ready to activate with terminal credentials (TRANZILLA_TERMINAL env var)
- ✅ **Test/simulate mode**: Works without Tranzilla credentials for development
- ✅ **Payment notify endpoint**: Receives Tranzilla POST callback, records payment status on job
- ✅ **Payment link in email**: "Stones Ready" notification email includes "Pay Now" button linking to payment page
- ✅ **Payment status tracking**: Jobs track payment_status, payment_date, payment_transaction_id, payment_currency, payment_amount

---

## Prioritized Backlog

### P0 - Critical
- None currently

### P1 - High Priority
- [ ] SMS notifications (Twilio integration)
- [ ] Domain verification for Resend email (production use)
- [ ] Legacy data migration from CSV/database

### P2 - Medium Priority
- [x] Verbal findings entry and display (Implemented in Stone Dialog)
- [x] Document upload for certificate scans (Implemented in Stone Dialog)
- [x] Cloud storage for uploaded files (Cloudinary integration - Feb 23, 2026)
- [x] Email notifications with Resend (Feb 24, 2026)
- [ ] Backend refactoring (split server.py into modular routers)
- [ ] Frontend refactoring (decompose large page components)

### P3 - Low Priority / Future
- [ ] Mobile responsive improvements
- [ ] Two-Factor Authentication setup flow
- [ ] Bulk job import
- [ ] Reporting and analytics dashboard
- [ ] Client portal for tracking

---

## API Endpoints

### Authentication
- POST `/api/auth/login` - Login with email/password
- POST `/api/auth/register` - Register new user
- GET `/api/auth/me` - Get current user info

### Shipments
- GET `/api/shipments` - List all shipments
- POST `/api/shipments` - Create new shipment
- GET `/api/shipments/{id}` - Get shipment details
- PUT `/api/shipments/{id}` - Update shipment
- PUT `/api/shipments/{id}/status` - Update status with cascade
- PUT `/api/shipments/{id}/jobs` - Update jobs in shipment
- DELETE `/api/shipments/{id}` - Delete shipment
- GET `/api/shipments/config/options` - Get dropdown options

### Jobs
- GET `/api/jobs` - List all jobs
- POST `/api/jobs` - Create new job
- GET `/api/jobs/{id}` - Get job details
- PUT `/api/jobs/{id}` - Update job (notes, status)
- PUT `/api/jobs/{id}/status` - Update job status
- PUT `/api/jobs/{id}/group-stones` - Group stones for certificate
- PUT `/api/jobs/{id}/memo` - Upload signed memo

### Notifications (Email)
- GET `/api/jobs/{job_id}/notifications/status` - Get notification status for a job
- GET `/api/jobs/{job_id}/notifications/preview/{type}` - Preview email content
- POST `/api/jobs/{job_id}/notifications/send/{type}` - Send email via Resend

### Clients
- GET `/api/clients` - List all clients
- POST `/api/clients` - Create new client
- GET `/api/clients/{id}` - Get client details

### Branches
- GET `/api/branches` - List all branches
- POST `/api/branches` - Create new branch

### Dashboard
- GET `/api/dashboard/stats` - Get dashboard statistics

---

## Test Credentials
- **Email**: admin@bashari.com
- **Password**: admin123
- **Role**: super_admin

---

## File Structure

```
/app
├── backend/
│   ├── server.py              # Slim FastAPI app (103 lines)
│   ├── database.py            # MongoDB connection
│   ├── auth.py                # JWT, password hashing, auth deps
│   ├── models.py              # All Pydantic models
│   ├── pricing.py             # Pricing engine + constants
│   ├── utils.py               # SKU generation, helpers
│   ├── email_templates.py     # Email HTML template builders
│   ├── routes/
│   │   ├── auth_routes.py     # Auth (login, register, 2FA, setup-password)
│   │   ├── branches.py        # Branch CRUD
│   │   ├── clients.py         # Client CRUD + auto-setup email
│   │   ├── jobs.py            # Job CRUD + stone management
│   │   ├── stones.py          # Stone endpoints (verbal, fees, cert scans)
│   │   ├── shipments.py       # Shipment CRUD + status cascade
│   │   ├── notifications.py   # Email notification preview/send/status
│   │   ├── settings.py        # Dropdown settings
│   │   ├── cloudinary_routes.py # Cloudinary signature/delete
│   │   ├── pdf.py             # PDF generation (memo-in, invoice, shipment)
│   │   ├── pricing_routes.py  # Pricing config endpoints
│   │   ├── users.py           # Admin user management
│   │   ├── dashboard.py       # Dashboard stats
│   │   ├── payments.py        # Payment gateway endpoints
│   │   ├── addresses.py       # Address CRUD
│   │   └── documents.py       # Document upload
│   ├── tests/
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx          # Root layout
    │   │   ├── page.tsx            # Login page
    │   │   ├── setup-password/     # Customer password setup
    │   │   ├── pay/                # Payment page (public)
    │   │   └── (dashboard)/
    │   │       ├── layout.tsx      # Dashboard layout with sidebar
    │   │       └── dashboard/
    │   │           ├── page.tsx           # Main dashboard
    │   │           ├── jobs/page.tsx      # Jobs management
    │   │           ├── stones/page.tsx    # Stones management
    │   │           ├── shipments/page.tsx # Shipments management
    │   │           ├── clients/page.tsx   # Clients management
    │   │           └── settings/page.tsx  # Settings
    │   ├── components/ui/          # shadcn/ui components
    │   └── lib/
    │       ├── api.ts              # Axios API client
    │       ├── store.ts            # Zustand state management
    │       └── utils.ts            # Utility functions
    ├── .env
    ├── package.json
    └── tailwind.config.ts
```

---

## Design System
- **Primary Color**: Navy (#102a43)
- **Accent Color**: Gold (#fbbf24)
- **Font**: Inter (system font stack)
- **Components**: shadcn/ui with custom styling
- **Layout**: Desktop-first with collapsible sidebar

---

### Session: Mar 24, 2026 - Backend Refactoring
**Refactored monolithic server.py (3,815 lines) into modular architecture:**
- ✅ `server.py` → 103 lines (slim app setup + router imports)
- ✅ `database.py` → MongoDB connection module
- ✅ `auth.py` → JWT, password hashing, auth dependencies
- ✅ `models.py` → All Pydantic models (410 lines)
- ✅ `pricing.py` → Pricing engine + constants
- ✅ `utils.py` → SKU generation, stone type codes, logo download
- ✅ `email_templates.py` → Email HTML template builders (379 lines)
- ✅ 16 route files in `routes/` directory
- ✅ **24/24 backend API tests passed (iteration_17)**
- ✅ **All frontend pages verified working**

### Session: Mar 24, 2026 - Tranzila Payment Gateway Integration
**Integrated Tranzila payment gateway with live API:**
- ✅ Handshake flow: Backend calls `api.tranzila.com` to get secure `thtk` token
- ✅ Iframe payment: Frontend embeds Tranzila's `iframenew.php` for PCI-compliant CC processing
- ✅ BIT wallet payment support (`bit_pay=1` parameter)
- ✅ Currency selector: USD or ILS with live exchange rate
- ✅ Notify endpoint: Receives POST callbacks from Tranzila after payment
- ✅ Payment status polling: Frontend polls every 5s during iframe interaction
- ✅ Payment simulation: Test mode for when Tranzila is not configured
- ✅ Branding: Bashari colors, no Tranzila logo, custom button labels
- ✅ **12/12 backend payment API tests passed (iteration_18)**
- Terminal: `grsil`, credentials stored in `.env`

---

## Known Issues
1. **Platform Preview Bug**: The Emergent platform "Preview" button shows an Expo QR code. Workaround: Use direct URL to access the app.
2. **Resend Email Limitation**: Free tier Resend accounts with default sender (onboarding@resend.dev) can only send emails to the account owner's email. Domain verification required at resend.com/domains for production use.

---

## Testing Status
- Backend: 100% (all API tests passed)
- Frontend: 100% (all test flows completed)
- Test reports: 
  - `/app/test_reports/iteration_2.json` - Jobs page features
  - `/app/test_reports/iteration_3.json` - Stacked modals feature
  - `/app/test_reports/iteration_4.json` - Structured verbal findings & nested job modal
  - `/app/test_reports/iteration_5.json` - UI/UX bug fixes (Feb 22, 2026)
  - `/app/test_reports/iteration_6.json` - Nested job modal full features & group cert scan fix (Feb 22, 2026)
  - `/app/test_reports/iteration_7.json` - Memo upload bug fix (Feb 22, 2026)
  - `/app/test_reports/iteration_11.json` - Admin Settings page (Feb 23, 2026)
  - `/app/test_reports/iteration_12.json` - Cloudinary integration (Feb 23, 2026)
  - `/app/test_reports/iteration_13.json` - Customer access control & dashboard navigation (Feb 23, 2026)
  - `/app/test_reports/iteration_15.json` - 5-Stage Email Notification System (Feb 24, 2026)
  - `/app/test_reports/iteration_16.json` - UI/UX fixes: unified edit mode, notification refresh, actual fees (Feb 24, 2026)
  - `/app/test_reports/iteration_17.json` - Backend refactoring validation: 24/24 API tests passed, all frontend pages verified (Mar 24, 2026)
  - `/app/test_reports/iteration_18.json` - Tranzila payment gateway: 12/12 payment API tests passed (Mar 24, 2026)
  - `/app/test_reports/iteration_19.json` - Mounted fee feature: 7/7 backend + all frontend flows passed (Apr 14, 2026)
  - `/app/test_reports/iteration_20.json` - Comprehensive full system test: 39/39 backend + all frontend flows passed (Apr 14, 2026)

### Session: Apr 14, 2026 - Mounted Fee & Color Stability Fix
- ✅ Completed "mounted" toggle for stones (marks stone as jewellery-mounted, adds configurable fee)
- ✅ Mounted fee only charged once per certificate group (backend logic in /app/backend/routes/stones.py)
- ✅ Added `mounted` field to Stone interfaces in both jobs/page.tsx and stones/page.tsx
- ✅ Added `mounted` to stonesApi.updateFees type signature in api.ts
- ✅ Added mounted toggle UI (Switch) to stone detail dialog on Jobs page
- ✅ Added mounted toggle UI (Switch) to stone detail dialog on Stones page
- ✅ Save handler in both pages sends mounted state to backend and refreshes data after save
- ✅ Fixed StoneResponse model missing `mounted` field (bug found by testing agent)
- ✅ Fixed duplicate junk code at end of jobs/page.tsx from previous session
- ✅ Color stability test fee toggle working correctly ($50 add/remove)
- ✅ total_fee updates dynamically after toggling mounted or color stability test

### Session: Apr 14, 2026 - Mounted Group Propagation
- ✅ Updated mounted toggle to propagate to ALL stones in the same certificate group
- ✅ Mounting any stone in a group marks all group stones as mounted (fee added once)
- ✅ Unmounting any stone in a group marks all group stones as unmounted (fee removed once)
- ✅ Color stability test remains per-stone (independent of group)

### Session: Apr 14, 2026 - Job Detail Dialog Layout Rearrangement
- ✅ Restructured job detail dialog from single-column to 2-column layout on desktop (lg breakpoint)
- ✅ Left column: Stones table (primary content, now visible immediately)
- ✅ Right sidebar (280px): Action cards (Signed Memo, Client Invoice, Payment, Lab Invoice, Notifications)
- ✅ Dialog widened from max-w-4xl to max-w-5xl to accommodate 2-column layout
- ✅ Action sections converted to compact bordered cards with smaller buttons/text
- ✅ Mobile layout preserved: single column with stones first, then actions stacked below
- ✅ No mobile breakage verified on 390px viewport

### Session: Apr 14, 2026 - Payment Link UX + Stone Dialog UX
- ✅ Payment link: added "Open" button (opens in new tab) alongside "Copy Link"
- ✅ Stone dialog: Save button moved to sticky footer (always visible without scrolling)
- ✅ Stone dialog: Unsaved changes confirmation when closing in edit mode ("Discard" / "Save & Close")
- ✅ Extracted stone save handler into named `handleSaveStone` function for reuse

### Session: Apr 14, 2026 - Adjustment Payments & Job Discount
- ✅ Adjustment payment: when job is paid, admin can create an adjustment payment with manual amount
- ✅ Adjustment payment page shows notice: "This is an adjustment payment..."
- ✅ Backend stores `payment_adjustment` and `payment_adjustment_amount` flags on job
- ✅ Job-level discount: admin can set a discount in edit mode (e.g., $100 deducted from total)
- ✅ Net Total shown when discount is active (Total Fees - Discount)
- ✅ Discount applied in payment calculation (deducted from total before charging)
- ✅ Discount NOT applied to adjustment payments (manual amount only)
- ✅ Payment page shows discount info when applicable

### Session: Apr 20, 2026 - SMS Notifications (SMS4Free Integration)
- ✅ SMS4Free API integrated (`/app/backend/sms.py`) with send and balance check
- ✅ SMS notification endpoints: preview (`GET /jobs/{id}/sms/preview/{type}`), send (`POST /jobs/{id}/sms/send/{type}`), balance (`GET /sms/balance`)
- ✅ 5 SMS message templates (per status): stones_accepted, verbal_uploaded, stones_returned, cert_uploaded, cert_returned
- ✅ Messages include job details, fee summary, and login link for customer portal
- ✅ SMS send logged in job's `notification_log` with channel=sms
- ✅ Frontend: Email + SMS buttons side by side in notification section
- ✅ SMS balance: 9 messages available (free tier — sender must be phone number; after purchasing package, sender can be changed to BASHARI-LAB)
- ✅ Successfully sent test SMS to client phone number

### Session: Apr 20, 2026 - Fee Display Fixes
- ✅ Fixed: Color stability fee shows actual amount from DB (e.g., "+$30") instead of hardcoded "+$50"
- ✅ Fixed: Mounted fee shows "Yes (+$50)" format (same as color stability)
- ✅ Fixed: Stone `fee` field now includes mounted fee (was only in job total before)
- ✅ Fixed: Job `total_fee` recalculated from stone fees (grouped mounted counted once per group)
- ✅ Fixed: Backend recalculates total from stone fees instead of incremental `$inc`
- ✅ Migrated existing data: all mounted stones' fees updated to include mounted fee
- ✅ Dynamic fee amounts fetched from pricing config on both Jobs and Stones pages

---

## Test Credentials
- **Admin Email**: admin@bashari.com
- **Admin Password**: admin123
- **Admin Role**: super_admin
- **Customer Email**: customer@test.com
- **Customer Password**: customer123
- **Customer Role**: customer

---

## Session: Apr 21, 2026 — Mobile Fix · Documents & Email Refinement · Welcome Bulk

### Mobile Job Modal Overflow (P0 fix)
- ✅ Removed `-mx-4 px-4` negative margins from `DialogFooter` in `/app/frontend/src/components/ui/dialog.tsx` that caused the footer to be 32px wider than its container on mobile, producing the horizontal scroll / zoom-in effect.
- ✅ Verified: on 388×800 mobile viewport, both view mode AND edit mode have `document.documentElement.scrollWidth === window.innerWidth` with no wide offenders.

### Branded Print Document Refinement (P1)
- ✅ Rewrote `handlePrintJob` in jobs/page.tsx to produce a polished, print-color-safe HTML document.
- ✅ Added `COMPANY_INFO` constant (display name, legal name, address, phones, email, VAT, logo URL).
- ✅ Header now has real logo image + display name + legal subline + full contact panel on the right.
- ✅ Document title reflects job status (Intake Receipt / Job Memo / Completion Memo).
- ✅ Two party cards (Client / Lab Branch) showing name, address, phone, email — sourced from newly-extended Client & Branch interfaces that include address/phone/email.
- ✅ Stones table now includes a Flags column (CS = Color Stability Test, Mtd = Mounted) plus certificate group separators.
- ✅ Fee summary box shows subtotal + discount when applicable, then Total Fee (USD).
- ✅ Dual signature blocks (Client + Lab Representative) with date fields.
- ✅ Footer with legal name · address · phones · email · VAT · printed timestamp.
- ✅ Fixed print color rendering (`-webkit-print-color-adjust: exact`).
- ✅ UTF-8 charset meta tag to preserve em-dashes and Hebrew legal text.

### Email Template Refinement (P1)
- ✅ Full rewrite of `/app/backend/email_templates.py` with a consistent branded wrapper (navy header with logo, soft-navy body, legal-name footer with contact + VAT).
- ✅ Shared building blocks: `_header_html`, `_footer_html`, `_cta_button`, `_job_meta_pill` — used across every notification type.
- ✅ Re-styled tables to match navy palette; SKU rendered in monospace.
- ✅ Removed stale `actual_fee` references; introduced `_fees_breakdown_table` with optional Subtotal+Discount+Total.
- ✅ Each notification now includes a contextual CTA button linking back to the client portal.
- ✅ Verbal-results table reduced to 6 core columns so it renders well in narrow email clients.
- ✅ Added new `welcome` notification type.

### Bulk Welcome Email with Admin Selection (P1)
- ✅ Backend: `GET /api/notifications/welcome/preview?client_id=` returns subject + rendered html_body (optionally personalised).
- ✅ Backend: `POST /api/notifications/welcome/bulk` accepts `{client_ids: []}`, sends to each, handles:
  - Invalid ObjectId → status `failed`
  - Client missing → status `failed`
  - Client without email → status `skipped`
  - Resend configured → status `sent` (with resend_id logged)
  - Resend not configured → status `mocked`
  - Returns per-client results + summary `{sent, mocked, failed, skipped}`
  - Writes audit entry to `clients.notification_log` + `last_welcome_sent_at`
- ✅ Frontend: Clients page super-admin UI
  - Row checkboxes (desktop + mobile) behind `isSuperAdmin` guard
  - Header select-all checkbox (`data-testid=client-select-all`)
  - "Send Welcome Email" button with selection count badge (disabled when none selected)
  - Preview dialog uses an iframe rendering the actual email (personalised to first selected client) + recipients list
  - Confirm sends bulk and replaces preview with a results dashboard: counters (Sent/Mocked/Skipped/Failed) + per-client status table with icons

### Code Cleanup
- ✅ Hid "Add Client" button from customer role on /dashboard/clients for role consistency.

### Testing (iteration_21.json)
- ✅ 18 new backend tests (welcome preview + bulk + regression of 5 notification types + auth/clients/jobs)
- ✅ Frontend mobile overflow verified (scrollWidth == innerWidth, view + edit)
- ✅ Print HTML captured and all 10 content assertions pass
- ✅ Super-admin welcome dialog flow verified end-to-end
- ✅ Customer role guard verified (checkboxes + welcome button hidden)
- ✅ Success rate: **100% (backend + frontend)**

---

## Session: Apr 21, 2026 (later) — Palette Alignment + Print Doc Refinements

User feedback on iteration 21 output led to a follow-up pass:

1. ✅ **Palette aligned to app identity** (charcoal-black `#141417` + red `#E30613`, neutral grays `#3f3f46`/`#71717a`/`#a1a1aa`), replacing the blue-navy `#102a43` palette across:
   - `/app/frontend/src/app/(dashboard)/dashboard/jobs/page.tsx` (`handlePrintJob`)
   - `/app/backend/email_templates.py` (`BRAND_NAVY`, `TEXT_BODY`, `TEXT_MUTED`, `BG_SOFT`, `BORDER_SOFT`, body wrapper)
2. ✅ **Removed redundant top-right company-address block** from the print header (contact info already appears in the footer).
3. ✅ **Renamed group labels** in the stones table: instead of `Certificate 1 — Pair (2 stones)` the print now shows `pair-1 (2 stones)`, `pair-2 (2 stones)`, `layout-1 (5 stones)`, `single-1`, `multi-stone-1`. Numbering is per-type.
4. ✅ **Removed the amber "Certificates:" summary banner** from the header area.
5. ✅ **Added `Total Certificates` field** to the Job Summary grid (value = `groups + ungrouped_stones`). Grid widened to 5 columns.

All five items verified visually by rendering the print HTML and both `stones_accepted` + `stones_returned` email previews against the preview URL.

---

## Upcoming Tasks (P1)
- Refine dashboard for clients and for admin (further polish)
- **Shipments doc** — printable shipment document (similar to the job memo we just polished)
- **Bulk client notifications per shipment** — allow admin to notify every client whose jobs are part of a given shipment (intake / dispatched / delivered)
- SMS notifications integration (expansion as needed)

## Future Tasks (P2)
- Mobile visibility full audit across all pages
- Prices — finalise (books, layouts etc)

---

## Session: Apr 23, 2026 — Shipments Redesign

User asked for a nicer way to display shipments in the shipments page, the dashboard, and reflect shipment status in the Jobs page. User chose:
- Labels: keep current (`Send Stones to Lab`, `Stones from Lab`, `Certificates from Lab`)
- Colour: neutral charcoal for all 3 types (differentiate by icon + direction arrow only)
- Progress: animated truck icon sliding left→right based on status
- Order: Shipments page → Jobs page → Dashboard

### A. Shipments page (/app/frontend/src/app/(dashboard)/dashboard/shipments/page.tsx)
- Added `typeFilter` state + per-type counts
- New **type tabs**: `All` / `Send Stones to Lab` / `Stones from Lab` / `Certificates from Lab` with icon + badge count
- Replaced the old dense table with a **responsive card grid** (1 col mobile, 2 cols desktop). Each card shows:
  - Type icon tile (Send / Gem / FileCheck2) + #shipment # + type label + courier/tracking
  - Status badge top-right
  - Route: `source → destination` with ArrowRight separator
  - **Animated truck progress bar** (new `TruckProgress` component with a rail, filled portion, `Truck` icon sliding to `pending=6% / in_transit=50% / delivered=94%`, bob animation, 3 step labels)
  - Footer: jobs · stones · value + quick actions (`Mark In Transit` / `Mark Delivered`)
- Cancelled shipments render as a red-tinted empty rail with "Cancelled" label
- Added `@keyframes bob` to `/app/frontend/src/app/globals.css`

### C. Jobs page shipment chip (/app/frontend/src/app/(dashboard)/dashboard/jobs/page.tsx)
- Extended `Job.shipment_info` TS type to include courier/tracking/source/destination
- New `ShipmentChip` component + `ShipmentTypeIcon` helper + `SHIPMENT_TYPE_LABELS` / `SHIPMENT_STATUS_LABELS` constants
- Replaced the plain `Badge #N + status` with a proper chip: type icon + `#N` + coloured status pill, with source→dest line beneath (truncated)
- Status pill uses distinct colours: charcoal for pending, navy-900 for in_transit, emerald for delivered, red for cancelled

### B. Dashboard shipments card (/app/frontend/src/app/(dashboard)/dashboard/page.tsx)
- Replaced the vertical "Recent Shipments" list with a **3-column summary** (one col per type)
- Each column shows: type icon tile + label + **in-transit count** (large number) + "pending" sub-counter (amber) + **mini truck progress bar** for the latest shipment of that type, with shipment # and status
- Entire column is a clickable button → goes to `/dashboard/shipments`
- Fetches full `allShipments` list (was previously sliced to 5)

### Bug fixes during implementation
- Removed unused `CardHeader`, `CardTitle` imports from shipments page (ESLint blocker)
- Removed unused `ArrowRight` import from dashboard page
- Suppressed unused `openShipmentModal` with `void` (legacy modal still rendered)

### Testing
- Visual smoke test confirmed on 1440×1000 admin session:
  - Shipments page: tabs switch correctly; card grid renders with animated truck for each shipment
  - Dashboard: 3-column shipments panel shows `0 in transit · 5 pending` for "To Lab" with latest=#11 delivered mini-bar
  - Jobs page: all jobs with shipments now show the typed chip with `#N` + `Delivered`/`Pending` pill + `Israel → HK Lab`
- Backend regression: `/api/shipments` returns 11 shipments, `/api/jobs` returns shipment_info with source/destination populated

---

## Session: Apr 23, 2026 (later) — Compact Jobs Table + Stone/Job Removal

User asks:
1. Jobs page is too wide
2. Allow removing a stone from a job
3. Allow removing a job from a shipment

### 1. Jobs table compacted (jobs/page.tsx)
- Added `table-fixed` width control: Job#=16px, Stones=16px, Value/Fee=28px, Status=32px, Payment=20px, Shipment=24px; `Client` column now has name + branch subtitle on two lines (saved a whole column)
- Merged `Value` + `Fee` columns into a single `Value / Fee` stacked cell (value small on top, fee bold, net-after-discount tiny green row if applicable)
- Dropped separate `Branch` column (now shown inline under client name)
- **New** `ShipmentChip` has a `compact` prop for table use: icon + `#N` + tiny coloured status dot (no wrapped badge, no source/dest line). Full tooltip (`title=`) preserves all details. The non-compact chip still used elsewhere.
- Jobs page now fits at 1280px with no horizontal scroll

### 2. Remove stone from job
- **Backend**: `DELETE /api/jobs/{job_id}/stones/{stone_id}` (routes/jobs.py)
  - Removes the stone from the job's `stones` array
  - Reassigns contiguous positions (1..N)
  - Recalculates `total_stones` / `total_value` / `total_fee`
  - Admin-only (`require_admin`)
- **Frontend**: `jobsApi.deleteStone(jobId, stoneId)` + `handleDeleteStone(stoneId, sku)` with confirm()
- **UI**: red trash icon in the stones table (new last column for admins only), both ungrouped rows AND grouped rows; mobile card also has trash icon next to fee. `colSpan` of group header adjusted (isAdmin ? 9 : 8)

### 3. Remove job from shipment
- **Backend**: reused existing `PUT /api/shipments/{id}/jobs` — send the job_ids list without the removed job
- **Frontend**: `handleRemoveJobFromShipment(jobId, jobNumber)` filters out of `job_ids` list, calls update, refreshes both `shipments` + `selectedShipment` + local `shipmentJobs` state
- **UI**: trash icon in the shipment detail dialog's jobs table (new admin-only column) + mobile card (next to status badge)

### Smoke test (admin @1280)
- Jobs table: compact, no horizontal scroll, `doc==win==1280`
- Job #24 modal: 11 stones rendered with trash icons visible (2 ungrouped + 3 certificate groups with stones); works for certs 1 (pair), 2 (pair), 3 (layout)
- Shipment #11 modal: 3 jobs each with trash icon in a new action column
- Backend regression: `/api/jobs`, `/api/shipments`, `/api/shipments/{id}/jobs` all healthy; DELETE non-existent returns 404

---

## Session: Apr 23, 2026 (eve) — Manual Payments (Wire / Cash)

User asks:
1. Admin records manual payment (wire/cash) with amount + destination + note
2. Each payment auto-assigned an ID
3. Email + SMS receipt after payment (email has receipt inline + link; SMS has login-required link)

User choices confirmed: partial payments supported; over-payment blocked (400); inline HTML + public link only (no PDF); login-required receipt view; super_admin + branch_admin can record; receipt shows job summary + itemised stones + "$400 of $900 paid" if partial.

### Backend
- `PricingConfig.payment_destinations` — editable list persisted in `pricing_config` doc (default 4 entries: Bank Wire Leumi/Hapoalim, Cash Israel/HK offices)
- `POST /api/jobs/{job_id}/manual-payment` (routes/manual_payments.py)
  - Generates `PMT-XXXXXXXX` id (8 hex chars, uuid4)
  - Appends to `job.payments[]` with `{id, method: "manual", amount, destination, note, recorded_at, recorded_by}`
  - Blocks over-payment (400 if amount > balance due)
  - Marks `payment_status` = "paid" / "partial" based on cumulative vs net total (net = total_fee − discount)
  - Optionally emails HTML receipt via Resend + SMS via SMS4Free (both best-effort, failures logged)
- `GET /api/receipts/{payment_id}` — structured receipt payload, login-required (customers can only see their own jobs)
- New email template type `manual_payment_receipt` with receipt-ID hero block (dark navy), paid/partial status banner, itemised stones table, portal link CTA
- New SMS message for `manual_payment_receipt` including payment ID + login URL
- `JobResponse.payments[]` added to the pydantic model (datetime serialised to ISO)

### Frontend
- **Settings → Stone Types & Shapes tab**: new "Payment Destinations" card (add/remove/edit list); persists via `settingsApi.updatePricing`
- **Jobs page → Job detail**:
  - Added `Job.payments[]` field to the TS interface
  - Payment section now renders a balance strip: "$X of $Y paid" + mini progress bar (green when fully paid, navy while partial)
  - New "Record Manual Payment (wire / cash)" button — only shown when balance > 0
  - Payment history list below showing each payment's ID (mono), amount, destination, date
  - New dialog (`data-testid=manual-payment-dialog`) with: amount (pre-filled with balance), destination select, optional note, Email + SMS checkboxes. Post-submit shows the generated payment ID in a hero tile, paid-in-full or remaining-balance banner, and per-channel notification status
- `manualPaymentsApi.record` + `manualPaymentsApi.getReceipt` in api.ts
- "Paid" pill styling extended with an amber "Partial" pill when `payment_status === 'partial'`

### Smoke tests
- Over-payment (amount > balance) → 400 "Amount exceeds balance due"
- Partial payment ($4 of $10) → status `partial`, balance $6, payment id returned
- Balance payment ($6) → status `paid`, balance 0, second payment id returned
- GET receipt returns correct breakdown with `is_fully_paid: true` once combined
- Email + SMS triggered on record (logs "[MOCK PAYMENT EMAIL] ..." when Resend unconfigured)
