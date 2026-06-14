# Bashari Lab-Direct — Roadmap

> Tracking what's next. For history of what's been done, see `CHANGELOG.md`. For the product spec, see `PRD.md`.

---

## P0 — Critical

_None currently._

## P1 — High Priority

- [x] **Activity Log Phase 1** — admin-only per-job audit timeline. ✅ done Feb 25 2026. Backend `log_activity()` helper + GET `/api/activity` endpoint with `branch_admin` scoping. Instrumented 7 route files (jobs, stones, manual_payments, shipments, notifications, clients, auth_routes — `LOGIN_SUCCESS` for admins only). Frontend `JobActivityList` card rendered inside Job Detail dialog (`isAdmin` gated). One-line rows, no JSON diffs (per product decision). 365-day Mongo TTL. Tests: iter-36 11/12 pass.
- [x] **Activity Log Phase 2** — global feed page + filters. ✅ done Feb 25 2026. New `/dashboard/activity` page (admin-only). Filters: action multi-select pills, actor, from/to dates (default 7-day lookback). Cursor pagination via `before=<created_at>` + "Load more" button (limit=200). Shared `<ActivityRowItem>` component used by both per-job + global views. New endpoints `/api/activity/actions` and `/api/activity/actors`. Backend tests: 27 passed (13 new Phase 2 + 3 new notification + 12 Phase 1 regression).
- [ ] **Bulk notify clients per shipment.** Admin action: pick a shipment → send the same notification (intake / dispatched / delivered) to every client whose jobs are contained in it.
- [ ] **Refactor: consolidate duplicate dialogs.** User-flagged Feb 25 2026 — multiple copies of the same UI cause feature drift (e.g. parcels worked on /dashboard/jobs but not /dashboard/stones). Sequence:
  1. `<StoneVerbalSection>` ✅ done (used by both stone modals)
  2. `<ShipmentDetailDialog>` ✅ done Feb 25 2026 — extracted to `shipments/_components/ShipmentDetailDialog.tsx` along with CreateShipmentDialog, AddJobsToShipmentDialog, BulkStatusDialog, FileViewerDialog, JobDetailDialog, StoneEditDialog. `shipments/page.tsx` dropped from 2317 → 1149 lines.
  3. `<StoneEditDialog>` ✅ done Feb 25 2026 — canonical lives at `/app/frontend/src/components/dialogs/StoneEditDialog.tsx` (421 lines). All 3 callers (jobs, stones, shipments) migrated. Removed ~600 LOC of duplication; parcel-on-stones-page bug verified fixed (iter-34, 13/13 pass).
  4. `<JobDetailDialog>` — ✅ partially consolidated Feb 25 2026. The two dialogs have *intentional* scope divergence (full admin vs focused subset), so we extracted only the pieces that actually drifted: `<JobStonesTable variant='compact'|'full'>` (one source of truth for cert grouping) and `JOB_STATUSES` / `JOB_STATUSES_WITH_CANCEL` constants in `lib/jobStatuses.ts`. Each page keeps its own dialog shell. jobs/page.tsx: -150 LOC; shipments JobDetailDialog: -97 LOC. iter-38: 9/12 live + 3 code-review verified, no regressions.
- [ ] **Bulk notify clients per shipment.** Admin action: pick a shipment → send the same notification (intake / dispatched / delivered) to every client whose jobs are contained in it.
- [x] **Digital Signatures Phase 1** — ✅ done Feb 25 2026. Dedicated-tablet model: `signing_pad` role + branch-scoped polling, 4 capture roles (client_drop_off, client_collection, cert_collection, courier_drop_off), Cloudinary-backed PNG storage, gallery + cancel/delete in Job Detail dialog, captured signature replaces blank line on job memo PDF, multi-branch ready from day one. iter-39: 23/23 backend tests, 100% frontend live, zero bugs/regressions.
- [ ] **Digital Signatures Phase 2** (defer until needed). Two additive paths atop Phase 1 schema, no migration required:
  1. SMS/email remote-signing link for absent clients (admin clicks "Send remote link" → client gets URL → signs on their phone). Reuses `signature_requests`; adds a token-bound mobile signing page.
  2. Admin acknowledgment signature — admin signs on desktop on behalf with `acknowledged_by_admin: true` flag, clearly labeled on the PDF (for verbal authorization cases).

## P2 — Medium Priority

- [ ] **Mobile responsive audit** across all pages.
- [x] **Session-expired toast on `/login`** when redirected from a protected route (`?reason=expired` query param). _Done Feb 24, 2026 — amber banner on /login renders when Axios interceptor bounces an idle session. See CHANGELOG._
- [ ] **Notify client on stone cancellation** (email + SMS) for traceability.

## P3 — Low Priority / Refactor / Future

### Refactoring (in flight Feb 2026)
- [x] Extract shared `active_stones()` / `recompute_job_totals()` / `payable_amount()` helper to prevent the cancel-leak class of bugs from recurring (done Feb 18, 2026 — `backend/jobs_helpers.py`).
- [x] Extract `filterOptionsForStone` to a shared lib (done — `frontend/src/lib/stoneDropdownFilter.ts`).
- [x] Split PRD.md into PRD / CHANGELOG / ROADMAP (done Feb 18, 2026).
- [x] Extract `_lib/buildJobMemoHtml.ts` from `jobs/page.tsx` (done — `jobs/page.tsx` 2471 → 2178).
- [x] Extract `_lib/buildShipmentJobMemoHtml.ts` from `shipments/page.tsx` (done — 2356 → 2233).
- [x] Decompose `routes/jobs.py:create_job` into `_enforce_client_branch_consistency` / `_assign_next_job_number` / `_build_stones_for_create` (done Feb 18, 2026).
- [x] Pin `jobs_helpers` behaviour with pytest (done — 15 tests, includes a direct repro of the cancel-leak class of bug as `test_payable_amount_excludes_cancelled_stones`).
- [ ] **Extract `_components/StoneEditDialog.tsx`** (~400 LOC) — the stone-details modal is now visually identical between `jobs/page.tsx` and `stones/page.tsx`. Risky: 10+ pieces of state to plumb (modal open, viewing stone, edit mode, structured findings, color-stability + mounted toggles, save handler, unsaved-changes guard, cert-scan upload). Recommend tackling in a dedicated session with the testing agent on standby.
- [ ] Extract `_components/CreateJobDialog.tsx` from `jobs/page.tsx`. ✅ done earlier — lives at `jobs/_components/CreateJobDialog.tsx` (530 lines).
- [x] **Extract `_hooks/useJobStones.ts` from `jobs/page.tsx`.** ✅ done Feb 25 2026 — Create Job dialog's stone list (UIDs + add/remove/change + parcel side-effect + form predicates) now lives in `jobs/_hooks/useJobStones.ts`. Build verified, lint clean.
- [ ] Extract `_components/ShipmentDetailDialog.tsx` from `shipments/page.tsx`.
- [ ] More PRD bookkeeping: as CHANGELOG grows past ~1500 lines we may want to archive the older `Iter N` entries into `CHANGELOG.archive.md` or by quarter.

### Other backlog
- [ ] Two-Factor Authentication setup flow for customers (admins already have it).
- [ ] Bulk job import (CSV).
- [ ] Reporting / analytics dashboard.
- [ ] Mobile responsive improvements.

---

## Done — recent

See `CHANGELOG.md` for the full chronological log. Highlights of the last few sessions:

- **Feb 18, 2026 (round 6)** — Active-stones helper refactor (`backend/jobs_helpers.py`); bookkeeping (PRD/CHANGELOG/ROADMAP split).
- **Feb 18, 2026 (round 5)** — Bug: cancelled stones leaked back into job totals via fee-update / hard-delete / Tranzila payment paths.
- **Feb 18, 2026 (round 4)** — Bug: stuck on "Loading…" when deep-linking into the dashboard (auth-gate restored in `dashboard/layout.tsx`).
- **Feb 18, 2026 (round 3)** — Bug: cancelled stones still rendered on the job (root cause was `StoneResponse` missing the `cancelled` field).
- **Feb 18, 2026 (rounds 1-2)** — Stone editing modal UX overhaul: stone-type-aware dropdown scoping, clearable selects, compact one-row header, compact bottom upload button, parity between stones page + jobs page; bug fix where clearing every verbal field didn't persist.
