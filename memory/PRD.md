# Bashari Lab-Direct — Product Requirements Document

> **Customer:** Bashari (gemstone testing lab).
> **Tagline used in app:** "GRS Global – Lab Logistics & ERP System".
> **Production URL:** https://lab.bashari.co
> **Preview URL:** https://bashari-lab-direct.preview.emergentagent.com (dev env, not user-facing)

---

## 1. Overview

A laboratory logistics and ERP application for gemstone testing. Desktop-first responsive web app inspired by the visual language of GRS GemResearch Swisslab (gemresearch.ch). Three classes of users — Bashari super-admins, branch admins, and the lab's customers — collaborate around a job→stone→shipment→payment lifecycle. Communication with customers happens via in-app portal + transactional email (Resend) + SMS (SMS4Free).

## 2. Tech Stack

- **Frontend**: Next.js 14 (App Router, `output: 'export'` static export), React, TypeScript, Tailwind CSS, shadcn/ui.
  - Routing is handled via a **custom SPA router** at `frontend/src/app/page.tsx` to keep the static-export deploy on Kubernetes/Nginx ingress alive. **Do not** swap back to standard Next.js client-side routing — it has caused Cloudflare 520 loops in the past.
- **Backend**: Python FastAPI, Pydantic v1 models, async Mongo driver.
- **Database**: MongoDB (`MONGO_URL`, `DB_NAME` from `.env`).
- **Auth**: JWT (`/api/auth/login`), with optional TOTP 2FA for admins. Public access requests are gated by an OTP-verified signup flow + admin approval.
- **Bot protection**: Cloudflare Turnstile on `/login` (single-use tokens — never re-send the same token across a 2FA / OTP-verify step).
- **Asset storage**: Cloudinary (PDFs, certificate scans). All Cloudinary `uploader.upload` calls are wrapped in `asyncio.to_thread` to avoid blocking the FastAPI event loop (root cause of past production 520s).
- **Email**: Resend (templated transactional via `email_templates.py`).
- **SMS**: SMS4Free.

## 3. Core Entities

1. **User** — `super_admin`, `branch_admin`, or `customer`.
2. **Branch** — Office (e.g. Israel, HK Lab). Used for scoping admin access and addresses on memos.
3. **Client** — Customer profile linked to a branch. Setup via OTP-verified signup + admin approval, or manually by an admin (welcome email with setup-password link).
4. **Job** — Work order with stones + status (intake → at_lab → verbal_results → cert_uploaded → cert_returned → done).
5. **Stone** — Individual gemstone within a job. Has SKU (auto `<TYPE><CT00><JOB><POS>`), weight, type, shape, value, fee, certificate group, verbal findings, certificate scan URL. **Soft-cancellable** (`cancelled: true` keeps the doc for audit but excludes it from job totals and customer payment amounts).
6. **Shipment** — Container moving jobs/stones between branches. Three types: `Send Stones to Lab`, `Stones from Lab`, `Certificates from Lab`. Status: pending → in_transit → delivered (or cancelled). Drives cascade updates on contained jobs.
7. **Payment** — Tranzila gateway charge OR manual record (wire / cash) created by an admin. Supports partial / over-payment-blocked / adjustment payments.

## 4. User Roles

- **Super Admin**: full access across all branches.
- **Branch Admin**: scoped to their branch only.
- **Customer**: read-only access to their own jobs + payment links.

## 5. Routing & Auth-Gate Notes

- `/` runs the custom SPA router (lazy-loads dashboard pages, shows landing/login for unauthed visitors).
- Every protected route under `/dashboard/...` is prerendered as its own HTML file by the static export. The `dashboard/layout.tsx` **must** redirect unauthed visitors to `/login` (we re-broke and re-fixed this in Feb 2026 — see CHANGELOG). The redirect is gated on `mounted` so zustand-persist has time to rehydrate from sessionStorage.
- `LoginPage` has no auto-redirect on mount; it only pushes to `/dashboard` after a successful login. This prevents redirect loops with the layout guard.

## 6. Data Integrity Rules (Important)

- **Cancelled stones must never contribute to job totals or customer payment amounts.** Use `backend/jobs_helpers.py:active_stones()` + `recompute_job_totals()` + `payable_amount()`. The `StoneResponse` Pydantic model exposes `cancelled`/`cancelled_at`/`cancelled_by` so the frontend can filter in views too.
- **Job-number padding**: zero-padded to 5 digits, seeded to start at `00500`.
- **Backend totals are the source of truth**: the frontend should not recompute `total_fee` from stones in checkout flows.

## 7. File Layout

```
/app
├── backend/
│   ├── server.py              # Slim FastAPI app entry
│   ├── database.py            # Mongo connection
│   ├── auth.py                # JWT, password hashing, role deps, Turnstile verify
│   ├── login_security.py      # Turnstile, brute-force lockout
│   ├── models.py              # Pydantic response/request models
│   ├── pricing.py             # Pricing brackets + CS/mounted fees
│   ├── jobs_helpers.py        # Shared job-totals math (active_stones, recompute_job_totals, payable_amount)
│   ├── utils.py               # SKU generation, ID helpers
│   ├── email_templates.py     # Templated HTML email builders
│   ├── sms.py                 # SMS4Free integration
│   ├── routes/
│   │   ├── auth_routes.py     # login, register, 2FA, setup-password, access requests
│   │   ├── branches.py
│   │   ├── clients.py
│   │   ├── jobs.py            # job CRUD + stone subdoc mgmt
│   │   ├── stones.py          # verbal, fees, cert scans, cancel/uncancel
│   │   ├── shipments.py       # CRUD + status cascade
│   │   ├── notifications.py   # email previews/send/status
│   │   ├── settings.py        # dropdown/pricing config
│   │   ├── cloudinary_routes.py
│   │   ├── pdf.py             # Memo-in receipt, invoice, shipment memo
│   │   ├── payments.py        # Tranzila handshake/callback
│   │   ├── manual_payments.py # Wire / cash records + receipt
│   │   ├── users.py
│   │   ├── dashboard.py
│   │   ├── addresses.py
│   │   └── documents.py
│   ├── tests/
│   └── .env                   # MONGO_URL, JWT_SECRET, RESEND_API_KEY, SMS4FREE_*, CLOUDINARY_*, TURNSTILE_*
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx              # Custom SPA router (root)
    │   │   ├── login/                # Login + Turnstile
    │   │   ├── setup-password/       # Customer first-login flow
    │   │   ├── request-access/       # Public OTP-signup
    │   │   ├── pay/                  # Public payment page (Tranzila redirect)
    │   │   └── dashboard/
    │   │       ├── layout.tsx        # Sidebar + auth-gate redirect
    │   │       ├── page.tsx          # Home dashboard
    │   │       ├── jobs/page.tsx     # >2.4k LOC (planned refactor)
    │   │       ├── stones/page.tsx
    │   │       ├── shipments/page.tsx
    │   │       ├── clients/page.tsx
    │   │       ├── profile/page.tsx
    │   │       └── settings/page.tsx
    │   ├── components/ui/            # shadcn/ui
    │   └── lib/
    │       ├── api.ts                # Axios client (REACT_APP_BACKEND_URL via NEXT_PUBLIC_API_URL='/api')
    │       ├── store.ts              # zustand (auth-storage in sessionStorage)
    │       ├── tokenStorage.ts
    │       └── stoneDropdownFilter.ts # shared verbal-finding dropdown scoping
    ├── package.json                   # atomic build/swap script — DO NOT replace with a plain `next build`
    └── .env                           # NEXT_PUBLIC_API_URL='/api'
```

## 8. API Endpoints (selected)

### Auth
- `POST /api/auth/login` (Turnstile token required; 2FA challenge on subsequent step uses a SEPARATE token, never re-send the login Turnstile)
- `POST /api/auth/request-access` + `/verify-otp` + admin approval flow
- `POST /api/auth/setup-password/{token}` — customer welcome-email flow

### Jobs & Stones
- `GET /api/jobs` · `POST /api/jobs` · `GET /api/jobs/{id}` · `PUT /api/jobs/{id}` · `PUT /api/jobs/{id}/status`
- `DELETE /api/jobs/{id}/stones/{stone_id}` (hard delete — uses `jobs_helpers.recompute_job_totals` over active stones)
- `PUT /api/stones/{id}/verbal` (structured findings — always-write semantics, can clear fields)
- `PUT /api/stones/{id}/fees` (CS/mounted toggle — also re-syncs job totals from active set)
- `PATCH /api/stones/{id}/cancel` · `PATCH /api/stones/{id}/uncancel`

### Shipments
- `GET /api/shipments` · `POST /api/shipments` · `PUT /api/shipments/{id}` · `PUT /api/shipments/{id}/status`
- `PUT /api/shipments/{id}/jobs`

### Notifications
- `GET/POST /api/jobs/{id}/notifications/{preview|send|status}/{type}` — email
- `GET/POST /api/jobs/{id}/sms/{preview|send}/{type}` — SMS

### Payments
- `GET /api/payment/{token}` · `POST /api/payment/{token}/handshake` (Tranzila) · `/test-success`
- `POST /api/jobs/{id}/manual-payment` (wire / cash with optional email+SMS receipt)
- `GET /api/receipts/{payment_id}` — login-required receipt view

### Misc
- `GET /api/dashboard/stats`
- `GET /api/settings/dropdowns` · `GET /api/settings/pricing`
- `POST /api/pdf/{kind}` · `POST /api/cloudinary/sign`

## 9. Design System

- **Primary**: navy `#102a43` family.
- **Brand red**: used for destructive / edit affordances.
- **Accent**: gold `#fbbf24` (logo only).
- **Font**: Inter / system stack.
- **Print**: black-only invoice (no colour fills), Bashari letterhead with stacked address block, fixed footer with payment terms.

## 10. Test Credentials

See `/app/memory/test_credentials.md`. The current admin (`admin@bashari.com`) has TOTP 2FA enabled in production; for backend-only tests you can blank `TURNSTILE_SECRET_KEY` temporarily and the login route accepts without a token.

## 11. Known Issues / Gotchas

- **Cloudflare 520 risk**: any synchronous I/O (Cloudinary, ReportLab → S3, large image work) called directly inside an `async def` FastAPI route will block the event loop and trigger 520s in production. Wrap in `asyncio.to_thread`.
- **Static-export hot-reload**: `frontend/package.json` uses an atomic build/swap so `build/` is never half-written. The supervisor start hook rebuilds if `build/` is missing. **Do not** replace this with `next build` directly.
- **Turnstile tokens are single-use**: don't re-attach the login token to the 2FA-verify step.
- **Zustand persist hydration**: deep-link auth checks must wait on a `mounted` flag set in `useEffect` to avoid bouncing authenticated users on first paint.

---

For the prioritized backlog and "what's next" see `ROADMAP.md`.
For the chronological development history see `CHANGELOG.md`.
