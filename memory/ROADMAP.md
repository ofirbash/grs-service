# Bashari Lab-Direct — Roadmap

> Tracking what's next. For history of what's been done, see `CHANGELOG.md`. For the product spec, see `PRD.md`.

---

## P0 — Critical

_None currently._

## P1 — High Priority

- [ ] **Refactor: consolidate duplicate dialogs.** User-flagged Feb 25 2026 — multiple copies of the same UI cause feature drift (e.g. parcels worked on /dashboard/jobs but not /dashboard/stones). Sequence:
  1. `<StoneVerbalSection>` ✅ done (used by both stone modals)
  2. `<StoneEditDialog>` — full stone modal extraction. Currently jobs/page.tsx and stones/page.tsx each have their own ~600 and ~280-line inline copy. Wraps `<StoneVerbalSection>` + the compact info strip + CS/Mounted toggles + Cert scan upload + cancel button + footer.
  3. `<JobDetailDialog>` — currently inlined in jobs/page.tsx and re-implemented inside shipments/page.tsx. Should accept a `mode: 'admin' | 'shipment-view'` prop to handle the two contexts.
  4. `<ShipmentDetailDialog>` — already mostly extracted but lives inside the 850-line shipments/page.tsx. Move to its own file.
- [ ] **Bulk notify clients per shipment.** Admin action: pick a shipment → send the same notification (intake / dispatched / delivered) to every client whose jobs are contained in it.
- [ ] **"Same as previous row / pre-fill stone type" in Create Job dialog.** Faster bulk stone entry: when the user adds row N+1, pre-fill stone type from row N (and maybe shape too).
- [ ] **Domain verification for Resend email** (production).
- [ ] **Legacy data migration from CSV/database** (if/when source data is available).
- [ ] **Printable shipment document** (similar to job memo).

## P2 — Medium Priority

- [ ] **Finalise prices** (books, layouts).
- [ ] **Mobile responsive audit** across all pages.
- [x] **Session-expired toast on `/login`** when redirected from a protected route (`?reason=expired` query param). _Done Feb 24, 2026 — amber banner on /login renders when Axios interceptor bounces an idle session. See CHANGELOG._
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
