# Bashari Lab-Direct — Roadmap

> Tracking what's next. For history of what's been done, see `CHANGELOG.md`. For the product spec, see `PRD.md`.

---

## P0 — Critical

_None currently._

## P1 — High Priority

- [ ] **Bulk notify clients per shipment.** Admin action: pick a shipment → send the same notification (intake / dispatched / delivered) to every client whose jobs are contained in it. One click instead of N. Backend endpoint can probably reuse existing per-job notifications loop; frontend needs a dialog with a per-client checkbox grid + result summary.
- [ ] **"Same as previous row / pre-fill stone type" in Create Job dialog.** Faster bulk stone entry: when the user adds row N+1, pre-fill stone type from row N (and maybe shape too) with an obvious "different" override. Possibly extend with a "duplicate row" affordance.
- [ ] **Domain verification for Resend email** (production). The free tier sends from `onboarding@resend.dev` and is restricted to the account owner. Verify a sending domain at resend.com/domains so production emails reach real clients.
- [ ] **Legacy data migration from CSV/database** (if/when source data is available).
- [ ] **Printable shipment document** (similar to job memo) — covers the lifecycle handover doc for jewellers/couriers.

## P2 — Medium Priority

- [ ] **Finalise prices** (books, layouts).
- [ ] **Mobile responsive audit** across all pages.
- [ ] **Session-expired toast** on `/login` when redirected from a protected route (`?reason=expired` query param). Small UX win to explain to users why they were bounced.
- [ ] **Notify client on stone cancellation** (email + SMS) for traceability.
- [ ] **In-job "Cancelled stones" panel** — admins can see cancelled stones inline and uncancel without leaving the job dialog.

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
- [ ] Extract `_components/CreateJobDialog.tsx` from `jobs/page.tsx`.
- [ ] Extract `_hooks/useJobStones.ts` from `jobs/page.tsx`.
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
