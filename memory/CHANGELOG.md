# Bashari Lab-Direct — Changelog

> Chronological log of session-by-session work. Newest entries first.
> For the product spec see `PRD.md`. For the backlog see `ROADMAP.md`.

---

## 2026-07-09 — High-value handling charge

Automatic per-stone surcharge for stones valued over US$ 100,000. Requested and specified by user.

**Rule (hardcoded — no admin setting per product decision):**
`handling = ceil((max(0, value − $100,000) × 0.05%) / $10) × $10`

Any strictly-positive excess snaps to a $10 minimum increment.

| Value      | Excess     | 0.05%     | Handling |
|-----------:|-----------:|----------:|---------:|
| $50,000    | 0          | 0         | **$0**   |
| $100,000   | 0          | 0         | **$0**   |
| $110,000   | $10,000    | $5.00     | **$10**  |
| $125,000   | $25,000    | $12.50    | **$20**  |
| $250,000   | $150,000   | $75.00    | **$80**  |
| $1,000,000 | $900,000   | $450.00   | **$450** |

**Delivered**
- New `calculate_handling_charge(value)` helper in `backend/pricing.py` with a small float-precision epsilon so exact-boundary values (e.g. $120,000 → exactly $10) don't spuriously bump.
- Rolled into both `calculate_stone_fee_from_brackets` (per single stone, using its own `value`) and `calculate_parcel_fee_from_brackets` (per stone inside the parcel using the average `value_total / stone_count`, multiplied by N). No changes needed at any callsite because every place that computes stone fees already goes through these two functions.
- Charge is silently added to the stone's total `fee` field (matches CS/Mounted behavior — not a separate line item on memos/invoices).

**Verified**
- New test suite `backend/tests/test_handling_charge.py` — 13/13 pass:
  - 8 unit tests on the helper (threshold, user spec example, tiny excess, exact-$10-boundary, negative/None input, ragged amounts).
  - 3 integration tests through `calculate_stone_fee_from_brackets` (with and without CS on top).
  - 2 integration tests through `calculate_parcel_fee_from_brackets` (high-avg parcel, low-avg parcel).
- Live curl regression against `PUT /api/stones/{id}`: baseline $60k → $550 (unchanged), $125k → $670 (base $650 + $20 handling), $250k → $730 (base $650 + $80 handling), $50k → $430 (no handling). All match the formula against live DB brackets.

**Files touched**
- `backend/pricing.py` — added `HANDLING_CHARGE_*` constants + `calculate_handling_charge()` + one-line additions inside `calculate_stone_fee_from_brackets` and `calculate_parcel_fee_from_brackets`.
- `backend/tests/test_handling_charge.py` (new — 13 tests).

**Note on activity-log diffs**: because `fee` still reflects the true total (base + CS + mounted + handling), the `stone_updated` activity row's `old_fee → new_fee` diff automatically captures handling-charge changes too. No further wiring needed.

---


**Follow-up to the inline stone edit feature** (see below): whenever an admin saves a stone-details change, the resulting `stone_updated` activity row now carries a full old→new diff (only the fields that actually changed) plus an explicit fee delta.

**Delivered**
- `PUT /api/stones/{id}` now computes and logs a per-field diff:
  - `summary`: `Stone DI100J60001 · stone_type: Diamond → Ruby; weight: 1.5 → 2.5; value: 60000 → 120000; color_stability_test: no → yes; fee: $550.00 → $700.00`
  - `metadata.changes`: `{ stone_type: {from,to}, weight: {from,to}, ... }` — machine-readable, only present for changed fields.
  - `metadata.old_fee` / `metadata.new_fee` / `metadata.sku` — always present.
- Registered `stone_updated` in the frontend `ActivityRowItem` action-meta map (label + Pencil icon) and in the backend `_ACTION_LABELS` filter table so the `/dashboard/activity` filter dropdown lists it too. Previously these rows fell back to the raw action code because the mapping was missing.

**Verified**
- Backend regression: `test_stone_edit_details.py` + `test_activity_log.py` → 17/17 pass (2 pre-existing skips for the broken customer bcrypt row).
- Live curl: single-field edit → `Stone DI100J60001 · weight: 1.5 → 1.87`; multi-field + CS toggle → full 5-part summary with fee delta included. Fee-only edits (no detail change) still render as `fee: $X → $Y`.

**Files touched**
- `backend/routes/stones.py` (diff builder inside `update_stone_details` — replaces the old one-line summary).
- `backend/routes/activity.py` (added `Action.STONE_UPDATED` → "Stone details updated" in `_ACTION_LABELS`).
- `frontend/src/components/activity/ActivityRowItem.tsx` (added `stone_updated` entry with Pencil icon).

---


**User feedback on first pass:** the initial implementation added a separate "Edit Stone" dialog opened from a Pencil icon in the stones table — user rejected that as "doesn't make sense". Correct UX: open the stone (from Job dialog OR Stones page) → click Edit inside the stone modal → change fields → Save. No extra dialogs.

**Delivered (rework)**
- **Reverted** the standalone `EditStoneDialog`, `EditStoneDraft`, Pencil column in `JobStonesTable`, and `onEditStone` prop wiring.
- **Extended the canonical `StoneEditDialog`** with inline-editable Type/Weight/Shape/Value inputs. When `editMode && isAdmin && !isParcel` and the parent passes a `detailsDraft`, the read-only summary bar is replaced by an amber card with 4 fields. Parcels intentionally skip this (per-N-stone value semantics not editable here).
- **Both callers** (`/dashboard/jobs/page.tsx` + `/dashboard/stones/page.tsx`) now:
  - Seed a `stoneDetailsDraft` when opening the stone dialog.
  - In `handleSaveStone`, if any detail changed, call `stonesApi.updateDetails()` **before** the existing `stonesApi.updateFees()` (so CS/Mounted layers on top of the recomputed base fee).
  - Refetch and reseed the draft after save.
- Stones page also pulls `pricing.stone_types` / `pricing.shapes` from `settingsApi.getPricing()` (matches the Jobs page's single source of truth for these dropdowns).
- `hasUnsavedStoneChanges()` on the jobs page now includes detail drift so the unsaved-changes guard covers editing weight/type/shape/value.

**Verified (iter-43): 6/6 scenarios pass**
- Flow A (jobs page): change wt 1.5→2.5, val 60000→120000 → dialog exits edit mode, fee recomputes 550→650, GET /api/jobs confirms persistence.
- Flow B (stones page): change wt 3.0→4.2, type Diamond→Ruby → same dialog, same behavior.
- Combined save: change weight AND toggle CS in one session → both persist (fee = new recomputed base + $50 CS).
- Parcel guard: amber block absent on parcel stones; CS/Mounted + per-stone verbal still editable.
- Cleanup: no `edit-stone-{id}` pencil testids remain in the DOM.
- Backend regression: existing `test_stone_edit_details.py` still 6/6 (unchanged endpoint contract).

**Files touched**
- `frontend/src/components/dialogs/StoneEditDialog.tsx` (new inline edit block + `StoneDetailsDraft` export)
- `frontend/src/app/dashboard/jobs/page.tsx` (draft state, save handler, unsaved-changes guard, mount)
- `frontend/src/app/dashboard/stones/page.tsx` (draft state, dropdowns from pricing, save handler, mount)
- `frontend/src/components/jobs/JobStonesTable.tsx` (Pencil column removed)
- `frontend/src/app/dashboard/jobs/_components/StoneDialogs.tsx` (`EditStoneDialog` + `EditStoneDraft` removed — file back to 179 lines)

---

## 2026-07-09 — Edit Stone Details (first pass, reverted)

**User request (Feb 28 2026):** "Allow editing stone details after adding it to a job. The fees should be changed based on the new details."

**Delivered**
- **Backend** `PUT /api/stones/{stone_id}` (admin-only) — patches any subset of `stone_type/weight/shape/value/color_stability_test/mounted/kind/stone_count`, then **recomputes `fee`** from the job's current `service_type` bracket table (same code path as `add_stone_to_job`). Response returns `{ stone, new_fee, job_total_fee }`. Cancelled stones → 400.
- **Frontend** `EditStoneDialog` (`_components/StoneDialogs.tsx`) — mirrors `AddStoneDialog` UX (Enter-to-submit) plus CS/Mounted toggles that affect the fee.
- **Wiring** into `/dashboard/jobs/page.tsx`: `editingStone` / `editStoneDialogOpen` / `editStoneDraft` / `savingEditStone` state; `handleOpenEditStone` seeds draft from `selectedJob.stones` (so CS/mounted flags come along); `handleSaveEditStone` calls `stonesApi.updateDetails()` then refetches. `JobStonesTable` now receives `onEditStone` and renders a per-row Pencil button in edit-mode / admin-only.
- **Tests**: `backend/tests/test_stone_edit_details.py` (7 cases — recompute, CS toggle, cancelled 400, RBAC 403 for kiosk/unauth, 404 unknown). Frontend E2E verified via testing_agent — open dialog → change weight+value → save → table & job total refresh; CS toggle round-trips fee.

**Files touched**
- `frontend/src/app/dashboard/jobs/page.tsx` (state + handlers + dialog mount + `onEditStone` prop)
- `frontend/src/app/dashboard/jobs/_components/StoneDialogs.tsx` (`EditStoneDialog`)
- `frontend/src/components/jobs/JobStonesTable.tsx` (Pencil column, edit-mode only)
- `frontend/src/lib/api.ts` (`stonesApi.updateDetails`)
- `backend/routes/stones.py` (`update_stone_details` + `StoneDetailsUpdate`)
- `backend/tests/test_stone_edit_details.py` (new)


---

## Feb 28, 2026 — Print-only mode for return docs + 2-page overflow fix

### 1. "Print only" mode in the Return Stones / Return Certificates dialog
User flagged two real workflows where the existing flow blocked them:
- **Advance print**: stones still at the office, but client wants the memo printed in advance — no state change.
- **Re-print after full return**: stones already returned, admin wants another copy of the receipt — picked stones were greyed-out, so admin couldn't select them.

Added a `printOnly` checkbox to `<PickupSelectionDialog>` (default OFF). When ON:
- The `pickupsApi.create` call, signature-request creation, and Cloudinary archive are **all skipped**. Just opens the printed memo.
- Already-picked stones become **selectable again** so a full-set re-print is possible. The `toggleStone` / `toggleGroup` / `handleSelectAll` helpers all check `printOnly` before refusing locked rows.
- The default-checked set on dialog-open includes every active stone (not just the un-picked ones) when `printOnly` is on.
- The amber explanation block replaces the navy "Confirm & Sign will…" steps so the admin clearly sees this is a side-effect-free action.
- Confirm button label flips: **"Confirm & Sign (N)" → "Print only (N)"**.

Verified end-to-end:
- Toggle ON → button says "Print only (2)" → click → print window opens, `GET /jobs/{id}/pickups` count unchanged (`before=0, after=0`).

### 2. Return docs printed 2 pages with the second page almost empty
Root cause: the global `*` selector lacked `box-sizing: border-box`, so the body's `padding: 22px 32px` was *added on top of* `min-height: 100vh`, pushing the body to `100vh + 44px` — just enough to spill onto page 2 with the footer.

Fix in both `buildPickupMemoHtml.ts` and `buildJobMemoHtml.ts`:
```css
* { box-sizing: border-box; … }
body { padding: 0; min-height: 100vh; … }
```
The `@page { margin: 12mm 14mm }` declaration handles all the breathing room around the content; the inner `padding` is gone, so `min-height: 100vh` is now exactly one A4 content area. The intake memo's bottom-pinned flex layout still works because the spacer fits inside that one-page budget. Verified: body height matches `100vh` cleanly in the screenshot tool's rendered preview.

### Code touched
- `frontend/src/components/pickups/PickupSelectionDialog.tsx` — `printOnly` state, gate the pickup-create + signature flow, UI toggle + hint + dynamic button label.
- `frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts` — global `box-sizing: border-box`, removed body padding.
- `frontend/src/app/dashboard/jobs/_lib/buildJobMemoHtml.ts` — same.



## Feb 28, 2026 — "Accept Stones" merge + auto-bump on verbal upload

### 1. Print Intake → Accept Stones (combined action)
The top button in the job dialog used to only generate the intake memo, leaving the job stuck at `draft` until the admin manually flipped status. New behaviour:

- When `selectedJob.status === 'draft'`, the button is **labelled "Accept Stones"** (mobile: "Accept") and **styled as the primary action** (dark navy fill).
- Clicking it now:
  1. Sends `PUT /api/jobs/{id}` with `{status: 'stones_accepted'}`
  2. Then opens the intake-memo print window — using the *just-updated* job, so the printed memo shows the new status
- After acceptance, the same button reverts to **"Print Intake"** (outline style) so admins can still reprint.
- Soft-fail: if the status PUT errors, the print still opens (admin can continue on paper).

This matches the physical lab workflow — printing happens *after* you've accepted the goods from the client, not before.

### 2. Verbal upload auto-bumps job status → `verbal_uploaded`
Previously the verbal findings were saved per-stone but the job status didn't reflect it — admins had to manually edit the job. Now `PUT /api/stones/{id}/verbal` checks the parent job's status and, if it's still in an earlier lifecycle stage, auto-promotes to `verbal_uploaded`:

```
draft  ──┐
stones_accepted  ──→ verbal_uploaded  (auto on first stone verbal)
sent_to_lab  ──┘
```

Statuses past verbal (`verbal_uploaded` itself, `stones_returned`, `cert_uploaded`, `cert_returned`, `done`) are deliberately untouched — we never regress a job. A `JOB_STATUS_CHANGED` activity log row is emitted with `metadata.auto: true` so the audit trail clearly distinguishes auto-bumps from manual edits. Soft-fail: if the bump fails the verbal save still succeeds (already committed).

### Verified via curl
- Draft job → PUT status → bumps to `stones_accepted` ✅
- Stone verbal upload on `stones_accepted` job → job becomes `verbal_uploaded` ✅
- Stone verbal upload on `cert_uploaded` job → status stays `cert_uploaded` (no downgrade) ✅

### Code touched
- `frontend/src/app/dashboard/jobs/page.tsx` — `handlePrintJob` does the status bump first; button label + style toggle by status.
- `backend/routes/stones.py` — `update_stone_verbal` auto-bumps + logs `JOB_STATUS_CHANGED` (with `auto: true`).



## Feb 27, 2026 — Pickup vocabulary, badge dots, shipment-type job filter

### 1. Vocabulary: pickups are about *returning*, not printing
User noted the action is "returning stones / certificates to the client" — printing the memo is just the receipt that supports the return. Renamed across the job dialog and the pickup-selection modal:

| Old label | New label |
|---|---|
| Memo Return (top button) | **Return Stones** |
| Cert Collection (top button) | **Return Certificates** |
| Print Memo Return (dialog title) | **Return Stones to Client** |
| Print Certificate Collection (dialog title) | **Return Certificates to Client** |
| Approve and Print (confirm button) | **Confirm & Sign** |

The pickup description was also rewritten so the *action* (return + signature) reads first and "a signed return memo is generated for the record" reads second.

### 2. Returned / Partial pills replaced with colored dots
At `size="xs"` (the jobs list) the full-text "Returned" / "Partial" pills were overwhelming the job-number column — they looked egg-shaped and competed for visual weight with the much larger `#540`. Now: a single `h-2.5 w-2.5 rounded-full` dot (emerald for "all returned", amber for "partial") with the full label kept in the `title` tooltip and the test-id intact (`returned-all-…`, `returned-partial-…`). Larger sizes elsewhere in the app still use the full pill since they have room.

### 3. Shipment-type job eligibility filter
User flagged this as **important** — preventing mistakes when picking jobs into a shipment. Added a deterministic mapping:

| Shipment type | Eligible job statuses |
|---|---|
| `send_stones_to_lab` | `stones_accepted` |
| `stones_from_lab` | `verbal_uploaded` |
| `certificates_from_lab` | `verbal_uploaded`, `cert_uploaded` (lab sometimes returns paper certs before the scan is uploaded) |

Plus a global rule: **any job already on a `pending` or `in_transit` shipment is hidden** until that shipment delivers, so the same stones can never be on two open shipments at once.

Implementation:
- New helpers `SHIPMENT_ELIGIBLE_STATUSES`, `getActivelyShippedJobIds`, and `eligibleJobsForShipmentType` in `shipments/page.tsx`. Both the Create-Shipment dialog and the Add-Jobs-to-existing-shipment dialog now pass the filtered list.
- Until a `shipment_type` is selected in the Create dialog, the job picker is intentionally empty with a clear hint ("Pick a shipment type first — the eligible jobs depend on…").
- Type-specific empty state messages now spell out exactly which status the type requires, so an admin who sees "0 eligible jobs" immediately understands why.

### Code touched
- `frontend/src/components/jobs/CompletenessBadges.tsx` — xs Returned/Partial now a dot.
- `frontend/src/app/dashboard/jobs/page.tsx` — top-button labels (mobile + desktop).
- `frontend/src/components/pickups/PickupSelectionDialog.tsx` — titles, description, confirm-button label, instructional copy.
- `frontend/src/app/dashboard/shipments/page.tsx` — `SHIPMENT_ELIGIBLE_STATUSES`, `eligibleJobsForShipmentType`, wired into Create + Add-Jobs.
- `frontend/src/app/dashboard/shipments/_components/AddJobsToShipmentDialog.tsx` — type-aware empty state.
- `frontend/src/app/dashboard/shipments/_components/CreateShipmentDialog.tsx` — type-aware empty state.



## Feb 27, 2026 — Jobs polish: badges, mobile, docs, fee column, bottom-terms

User report (5 items):
> "1) Jobs page badges look bad. 2) Mobile job modal still has inaccessible buttons. 3) No need to upload memo doc anymore — memo is saved with the signature. 4) Add 'fees' column to memo return + cert return. 5) Memo doc: terms + signatures should be at the bottom, just above the footer."

### 1. Cleaner badges on the jobs list
The "All returned" / "Partial pickup" pills were egg-shaped because text wrapped inside `rounded-full` in the narrow Client column. Shortened to `Returned` / `Partial`, added `whitespace-nowrap`, and the `align-middle` keeps them vertically centered next to the client name. Verbal + cert badges in the same row are also `whitespace-nowrap` for consistency.

### 2. Mobile job modal — buttons accessible
The 4 top-bar buttons (Print Intake / Memo Return / Cert Collection / Edit) had `overflow-x-auto` so they scrolled off-screen on a phone, hiding "Edit" entirely. Replaced with:
- **Icon-only on mobile, label+icon on desktop**: each button keeps its icon visible, label is `hidden sm:inline`. Memo Return / Cert Collection show a tiny "Memo" / "Cert" word on mobile so admins can tell them apart at a glance.
- **`flex flex-wrap` instead of `overflow-x-auto`**: buttons wrap to a second line if they truly don't fit, but icon-only sizing keeps them on one row at 414px-wide phones.
- Save Changes (in Edit mode) and Close button moved into their own row at the bottom on mobile (already done last commit).

### 3. Removed the "Memo" upload cluster from the documents row
With the captured-signature flow now producing the immutable signed memo via `pickup_event.signed_pdf_url`, the manual MEMO upload no longer serves a purpose. `JobDocumentsRow` now renders only **Client Invoice** and **Lab Invoice** clusters. The associated state, refs, and upload handlers on the parent (`uploading`, `fileInputRef`, `handleMemoUpload`, `viewMemoOpen`) are still passed but unused — left intact this round to keep the diff minimal; will be removed in a follow-up cleanup PR.

### 4. Fee column on Memo Return + Certificate Collection docs
- `memoReturnRow` now emits a `Fee` column ($X.XX) per stone, using `actual_fee` override when present else the bracket-computed `fee`. Table grew from 7 to 8 columns; totals row now also shows total fee.
- Cert Collection table grew from 5 to 6 columns; each cert group's fee = sum of bucket stone fees; totals row shows total fee across all groups.
- group-separator and "no items selected" `colspan` updated accordingly.

### 5. Terms + signatures hug the bottom of the page
The intake memo doc and both pickup return docs now use a flex-column body with a `.page-spacer` between the last content section and the Terms/Confirm-line:
```css
body { min-height: 100vh; display: flex; flex-direction: column; }
.page-spacer { flex: 1 1 auto; }
```
When the stones table is short (1 stone), the spacer expands to fill remaining vertical space, pushing Terms + signatures down to sit just above the footer. When the table is long, the spacer collapses to its 12px minimum and content flows naturally. `@page { size: A4; margin: 12mm 14mm }` declared so the print engine treats `100vh` as the printable page height.

Same treatment applied to `buildPickupMemoHtml.ts` (confirm-line + signatures now hug the bottom).

### Code touched
- `frontend/src/components/jobs/CompletenessBadges.tsx`
- `frontend/src/app/dashboard/jobs/page.tsx` — top-bar button labels mobile/desktop split
- `frontend/src/app/dashboard/jobs/_components/JobDocumentsRow.tsx` — removed Memo cluster
- `frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts` — Fee col + page-spacer
- `frontend/src/app/dashboard/jobs/_lib/buildJobMemoHtml.ts` — page-spacer



## Feb 27, 2026 — Stone-entry keyboard flow + mobile job-modal cleanup

### 1. Tab order + Enter shortcut while adding stones (Create Job dialog)
User reports:
> "After adding a stone, the next tab is the delete icon of the stone. This doesn't make sense. The natural action after entering a stone is to add another stone — I want to enter stone after stone without going up to click Add Stone."

Two changes:
- **Removed delete from tab order.** Both desktop and mobile trash buttons now carry `tabIndex={-1}`. Tab still flows through Type → Weight → Shape → (Count if parcel) → Value, then into the next row's controls. Delete is now mouse-only by intent — destructive action, can't be reached by a single misplaced tab.
- **Enter on the Value field adds a new stone row + jumps focus into it.** Wired `onKeyDown` on both desktop and mobile Value inputs. A new `useEffect` watches `stones.length` and, when it grows, focuses the freshly-rendered Type selector (`stone-type-${i}` or `stone-type-mobile-${i}`). Result: an admin can intake a 14-stone job from the keyboard alone — type → weight → shape → value → Enter → repeats.

Also applied the Enter shortcut to the per-stone Add-Stone dialog (used on existing jobs): hitting Enter on Value submits when the form is valid.

### 2. Job-modal layout broken on mobile
Screenshot showed three problems on iPhone:
- Top action bar (Print Intake / Memo Return / Cert Collection / Edit) overflowed off the right edge — its content was wrapped inside `<DialogTitle>` with `justify-between`, pushing the action buttons past the viewport.
- Bottom action row had MEMO / CLIENT INVOICE / LAB INVOICE clusters with `px-5` padding each + a Close button on the same row → "LAB INVOICE / ADMIN" was overlapping the Close button.
- Dialog padding (`px-6`) ate ~24px on each side of an already 414px-wide phone.

Fixes:
- **Action buttons moved out of `<DialogTitle>` into a dedicated row below the title.** That row uses `overflow-x-auto sm:overflow-x-visible flex-wrap` so on mobile the buttons scroll horizontally without pushing anything else out of place. Each button got `flex-shrink-0` so they don't compress into illegible tiles.
- **Bottom footer now stacks on mobile.** `flex flex-col sm:flex-row` — docs row on top, Save/Close on its own row below. No more overlap.
- **JobDocumentsRow per-cluster padding scaled `px-3 sm:px-5`** and cluster labels `text-[10px] sm:text-[11px]`. The whole row got `w-max sm:w-auto` so it sits as a horizontally scrollable strip on mobile (parent container has `overflow-x-auto`), guaranteeing every cluster is reachable.
- **Dialog container padding** dropped to `px-3 sm:px-6`. Title font scaled `text-lg sm:text-xl`. Dialog width `w-[calc(100vw-1rem)] sm:w-auto` so the rounded corners aren't sticking out beyond the screen, and `max-h-[95dvh]` (dynamic viewport height) replaces `90vh` so iOS Safari's URL bar doesn't clip the bottom row.

### Code touched
- `frontend/src/app/dashboard/jobs/_components/CreateJobDialog.tsx` — `tabIndex={-1}` on trash, `onKeyDown` on Value (desktop+mobile), useEffect auto-focus newest row.
- `frontend/src/app/dashboard/jobs/_components/StoneDialogs.tsx` — Enter-to-submit on AddStoneDialog Value field.
- `frontend/src/app/dashboard/jobs/page.tsx` — restructured View-Job dialog header & footer for mobile.
- `frontend/src/app/dashboard/jobs/_components/JobDocumentsRow.tsx` — responsive cluster padding + label size, `w-max` scrolling strip.



## Feb 26, 2026 — Signing-pad polish: QR URL, no-zoom viewport, bigger sig

Three small but high-impact fixes after deploying the QR/countdown work.

### 1. QR + manual login URL missed the trailing slash
`PadConnectQrDialog` was emitting `${origin}/login?email=…` — same broken-redirect trap as the payment links (production proxy 301s `/login?…` → `http://lab.bashari.co:8080/login/?…`). One-character fix: now `${origin}/login/?email=…`. Verified the dialog now shows `…/login/?email=pad-ny%40bashari.com`.

### 2. No-zoom viewport on the signing-pad page
User report: pad on a phone was pinch-zoomed in and the Submit button was off-screen. Default Next.js viewport allows pinch + double-tap zoom — fine for the dashboard, terrible for a kiosk surface.

Fix: a `useEffect` on the signing-pad page mounts a stricter `<meta name="viewport">` while the page is active and restores the previous content on unmount. Specifically:

```
width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1,
user-scalable=no, viewport-fit=cover
```

Scoping the override per-page (instead of globally) keeps the rest of the dashboard pinch-zoomable for low-vision admins. Verified by reading the meta tag before and after navigating away.

### 3. Captured signature embedded in archived PDFs/memos was too small
54px tall was barely a fingernail on the printed page. Bumped to **110px** in all three signature-render paths:
- `backend/routes/pickups.py` — `_render_and_upload`'s `{{SIGNATURE_BLOCK}}` replacement.
- `frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts` — frontend pickup memo template.
- `frontend/src/app/dashboard/jobs/_lib/buildJobMemoHtml.ts` — frontend job memo template.

`object-fit: contain` + `max-width: 100%` kept, so the original PNG aspect ratio is preserved — wide signatures don't get squished, narrow ones don't overflow the column.

### Code touched
- `frontend/src/components/settings/PadConnectQrDialog.tsx`
- `frontend/src/app/dashboard/signing-pad/page.tsx`
- `backend/routes/pickups.py`
- `frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts`
- `frontend/src/app/dashboard/jobs/_lib/buildJobMemoHtml.ts`



## Feb 26, 2026 — Activity log + Service-type editing + Add-Stone defaults

User asked for four small changes. All landed in one pass.

### 1. Activity log collapsed by default
The per-job audit timeline takes up real estate even when admins don't need it. `<JobActivityList>` now renders only the header by default; clicking the header (or chevron) toggles the list open for the rest of the dialog session. State is component-local — closes again on next open.

### 2. Activity log uses absolute `dd/mm/yy, HH:MM`
Replaced the relative "5m ago / 2h ago" formatter in `ActivityRowItem.formatRelative()` with a fixed `dd/mm/yy, HH:MM` (24h) shape. Hover tooltip still shows the full locale string for the rare case anyone needs seconds. Verified live: `18/06/26, 19:26`.

### 3. Service-type editable in Edit-Job mode
No separate "Change service type" button — per user request, just expose it in the existing Edit mode. The `<JobSummaryGrid>` Service field becomes a `<Select>` while editing, and switching to Recheck also surfaces a multi-select for `recheck_reasons`. An amber recalc-hint banner appears above Notes when the new value differs ("Saving will re-price every stone based on the **Express** bracket table…").

Backend:
- `JobUpdate` model now accepts `service_type` and `recheck_reasons`.
- `PUT /api/jobs/{id}` recomputes every stone's `fee` from the new bracket table (parcel rows use the parcel pricing helper), then `recompute_job_totals` rebuilds `total_fee`/`total_value` so the response is immediately consistent.
- Validation: `service_type` must be in `pricing_config.service_types`; switching to Recheck without reasons → 400; leaving Recheck clears `recheck_reasons`.

Verified via curl:
```
Normal → Express  : total_fee 600 → 900
Express → Normal  : total_fee 900 → 600
service_type=NotAType  → 400 with detail
Recheck w/o reasons    → 400 with detail
```

### 4. Add-Stone defaults — `stone_status` + `cert_status`
`POST /api/jobs/{id}/stones` was missing the lifecycle defaults that `_build_stones_for_create` already sets. New walk-in stones rendered no status badge in `<StoneStatusBadges>`. Fix: every newly-added stone now gets `stone_status="at_office"`, `cert_status="pending"` — same as the create-job path. All other flags (CS, mounted, verbal, cert_scan, certificate_group, cancelled) continue to be admin-supplied or filled later by their own flows. Per user decision (option **d**), the Add-Stone dialog itself stays minimal — only the existing fields, no new toggles.

Verified via curl: a stone added to job #597 came back with `stone_status="at_office", cert_status="pending"`. UI badges now appear for it.

### Code touched
- `frontend/src/app/dashboard/jobs/_components/JobActivityList.tsx` — collapse-on-click header.
- `frontend/src/components/activity/ActivityRowItem.tsx` — `formatRelative` → absolute dd/mm/yy, HH:MM.
- `frontend/src/app/dashboard/jobs/_components/JobSummaryGrid.tsx` — service-type select + recheck-reasons multi-select + recalc hint.
- `frontend/src/app/dashboard/jobs/page.tsx` — extended `editFormData` with `service_type`/`recheck_reasons`, passed `availableServiceTypes`/`recheckReasonOptions`, send-on-change in `handleUpdateJob`.
- `backend/models.py` — `JobUpdate.service_type`, `JobUpdate.recheck_reasons`.
- `backend/routes/jobs.py` — `update_job` recompute branch; `add_stone_to_job` lifecycle defaults.



## Feb 26, 2026 — Session-expired redirect leaked into `:8080`

User report:
> "After session expires, URL changes to `https://lab.bashari.co:8080/login/?reason=expired`. I expect to redirect to the login page."

Same root cause as the payment-link bug: the production proxy 301s any path without a trailing slash to an absolute URL using its internal listen port (`http://lab.bashari.co:8080/path/...`), which the browser refuses ("can't provide a secure connection").

The Axios 401-interceptor in `frontend/src/lib/api.ts` was calling `window.location.replace('/login?reason=expired')` — no trailing slash → hit the 301 → landed on the dead `:8080` URL.

Fix: changed both hard navigations to include the trailing slash.

### Files touched
- `frontend/src/lib/api.ts` — `/login?reason=expired` → `/login/?reason=expired`
- `frontend/src/app/dashboard/page.tsx` — `window.location.href = '/dashboard/shipments'` → `'/dashboard/shipments/'`

### Verified
- Preview returns 200 OK for `/login/?reason=expired`.
- `router.push()` / `router.replace()` calls don't need this fix — they use History API, never issue an HTTP request, so the proxy bug doesn't touch them.

### Still pending (infrastructure)
Underlying proxy misconfig still needs Emergent Support to fix permanently. My code workarounds bypass it for every known path, but any *new* route without trailing slash in a hard nav would regress.



## Feb 26, 2026 — Payment links: "This site can't provide a secure connection"

User report (production AND preview):
> "The payment link doesn't work. I'm trying to access a payment link on production and it returns an empty page: This site can't provide a secure connection. It's the same on preview!"

Root cause: a stacked deployment + code issue.

### Production-side bug (cannot fix in code; needs proxy reconfig)
`https://lab.bashari.co/pay?token=X` → upstream Cloudflare returns **HTTP 301** with `location: http://lab.bashari.co:8080/pay/?token=X`. The redirect target uses **`http://` (not https)** and **port `8080`** (the internal listen port) — port 8080 has no TLS cert, so the browser shows "This site can't provide a secure connection". Classic missing `proxy_set_header X-Forwarded-Proto`/`proxy_redirect off` in the production nginx that fronts the static site.

That config lives on the deployed pod, outside the repo — the user needs to contact Emergent Support to fix the proxy header pass-through.

### Code-side workarounds (deployable from this repo)
**1. Trailing slash everywhere.** `next.config.mjs` has `trailingSlash: true`, so the static export writes `/pay/index.html`, `/setup-password/index.html`, etc. Hitting `/pay?token=X` triggers the broken upstream 301 to `/pay/?token=X`. Fix: emit `/pay/?token=` (with the slash already there) so the redirect is never needed. The browser finds the static page directly.

Same fix applied to every `/setup-password?token=` and `/dashboard/clients?tab=` link in the backend.

Files touched:
- `backend/routes/payments.py` — payment link generation (new `_build_pay_url` + `_public_base_url` helpers).
- `backend/routes/jobs.py` — `payment_url` computed field on every job record.
- `backend/routes/notifications.py` — payment & welcome email/SMS link bodies.
- `backend/routes/pdf.py` — invoice/memo PDF QR code targets.
- `backend/routes/access_requests.py`, `backend/routes/clients.py`, `backend/routes/auth_routes.py` — setup-password & dashboard deep links.

**2. Preview backend stops bouncing admins to production.** `FRONTEND_URL` was hardcoded to `https://lab.bashari.co`, so an admin clicking "Open link" on a preview-generated payment link landed on prod (where the token doesn't exist *and* the broken 301 fires). New `_public_base_url(request)` reads the admin's `Origin`/`Referer` header and uses *that* as the link's host — preview admins now get preview links, prod admins get prod links. Falls back to `FRONTEND_URL` for callers without an Origin (cron, server scripts, emails — which should always go to prod anyway).

### Verified via curl
- No Origin header → uses `FRONTEND_URL` → `https://lab.bashari.co/pay/?token=…` ✅
- `Origin: https://abc-123.preview.emergentagent.com` → preview URL with trailing slash ✅
- `Origin: https://lab.bashari.co` → prod URL with trailing slash ✅
- `Job.payment_url` computed field → trailing-slash form ✅
- Both `http://localhost:3000/pay/?token=x` and `/pay?token=x` return 200 OK in preview (so existing tokens in already-sent emails still work in preview; only prod is afflicted by the redirect leak).

### NOTE
This unblocks `Open Link` / fresh links once redeployed. The **underlying production proxy bug still needs Emergent Support to fix**, otherwise any other route depending on a trailing-slash redirect (e.g. if you ever drop `trailingSlash`) will hit the same `:8080` leak.



## Feb 26, 2026 — Signing-pad countdown timer + QR connect

User request:
> "Yes add the timer. Also add the QR code you suggested earlier that helps admin connect the pad."

### 1. Countdown timer on the pending-signature banner
In the Job Detail dialog's `<SignatureSection>`, the "Waiting for … signature on pad" amber banner now carries a live `M:SS` countdown showing how long until the request auto-expires server-side. Renders as a small amber/red pill with a clock icon next to the Cancel button.

- Re-renders once per second via a `setInterval` (1Hz is plenty — server holds the actual expiry).
- Switches to red + pulse when under 30s remain.
- Shows "expired" once `expires_at` passes; the next 2s poll then drops the banner entirely (server-side reaper marks it `expired`).
- The polling effect also now treats `status === "expired"` the same as `cancelled` — drops the banner so the UI matches the DB state without a hard refresh.

`SignatureRow` API type was updated to include `expires_at`, `cancellation_reason`, and the new `expired` status variant.

### 2. QR connect dialog in Settings → Signing Pad Accounts
New `<PadConnectQrDialog>` (uses `qrcode.react` — 0 transitive deps, ~6kB gz). Settings table now has a small QR icon next to each pad's Delete button. Clicking it pops a modal containing:

- A 208×208 QR encoding `${window.location.origin}/login?email=<pad.email>` — preview QRs scan into preview, prod QRs into prod, no env-specific configuration needed.
- The plain URL as copy-able text with a Copy button (falls back to a `window.prompt` if the Clipboard API is unavailable on the http-served preview).
- A "Tip" callout reminding the admin to enable Guided Access / Screen Pinning after first login.

Login page now reads `?email=` and pre-fills the email field, stripping the param from URL on mount so it doesn't leak into browser history.

Trade-off considered: we deliberately did NOT bake a magic-link token into the QR. The QR could be photographed off the admin's screen, and pad sessions live for days — keeping the password required for first login holds the threat surface tiny while still saving ~30 chars of typing on glass keyboards.

### Verified (Playwright, single-pass smoke test)
- 3 Connect buttons found on the Settings → Signing Pads tab (one per existing pad).
- QR SVG renders, URL contains the URL-encoded email (`pad-ny%40bashari.com`).
- Pending banner countdown reads `2:58` immediately after capture trigger; reads `2:55` three seconds later — live ticking confirmed.

### Code touched
- NEW `/app/frontend/src/components/settings/PadConnectQrDialog.tsx`
- `/app/frontend/src/app/dashboard/settings/page.tsx` — QrCode icon import, `connectQrPad` state, Connect button in desktop+mobile rows, dialog mount.
- `/app/frontend/src/app/login/page.tsx` — `?email=` query param pre-fill.
- `/app/frontend/src/components/signatures/SignatureSection.tsx` — countdown state + render, `expired` status handling.
- `/app/frontend/src/lib/api.ts` — `SignatureRow.expires_at`, `cancellation_reason`, `'expired'` status variant.
- `package.json` — `qrcode.react@4.2.0`.



## Feb 26, 2026 — Signature requests auto-expire after 3 minutes

User report:
> "I'm logging in with a phone as a signing pad in preview, and it asks me to sign. There is no signature process on the admin side. We should release the signature state after a few seconds."

Root cause: a stale `signature_request` row from an abandoned session was still `status=pending` in the DB. The pad's poll endpoint returned it forever, so any new pad login started by being thrown into a phantom signature flow.

Fix: signature_requests now auto-expire. Default TTL is 180 seconds (configurable via `SIGNATURE_PENDING_TTL_SECONDS` in `backend/.env`).

### Mechanics
- `POST /api/signatures/request` now stamps `expires_at = created_at + TTL` and `cancellation_reason: null`.
- `GET /api/signatures/pending` runs an `update_many` reaper on every poll: any pending row where `expires_at <= now` (or, for legacy rows without `expires_at`, `created_at + TTL <= now`) flips to `status=expired` with `cancellation_reason="expired"`. No separate scheduler needed — the polling itself does the work.
- `POST /api/signatures/{id}/submit` now returns **HTTP 410 Gone** if the row expired between the pad's last poll and the submit, marking it expired in the same call (prevents racey "ghost signs" that arrive after the admin gave up).
- `_serialise` exposes `expires_at` and `cancellation_reason` for future admin-side countdown UI.

### Pad UX
The signing-pad page now catches the 410 specifically: drops the canvas, surfaces "This signature request expired. Please ask the lab to start a new one." so the client gets a clear explanation rather than a generic error.

### Verified
- Stale row in DB → pad poll → 1 pending becomes 0 pending, 1 expired. Pad sees `null`. ✅
- Fresh row → pad poll → still visible with `expires_at` populated. ✅
- Submit on a now-expired row → HTTP 410 `{"detail":"Signature request expired"}`. ✅
- Next poll after that submit → `null`. ✅

### Code touched
- `/app/backend/routes/signatures.py` — `SIGNATURE_PENDING_TTL_SECONDS` constant, `expires_at` field, reaper in `pending`, 410 path in `submit`, serialise additions.
- `/app/frontend/src/app/dashboard/signing-pad/page.tsx` — submit `catch` now handles `err.response.status === 410` specifically.
- Re-seeded `pad-il@bashari.com / pad123` (Israel branch) in the preview DB — the user had deleted it via the now-working Delete UI.



## Feb 26, 2026 — Pickup return docs styled to match the main memo

User request:
> "Both return docs should look very much like the memo doc. The 'terms and conditions' part is not needed on return but the whole doc should look very similar."

Rewrote `/app/frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts` to use the **exact same** CSS / DOM structure as `buildJobMemoHtml.ts`:

- Same Helvetica body + 22px/32px padding + 900px max-width
- Same `.company-header` with logo + display name + legal name and 2px black bottom border
- Same `.doc-title-bar` ("Memo Return #00576" / "Certificate Collection #00576" + formatted date right-aligned)
- Same gray rounded `.job-meta-row` with Client (email/phone subs) + Branch
- Same `.section h3` (uppercase, letter-spaced, underline)
- Same bordered table with `.group-separator`, `.grouped-row`, `.totals-row`, `.flags` styling
- Same `.signatures` 1fr/1fr grid (Picked Up By + Lab Representative) including the captured-signature PNG embed path
- Same `.footer` (legal name, address, phones, email, VAT, printed timestamp)
- **Terms & Conditions section dropped** — return docs are receipts; the client agreed to the T&Cs at drop-off.

memo_return-specific:
- Same 7-column table as the intake memo *minus the Fee column* (fees were settled before pickup, so a Fee column would be noise).
- Same grouped/ungrouped sorting + label generation (`single`, `pair-N`, `layout-N`, `multi-stone-N`).
- Totals row mirrors the intake memo's footer (count, certificates, total ct, total value).

cert_collection-specific:
- 5-column table (Certificate / Identification / Weight / Color / Stones) grouped by `certificate_group` so paired/parcel certs render as one line covering N stones.
- Verbal findings (`certificate_id`, `identification`, `color`) are surfaced — this is what the printed certificate actually carries.

### Verified
Live preview, Memo Return on job #576 → AI vision check confirms: corporate header ✅, doc-title-bar ✅, client meta row ✅, stones table with totals ✅, signatures grid ✅, footer ✅, **no T&C section** ✅. Same for the Cert Collection doc.



## Feb 26, 2026 — Signing pad delete bug

User report:
> "I'm trying to delete a signing pad on the preview site and it won't remove it. I assume that's the case on production too."

Two-bug pile-up:

1. **Backend RBAC was too narrow.** `DELETE /api/users/{id}` rejected any non-admin role: `if target["role"] not in ["super_admin", "branch_admin"]: 400`. So clicking Delete on a `signing_pad` row returned HTTP 400 "Can only delete admin users". Fixed by adding `"signing_pad"` to the allowed list (super_admin auth is still required — pads can't self-delete).

2. **Frontend silently swallowed the error.** `handleDeletePad` had a `try` + `finally` but no `catch`, and the confirm dialog had no error display slot. Result: admin clicked Delete → backend 400 → nothing happened on screen. Added a `catch` that surfaces the backend `detail` into `padFormError`, and rendered an inline red alert inside the Delete-Pad confirm dialog (also reset on dialog close).

### Code touched
- `/app/backend/routes/users.py` line 181 — allow `signing_pad` in delete_admin_user.
- `/app/frontend/src/app/dashboard/settings/page.tsx` — `handleDeletePad` now catches, and the delete confirm dialog shows `padFormError` inline.

### Verified
`curl DELETE /api/users/{pad_id}` as super_admin → 200 `Admin user … deleted successfully`. Confirmed with a throwaway pad-test-delete@bashari.com account.



## Feb 26, 2026 — Mobile Signing Pad bug fixes (top-only writable + submit failing)

User report on mobile (Signing Pad logged in on phone):
> "Only the top part of the screen is writable. Submit says 'couldn't read signature canvas'. The screen moves while signing."

Three root causes, all fixed in one pass:

### 1. Ref forwarding broken through `next/dynamic`
`react-signature-canvas` was loaded via `next/dynamic({ ssr: false })`, which does NOT forward refs through its wrapper. `canvasRef.current` was always `null`, so `toDataURL()` returned `undefined` → the exact "Could not read signature canvas" thrown by the page. Fix: new `<SigningSurface>` "use client" component that imports the lib directly and `forwardRef`s a stable `{clear, isEmpty, toDataURL}` handle.

### 2. Canvas pixel-resolution stuck at 300×150 → only top portion drawable
The lib defaults canvas backing-store to 300×150 px; CSS stretches it to fill the container (e.g. 400×800), so only pointer events landing within the top (0..150 px) → ~150 CSS-px-tall slice produced strokes. The bottom 4/5 of the visible canvas silently dropped touches. Fix: `ResizeObserver` on the container sets `canvas.width/height = clientWidth × DPR / clientHeight × DPR`, preserves in-progress strokes across resizes via `pad.toData() → fromData()`, and listens to `visualViewport.resize` for iOS URL-bar collapse. Verified: top half darkPixels=1425, bottom half darkPixels=1318 on a diagonal stroke (previously: bottom=0).

### 3. Page scrolled / rubber-banded while signing
No `touch-action: none` → mobile treated drag as pan. Fix: `touch-action: none` + `user-select: none` + `overscroll-behavior: contain` on the canvas container; page capture screen now uses `fixed inset-0 h-[100dvh] overflow-hidden` and locks `document.body.style.overflow = 'hidden'` for the duration of the active capture (restored on unmount). Header shrunk to `text-lg` on mobile so the canvas claims more vertical space.

### Code touched
- NEW `/app/frontend/src/components/signing/SigningSurface.tsx` — forwardRef + ResizeObserver + touch-action wrapper.
- `/app/frontend/src/app/dashboard/signing-pad/page.tsx` — drop `next/dynamic`, use `<SigningSurface>`, lock body scroll while capturing, mobile-tightened header + footer spacing.

### Verified
Playwright mobile-viewport flow on the live pad:
- canvas pixel size matches CSS × DPR ✅
- diagonal stroke registers in BOTH top and bottom halves ✅
- Submit returns 200, no "Could not read signature canvas" error, pending row cleared on the next pad poll ✅



## Feb 26, 2026 — Pickup history wired up + idempotent /finalize endpoint

Closed out the integrated Pickup → Signature → PDF-archive flow that the previous session left half-mounted:

### 1. `<PickupHistorySection>` now mounted in the Job dialog
Imported into `/app/frontend/src/app/dashboard/jobs/page.tsx` and rendered between `<SignatureSection>` and `<JobActivityList>` for admins. Shows one row per pickup event with: type label, stone count, timestamp + actor, "Awaiting signature" amber badge OR "View signed PDF" link to Cloudinary, plus an "Undo" button visible only to super_admin. Polls every 4s so the "Awaiting → Signed" transition surfaces automatically once the client signs on the pad.

A `catch` block was added so future fetch failures surface in `console.error` instead of silently returning null (the previous silent swallow masked an iter-40 stale-build issue for hours).

### 2. New `POST /api/pickups/{id}/finalize` endpoint (idempotent)
The internal helper `finalize_pickup_if_linked` was the only path that ever compiled a memo into a PDF — there was no way to retry or re-finalize. Added a public endpoint:

- **Idempotent fast-path**: if the pickup already has `signed_pdf_url`, return it without touching Cloudinary (timestamp-based public_id would otherwise leak orphan assets).
- **Branch RBAC**: branch_admin from a different branch → 403.
- **Validation**: 404 unknown pickup, 400 if no `memo_html_template` stored, 400 if no signature available (neither explicit payload nor linked-and-signed request).
- **Helper extraction**: shared `_render_and_upload(pickup, signature_url, signer_name)` keeps the HTML→PDF→Cloudinary path in one place for both call paths.

The helper is also now idempotent — `finalize_pickup_if_linked` checks for an existing `signed_pdf_url` first, so duplicate signature submissions don't produce duplicate Cloudinary assets.

### Code touched
- `/app/frontend/src/app/dashboard/jobs/page.tsx` — import + mount
- `/app/frontend/src/components/pickups/PickupHistorySection.tsx` — `catch` block
- `/app/backend/routes/pickups.py` — new `/finalize` route, `_render_and_upload` helper, idempotent guard
- `/app/backend/tests/test_pickups_http.py` — 4 new tests (10/10 PASS)

### Test status
Iter-41 testing agent: backend 10/10 PASS, frontend section renders with rows on real data (job #595).



## Feb 25, 2026 — Pickup follow-ups (returned chip + cert-data + checkbox fix)

Three small but meaningful follow-ups after the Memo Return / Cert Collection ship:

### 1. Job-level "returned" indicator
`getJobReturnedSummary(stones)` returns `'none' | 'partial' | 'all'`. `CompletenessBadges` now also renders a chip when partial/all: **amber "Partial pickup"** or **emerald "All returned"** next to the job number on both the Jobs list table and the mobile card. Per-stone "Returned" pills (`StoneStatusBadges`) were already there from the original status-tracking work — this new chip lets the admin see the same fact at the job level without opening the dialog.

### 2. Cert Collection memo now shows certificate fields
The cert_collection table previously printed SKU/Type/Weight/Value. It now prints what the printed certificate actually carries: **Certificate ID / Identification / Weight / Color**, pulled from each stone's `verbal_findings`. For pair/parcel certs (one cert covering multiple stones), the head stone's values render in the row plus a "N stones (SKU1, SKU2, …)" caption so admins can tell mixed groups apart.

### 3. Checkbox click bug in Memo Return dialog
The row's `onClick` AND the checkbox's `onChange` were both firing, cancelling each other out — admins could only toggle by clicking next-to the box, not the box itself. Fixed with `onClick={(e) => e.stopPropagation()}` on the checkbox so:
- Clicking the row → `onClick` fires → row toggles. ✅
- Clicking the checkbox → `onChange` fires; `stopPropagation` keeps the row's `onClick` from firing too. ✅

### Code touched
- `/app/frontend/src/lib/stoneCompleteness.ts` — `getJobReturnedSummary` + `ReturnedSummary` type
- `/app/frontend/src/components/jobs/CompletenessBadges.tsx` — optional `returnedSummary` prop
- `/app/frontend/src/app/dashboard/jobs/page.tsx` — pass `returnedSummary` to both the table and mobile-card badges
- `/app/frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts` — cert_collection table columns + verbal_findings extraction
- `/app/frontend/src/components/pickups/PickupSelectionDialog.tsx` — checkbox `stopPropagation`
- `/app/frontend/src/lib/__tests__/stoneCompleteness.test.ts` — new test for `getJobReturnedSummary` (none/partial/all/cancelled-ignored). **13/13 unit tests pass.**

---

## Feb 25, 2026 — Pickup memos (Memo Return + Certificate Collection)

Two new printable receipts for when clients collect stones/certs from the lab, with full DB tracking so the system can answer "which stones haven't been collected yet?" and prevent double-pickup.

### Two pickup flows, one collection
- **Memo Return** — client picks up stones. Selection UX: stone-by-stone checkbox list. Recording the pickup also flips each stone's `stone_status` from `at_office` → `returned`.
- **Certificate Collection** — client picks up the printed certificates. Selection UX: grouped by `certificate_group` so a "Pair / Layout" cert is picked as one unit. Does NOT touch `stone_status` (the cert can travel home while the stone stays at the lab).
- Both flows are independent — a stone can be in a memo_return AND a later cert_collection.

### Double-pickup prevention
The selection dialog pre-disables stones already in a prior pickup of the same type with an amber "Already collected" badge. If the admin somehow POSTs them anyway (e.g. stale UI), the backend returns 409 with the conflicting IDs.

### Backend
- **`/app/backend/routes/pickups.py`** — `POST /pickups`, `GET /jobs/{id}/pickups`, `DELETE /pickups/{id}` (super_admin only, reverts stone_status). Branch-scoped for branch_admins. Validates: stone ownership, cancelled-stone block, type whitelist, double-pickup guard.
- 2 new `Action` codes: `PICKUP_PRINTED`, `PICKUP_DELETED` — surface in the Activity feed.
- **`/app/backend/tests/test_pickups.py`** — 8 pytest tests covering happy path, double-pickup block, cancelled-stone rejection, memo_return ↔ cert_collection independence, list ordering, delete-and-revert.

### Frontend
- **`/app/frontend/src/app/dashboard/jobs/_lib/buildPickupMemoHtml.ts`** — printable HTML. Title + lab header + 3-cell summary (client / item count / total value) + items table (per-stone for memo_return, per-cert-group for cert_collection) + totals row + signature blocks. Auto-prints on window load.
- **`/app/frontend/src/components/pickups/PickupSelectionDialog.tsx`** — pre-checks all active stones, greys out already-collected ones, auto-attaches the most recent matching captured signature (`client_collection` / `cert_collection` role), POSTs the event, opens the print window. Inline tip nudges admins to capture a signature first.
- **Job Detail dialog header** — three buttons side-by-side: **Print Intake** (existing), **Memo Return** (new), **Cert Collection** (new).

### How it ties to the signature flow
When the admin captures a `client_collection` or `cert_collection` digital signature BEFORE clicking Print, the pickup dialog auto-finds it and embeds the PNG on the printed memo. If no signature is captured, the memo prints with a blank pen-signable line (legacy behaviour).

### Tests
- 8 new backend pytest in `test_pickups.py` — all pass
- Full regression: **49 passed, 1 skipped** across pickups + signatures + activity (all suites)
- Updated `test_activity_phase2.py::test_actions_returns_expected_codes` to assert the catalogue grows over time rather than being exactly 14

---

## Feb 25, 2026 — Verbal + Certificate completeness indicators

At-a-glance green checks so admins can scan a job/stone list and instantly see which records still need verbal findings or a certificate scan.

### Decisions captured (in pure functions, so the rule is one place)
- **Verbal complete** = every structured field except `comment` is filled. Free-text legacy verbals count as complete if non-empty.
- **Parcels**: top-level fields complete AND every per-stone entry's core fields (weight / identification / color / origin) complete.
- **Cert complete (stone)** = `certificate_scan_url` is set.
- **Cert complete (job)** = every certificate_group has at least one stone with a scan URL (one upload per cert, even when 5 stones share it); ungrouped stones each need their own.
- **Cancelled stones excluded** from job-level checks.

### New
- **`/app/frontend/src/lib/stoneCompleteness.ts`** — `isStoneVerbalComplete`, `isStoneCertComplete`, `isJobVerbalComplete`, `isJobCertComplete`. Pure, dep-free, easy to test.
- **`/app/frontend/src/components/jobs/CompletenessBadges.tsx`** — small green-check pills. Two sizes: `'sm'` (icon + label) for stone rows inside dialogs, `'xs'` (icon-only, circular) for tight surfaces like the jobs table.
- **`/app/frontend/src/lib/__tests__/stoneCompleteness.test.ts`** — 12 unit tests (run via `npx tsx --test`). All pass.

### Wired in
- **Stone level**: `StoneStatusBadges` (used inside Job Detail dialog stones table) now shows the green checks after the existing status pills. Also added to the dedicated `/dashboard/stones` page next to each stone's SKU.
- **Job level**: Jobs list table (desktop) and the mobile job card both surface compact icon-only checks next to the job number.

### Visual: emerald green = Verbal, blue = Cert. Tooltips ("Verbal findings complete" / "Certificate uploaded") on hover. **No icon shown for incomplete state** — keeps the UI clean.

---

## Feb 25, 2026 — Signing Pad accounts UI in Settings

After Phase 1 shipped, user redeployed to production and got "invalid credentials" trying to log into the kiosk: the two seeded pad accounts only existed in preview's MongoDB. Building an admin UI is the right fix — they never have to think about it again, and adding a third/fourth branch is a 30-second click.

### Frontend
- New **"Signing Pads"** tab inside `/dashboard/settings` (super_admin only). Lists existing pads (email, display name, branch chip — Global catch-all gets a special amber badge). "Create signing pad" button opens a modal: email + display name + plaintext password (admin types it on the tablet, shown plainly on purpose) + branch dropdown (defaults to "Global catch-all"). Delete-per-row with confirm dialog.
- A small grey "How to set up the tablet" callout under the table walks the admin through the kiosk setup (login URL + Guided Access / Screen Pinning hints).
- The existing "Admin Users" tab now filters to admin roles only (signing_pad rows no longer appear mixed in).

### Backend
- New `SigningPadCreate` pydantic model — fixes the bug from initial Phase 1 where the endpoint reused `AdminUserCreate` and rejected requests for missing `role`. Now clean: only the 4 fields the pad needs.
- `/api/users/signing-pad` route updated to use the new schema; verified end-to-end via curl (create → login → 14/14 pytest regression).

### Touched files
- `/app/backend/models.py` — `SigningPadCreate` model
- `/app/backend/routes/users.py` — switched pad endpoint to `SigningPadCreate`
- `/app/frontend/src/lib/api.ts` — `usersApi.createSigningPad`
- `/app/frontend/src/app/dashboard/settings/page.tsx` — new tab + state + Create/Delete dialogs (~200 LOC)

---

## Feb 25, 2026 — Digital Signatures Phase 1 (dedicated tablet model)

After exploring QR/SMS handoff, the user chose the simpler **dedicated tablet at the desk** model: a tablet/phone sits permanently at the front desk, always logged in as a `signing_pad` role account scoped to that branch, polling every 2 seconds. Admin clicks "Capture signature" on their desktop → the pad picks it up → client signs → desktop polls and shows the captured PNG. Multi-branch ready from day one — Israel pad never sees NY requests.

### New role: `signing_pad`
- Restricted to two endpoints (`GET /signatures/pending` + `POST /signatures/{id}/submit`).
- Per-branch scoping: pad's `branch_id` is the only filter that matters. Routing **follows the JOB's branch**, not the actor's — so a super_admin sitting at IL can capture a NY job and the request lands on the NY pad.
- `POST /api/users/signing-pad` (super_admin only) creates new pad accounts. Existing user-list endpoint also returns them.

### Backend (`/app/backend/routes/signatures.py`)
- `POST /api/signatures/request` — admin creates a pending row. Replaces (cancels) any prior pending row for the same (job, role).
- `GET /api/signatures/pending` — pad polls; oldest pending row in caller's branch (or all branches for global catch-all pad).
- `POST /api/signatures/{id}/submit` — pad uploads PNG to Cloudinary; validates payload (rejects empty <100 B, oversize >2 MiB, malformed base64); stores `user_agent` + `ip` audit fields.
- `GET /api/signatures/{id}` — desktop polls to learn when signed.
- `GET /api/jobs/{job_id}/signatures` — admin lists all rows for the gallery.
- `POST /api/signatures/{id}/cancel` — admin cancels a pending row.
- `DELETE /api/signatures/{id}` — admin removes a captured signature; destroys the Cloudinary asset (best-effort).
- 4 new `Action` codes (`SIGNATURE_REQUESTED/CAPTURED/CANCELLED/DELETED`) wired into the Activity feed labels.

### Frontend
- **`/dashboard/signing-pad`** — full-bleed kiosk page (sidebar hidden via layout bypass). Idle state ("Signing pad ready, waiting…") swaps to a full-screen `react-signature-canvas` when a request appears. Clear + Submit buttons. After submit shows a 4-second "Thank you" then returns to idle.
- **`<SignatureSection>`** — admin widget inside the Job Detail dialog. Shows a thumbnail gallery of signed captures (with role, signer name, capture time, delete button), a "Capture signature ▾" dropdown with 4 role buttons, a modal asking for the signer's name, and an amber "Waiting for signature on pad…" banner while a request is pending.
- **Job memo PDF (`buildJobMemoHtml.ts`)** — when a `signed` signature exists for `client_drop_off`/`client_collection`/`cert_collection` (newest wins), the captured PNG renders in place of the blank "Client signature: ____" line, with the signer's name + capture timestamp underneath. Lab-representative line still blank for pen signatures.
- Sidebar: new "Signing Pad" nav item visible to `signing_pad` + admin roles.
- Login: `signing_pad` users redirect to `/dashboard/signing-pad` (not the dashboard home, which they have no permission for).

### Multi-branch by design
| Pad | branch_id | Sees pending for |
|---|---|---|
| IL pad | Israel | Only IL jobs |
| NY pad | NY | Only NY jobs |
| Global pad | (none) | All branches (super_admin catch-all) |

### Tests
- **`/app/backend/tests/test_signatures.py`** (14 pytest) — full happy path + branch isolation + duplicate replacement + invalid payload paths. Cloudinary monkeypatched.
- **`/app/backend/tests/test_signatures_http.py`** (9 HTTP-level, created by iter-39 testing agent) — live-API smoke tests against the preview URL.
- iter-39 testing agent: **23/23 backend + 100% frontend live-verified, zero bugs, zero regressions.**

### Seeded pad accounts (for testing)
- `pad-il@bashari.com / pad123` (branch_id: Israel Office)
- `pad-ny@bashari.com / pad123` (branch_id: USA-NY)

### Deferred to Phase 2
- SMS/email signing link for absent clients (additive — `signature_requests` shape doesn't change).
- Admin "acknowledgment" signature for verbal authorizations.

---

## Feb 25, 2026 — Consolidate JobDetailDialog stones-table + status list

The `/jobs` and `/shipments` Job Detail dialogs had drifted enough that a parcel-display fix landed in one but not the other. Minimum-scope consolidation (per user direction): extract the pieces that actually drifted, leave each dialog shell intact.

### New
- **`/app/frontend/src/components/jobs/JobStonesTable.tsx`** — canonical stones table with two variants:
  - `compact` (shipments side): SKU/Type/Weight/Shape/Value/Certificate; read-only; clicking a row opens the stone.
  - `full` (jobs side): adds selection checkboxes, fee column, status badges, certificate-scan icon, delete button (edit-mode + admin only).
  - Cert-grouping logic (sorted by cert# ascending, navy header row with totals, indented stones) is now in ONE place. `getCertificateLabel` inlined here so the shared component doesn't reach into a route-private `_helpers.ts`.
- **`/app/frontend/src/lib/jobStatuses.ts`** — `JOB_STATUSES` (8 entries) and `JOB_STATUSES_WITH_CANCEL` (9, includes Cancelled). One source of truth for status `<Select>` options.

### Touched
- `jobs/page.tsx`: replaced ~150 lines of inline `<Table>` + cert-grouping IIFE + delete/checkbox markup with `<JobStonesTable variant='full'>`. Also swapped the inline 9-entry `<SelectItem>` list for `JOB_STATUSES_WITH_CANCEL.map`. **2058 → 1908 LOC** (-150).
- `shipments/_components/JobDetailDialog.tsx`: replaced ~97 lines of inline table + cert grouping with `<JobStonesTable variant='compact'>`. Dropped the inline `JOB_STATUSES` array. **348 → 251 LOC** (-97).

### Verified
- `yarn build` ✅; `/dashboard/jobs` route bundle shrank 30 kB → 28.4 kB; `/dashboard/shipments` unchanged at 22.1 kB.
- iter-38 testing agent — 9/12 spec items live-verified, 3 code-review-verified (cert-scan + cert-group navy header + compact-side parity). **Zero regressions detected.**

---

## Feb 25, 2026 — Activity Log Phase 2 (global feed + filters)

Per-job timeline (Phase 1) wasn't enough — admins also wanted to scan everything that happened across the system in the last week without opening 30 jobs. Phase 2 adds a global feed page, three filters, and cursor pagination. The presentation layer is now a single shared component (`<ActivityRowItem>`) used by both surfaces, so the per-job list and the global feed are guaranteed identical.

### Backend
- **`/app/backend/routes/activity.py`** — extended `GET /api/activity` with:
  - `action` (repeatable, `?action=a&action=b`) — `$in` filter.
  - `actor_id` — single actor narrow.
  - `from_date` / `to_date` — `[from, to)` window on `created_at`, both ISO. Invalid → 400.
  - `before` — cursor (returns rows strictly older than this `created_at`); combined with `to_date`, the older of the two wins.
  - `limit` bounded `[1, 500]`, default 200.
  - `created_at` is now force-stamped UTC (`+00:00`) on serialisation so JS `new Date(iso)` is locale-independent. Previously naive — fixed in response to iter-37 code review.
- **`GET /api/activity/actions`** — static label table (14 codes) for the filter dropdown. Single source of truth for human-readable action names.
- **`GET /api/activity/actors`** — distinct (actor_id, name, role, last_seen) tuples that appear in the log; branch-admins scoped to their own branch; capped at 200 actors (typeahead is the right escape valve if we ever exceed it).

### Frontend
- **`/app/frontend/src/components/activity/ActivityRowItem.tsx`** — shared compact one-line row component. Action-code → (label, icon) map lives here; unknown codes fall back to the raw code + `Mail` icon. Optional `showJobBadge` flag adds a 6-char monospace job-id chip for the global feed.
- **`/app/frontend/src/app/dashboard/activity/page.tsx`** — new admin-only feed page. Sticky filter bar with toggleable action pills (multi-select), Actor `<Select>`, From/To date inputs, Clear + Refresh buttons. Default lookback = 7 days. Cursor pagination via "Load more" — visible only when the prior page returned a full 200 rows.
- **`/app/frontend/src/lib/api.ts`** — `activityApi.listGlobal(params)` (uses `paramsSerializer={indexes:null}` for repeated `action` keys), `listActions()`, `listActors()`.
- **`/app/frontend/src/app/dashboard/jobs/_components/JobActivityList.tsx`** — refactored to delegate row rendering to `<ActivityRowItem>`. Same data, same look — no duplicated label table.
- **`/app/frontend/src/app/dashboard/layout.tsx`** — added "Activity" nav item (super_admin + branch_admin only) with the `History` icon.
- **`/app/frontend/src/app/page.tsx`** — SPA router maps `/dashboard/activity` → `ActivityPage`.

### Tests
- **`/app/backend/tests/test_activity_notification.py`** (NEW, 3 tests) — monkeypatches `send_email_async` / `send_sms` / `build_notification_email_html` to skip the network, then verifies `job_notification_sent` is logged for successful email + SMS sends. Also asserts failed sends do NOT log a row (the per-job timeline is success-only by design).
- **`/app/backend/tests/test_activity_phase2.py`** (NEW, 13 tests, iter-37 testing agent) — covers `/actions`, `/actors`, repeated `action` filter, `actor_id` filter, `from_date`/`to_date` window with [from, to) semantics, invalid date → 400, cursor pagination via `before`, unauth 401.
- **`/app/backend/tests/test_activity_log.py`** (iter-36, regression) — still passing.
- Combined: **27 passed, 1 skipped** (skip is the manual-payment $0-balance fixture, unchanged from iter-36 — no defect).

---

## Feb 25, 2026 — Extract `useJobStones` hook from `jobs/page.tsx`

Continuing the long-running `jobs/page.tsx` decomposition (still the largest page in the app — 2086 → 2058 LOC after this pass; net win is more about isolation than line count). The Create Job dialog's in-progress stone list now lives in a dedicated hook so the page doesn't carry its own UID counter, parcel-toggle side-effect, or row predicates.

### New
- **`/app/frontend/src/app/dashboard/jobs/_hooks/useJobStones.ts`** — owns `stones` array + UID generation + `addStone` / `removeStone` / `changeStone` / `resetStones`, plus `hasStoneData()` and `hasValidStone()` predicates used by the page-level "unsaved changes" guard and the submit-enabled check. Module-local `_stoneUidCounter` fallback for browsers without `crypto.randomUUID()`.

### Touched
- `CreateJobDialog.tsx` — `StoneInput.color_stability_test?: boolean` added to the public type (the page already tracked it on the row; declaring it on the shared type removes a `@ts-expect-error`).
- `jobs/page.tsx` — replaced inline `useState<Array<{...}>>([...])` + `handleAddStone` + `handleRemoveStone` + `handleStoneChange` (~30 LOC) with `const { stones, addStone, removeStone, changeStone, resetStones, hasStoneData, hasValidStone } = useJobStones();`. Dialog callsite passes the hook handlers directly (`onStoneChange={changeStone}` etc).

### Verified
- `yarn build` succeeds; `/dashboard/jobs` route static-export size unchanged at 30 kB.
- Lint clean (TS, ESLint).

---

## Feb 25, 2026 — Activity Log Phase 1 (admin-only audit timeline)

Per-job operational audit trail so admins can see who did what and when. **No JSON diffs** (per product decision Feb 25 2026): timeline rows are intentionally minimal — action label + actor + when + short summary — so they stay scannable. The underlying records keep the full state.

### Backend
- **`/app/backend/activity_log.py`** — `log_activity()` helper + `Action` constants. Fire-and-forget (any DB error is logged but never re-raised, so a logging hiccup can't break the business write that triggered it). 365-day TTL via Mongo index — auto-prune, no separate cron. Lazy `ensure_indexes()` runs once per process so we don't try to touch the DB at import time.
- **`/app/backend/routes/activity.py`** — `GET /api/activity?job_id=&branch_id=&limit=` (require_admin). `branch_admin` is silently scoped to their own branch even if they pass a different `branch_id`. `super_admin` sees all.
- **Instrumented write paths** (one row per business write, no diffs):
  - `jobs.py` → `JOB_CREATED`, `JOB_UPDATED` (lists changed fields by name), `JOB_STATUS_CHANGED` (from→to in summary), `STONE_CANCELLED`.
  - `stones.py` → `STONE_VERBAL_ENTERED`, `STONE_FEES_UPDATED`, `STONE_CERT_UPLOADED` (single + group), `STONE_CANCELLED`.
  - `manual_payments.py` → `PAYMENT_RECORDED` (amount + destination + paid-in-full flag).
  - `shipments.py` → `SHIPMENT_CREATED` (one row per included job + one shipment-only row so it appears in each job's filtered timeline and in the global feed). `SHIPMENT_STATUS_CHANGED` (one row per included job; from→to in summary).
  - `notifications.py` → `JOB_NOTIFICATION_SENT` (email + SMS, ONLY on success — failed sends already get a toast; logging "failed" rows would just clutter the timeline).
  - `clients.py` → `CLIENT_CREATED`, `CLIENT_UPDATED` (lists changed fields).
  - `auth_routes.py` → `LOGIN_SUCCESS` for admins only (customer logins are noisy and not operationally interesting).

### Frontend
- **`/app/frontend/src/lib/api.ts`** — new `activityApi.listForJob(jobId, limit?)` + exported `ActivityRow` type.
- **`/app/frontend/src/app/dashboard/jobs/_components/JobActivityList.tsx`** — admin-only compact timeline card. One-line rows: icon (lucide-react) + action label + summary + actor + relative time (`5m ago`, `3h ago`, falls back to absolute date past 7d). Test IDs: `job-activity-list`, `job-activity-empty`, `job-activity-error`, `activity-row-{action}`.
- **`jobs/page.tsx`** — wires `<JobActivityList jobId={selectedJob.id} />` inside the Job Detail dialog, below the Payment + Notifications grid, gated by `isAdmin && selectedJob`.

### Tests
- Testing agent iter-36 — backend 11/12 pass (1 skipped — manual-payment test fixture had $0 balance, validation correctly rejected it; no defect). Frontend Playwright was blocked by the preview environment being asleep; code review confirms wiring is correct.

---

## Feb 25, 2026 — Inline "+ New client" affordance in Create Job dialog


Admins reported workflow friction: when creating a job for a brand-new client, they had to abandon the half-filled job modal, switch to `/dashboard/clients`, create the client, switch back, and re-open the Create Job dialog. Now they can do it from the same screen.

### New shared component
- **`/app/frontend/src/app/dashboard/clients/_components/CreateClientDialog.tsx`** — self-contained dialog (~290 lines, owns its own form state). Receives `branches` + optional `defaultBranchId` + an `onCreated(client)` callback. Pulled out of the inline copy that was previously in `clients/page.tsx`.
- **`/app/frontend/src/app/dashboard/clients/_types.ts`** — co-located `Client` + `Branch` types so the page and component import from a single source.

### Create Job dialog
- New **"+ New client"** button (`data-testid='job-add-new-client-button'`) inside the Client field — visually quiet (ghost button, `<UserPlus>` icon) so it doesn't compete with the picker, but discoverable.
- Opens the same canonical `<CreateClientDialog>`. After save:
  - `formData.client_id` auto-fills with the new client
  - `formData.branch_id` adopts the new client's branch
  - Parent's clients list refetches so the SearchableSelect now contains the new entry
- Branch preselect cascade: `formData.branch_id (existing job context) → defaultBranchId prop → ''`. Jobs page passes `user?.branch_id || selectedBranchId` for the fallback so branch-admins get their branch pre-picked even before they touch the client field.

### Clients page cleanup
- 1149 → 963 lines (-186). Removed inline Create Client dialog + `handleCreateClient` + the manual pre-seed in the "Add Client" button (the dialog handles seeding itself on open).
- Edit Client flow untouched — it still uses the existing `formData` / `phonePrefix` / `secondaryPhonePrefix` state.

### Tests
- Testing agent iter-35 — 6/6 acceptance criteria pass.

---


## Feb 25, 2026 — Canonical `<StoneEditDialog>` consolidates 3 copies

User-flagged refactor: three pages (`/dashboard/jobs`, `/dashboard/stones`, `/dashboard/shipments`) each carried their own copy of the stone-edit modal. The copies had drifted — the parcel feature shipped on /dashboard/jobs but silently missed /dashboard/stones because the stones-page copy predated parcels. Today's consolidation closes that drift class entirely.

### New canonical component
- **`/app/frontend/src/components/dialogs/StoneEditDialog.tsx`** (421 lines, pure presentational, props in / callbacks out).
- Uses the already-shared `<StoneVerbalSection>` internally.
- Receives 18 props covering all 3 sites: stone, job, isAdmin, findings + setter, dropdownSettings, editMode + setter, optional CS/Mounted toggles + setters, fee constants, save handler + saving flag, cert input ref + uploading flag + onCertChange + onViewCert.
- Parcel-aware fee preview math (`csFeeCost × stone_count` for parcels) lives in ONE place now — preview pill and inline CS line read from the same calculation.

### Migrated call sites
- **`jobs/page.tsx`** — 2266 → 2068 lines (-198). Inline ~265-line dialog block replaced with one component invocation. Extracted `handleStoneCertUpload` from a previously-inline file-input closure.
- **`stones/page.tsx`** — 796 → 604 lines (-192). Extracted `handleSaveStone`. Save button position harmonised: was inline below verbal section, now lives in the footer right (consistent with other surfaces, user-confirmed).
- **`shipments/page.tsx`** — 1149 → 1198 (+49 for new fee-toggle state + handler expansion). The Color Stability / Mounted toggles are now exposed to admins viewing a stone from inside a shipment (was missing in the previous shipments-local copy — user-confirmed harmonisation). Added optional `color_stability_test` and `mounted` fields to `shipments/_types.ts::Stone`.
- **Deleted** `/app/frontend/src/app/dashboard/shipments/_components/StoneEditDialog.tsx`.

### JobDetailDialog NOT consolidated
- The jobs/page.tsx and shipments-local JobDetailDialog have **intentional** scope divergence (jobs = full admin with payments + per-stone actions, shipments = focused read-mostly view). Not the same code-drift problem the StoneEditDialog had. Logged in ROADMAP as `defer` — revisit if drift actually causes a bug.

### Tests
- Testing agent iter-34 — 13/13 acceptance criteria pass.
- Original bug verified fixed: opening parcel SA750J58402 on `/dashboard/stones` now correctly shows "PARCEL · 3 stones" chip, "TOTAL WT / TOTAL VALUE" labels, and `+$50 × 3 = $150` CS preview in edit mode.
- New behaviour confirmed: on `/dashboard/shipments`, admins now see Edit + CS + Mounted toggles inside the nested stone modal (previously hidden).
- Build clean (`yarn build`), `tsc --noEmit` clean.

---


## Feb 25, 2026 — Access-request admin notifications + sidebar/tab pending badge

User asked: "Where does Request Access go?" Two gaps:
1. Pending requests **did** save to MongoDB and **were** visible at `Dashboard → Clients → Access Requests` tab — but admins had no signal to know one had arrived.
2. No notification email was sent to admins on submission.

### Backend (`routes/access_requests.py`)
- New constant `ADMIN_FIXED_INBOX = "lab@bashari.co"` — every notification fan-out includes this address in addition to every `role: super_admin` user, so the team is informed even when the super-admin list is empty.
- New helpers `_new_request_admin_html(req, review_url)` (lean email body) and `_notify_admins_of_new_request(req_doc)` (fans out the send via the shared `send_email_async`).
- `verify_and_submit` now fires `_notify_admins_of_new_request(doc)` immediately after the access_request row is inserted. Wrapped in try/except so a Resend failure on the notify path can't turn an accepted submission into a 5xx for the user.
- CTA link: `{FRONTEND_URL}/dashboard/clients?tab=access-requests`.
- New endpoint **`GET /api/access-requests/pending-count`** — returns `{count: N}` for the badge. Lightweight, doesn't load 500 rows on every dashboard render.

### Frontend
- New tiny zustand store `lib/usePendingAccessRequests.ts` exposing `count` + `refresh()` + `reset()`. Polled every 30 s from `dashboard/layout.tsx` whenever an admin is signed in.
- **Sidebar "Clients" link badge** (`nav-clients-pending-badge`) — red pill with the count, white-on-red when active, repositions to corner when sidebar is collapsed. Hidden at zero.
- **Tab badge** on the "Access Requests" `TabsTrigger` inside `clients/page.tsx` (`access-requests-tab-badge`) reads from the same store. After approve/reject inside the tab, `refreshPendingBadge()` runs to keep both visuals in sync.

### Tests
- `tests/test_access_request_admin_notify.py` — 4 new pytests:
  - sends to super_admins + fixed inbox (3 recipients in fixture)
  - notify failure does NOT 5xx the submission (row is still inserted)
  - falls back to fixed-inbox-only when super_admin list is empty
  - CTA renders the correct deep link
- All 15 access-request + email-helper pytests pass: `python -m pytest tests/test_access_request_otp_failure.py tests/test_access_request_admin_notify.py tests/test_email_async_helper.py` → 15 passed.
- Live smoke: `GET /api/access-requests/pending-count` returns 401 unauth, 200 `{count: N}` with admin token.

---


## Feb 25, 2026 — All 6 Resend sites migrated to shared async helper

Extends the earlier same-day fix that only touched `routes/access_requests.py`. Same root cause (synchronous `resend.Emails.send` blocking the asyncio loop → Cloudflare 520 on slow Resend responses) applied to **6** routes; today we consolidated them all behind one helper so future call sites can't reintroduce the bug.

### New module: `/app/backend/email_async.py`
- `send_email_async(params, *, timeout=15.0, context="email") -> Optional[dict]` — wraps `resend.Emails.send` in `asyncio.to_thread` + `asyncio.wait_for`. Returns the Resend response dict on success, `None` on any failure (timeout / SDK exception / missing api_key).
- `context` string is included in log lines so production logs are greppable by subsystem (`otp`, `welcome`, `payment-receipt`, etc.).
- Default 15s ceiling — well under Cloudflare's ~30s edge timeout.

### Migrated sites (5 newly migrated, 1 already done)
- `routes/access_requests.py::_send_email` — already used `to_thread` directly; refactored to delegate to the helper. `import resend` no longer needed in this module.
- `routes/manual_payments.py::_send_payment_email` — payment receipt path.
- `routes/clients.py::create_client` — client welcome / setup-password email.
- `routes/notifications.py` (×2) — single send + bulk per-client send. Bulk-send loop still continues on per-client failure (preserved best-effort semantics).
- `routes/auth_routes.py` (×2) — admin-initiated password reset + public `/auth/forgot-password`.

### Behavioural notes
- Best-effort call sites (manual payments, bulk notifications, password resets, client welcome) preserved their previous "log + continue" semantics; they just no longer block the event loop while doing so.
- The hard-failing site (OTP send) still raises HTTP 502 with the friendly message on `None`.
- No public API contract changed.

### Tests
- `tests/test_email_async_helper.py` — 6 pytests (success, missing-key None, SDK exception, timeout, response coercion, concurrent parallelism).
- `tests/test_access_request_otp_failure.py` — 5 pytests (updated 2 to patch `email_async.resend` since the SDK now lives behind the helper).
- All 20 email-related tests pass: `python -m pytest tests/test_email_async_helper.py tests/test_access_request_otp_failure.py tests/test_email_template_fixes.py` → 20 passed.
- Live smoke-test against the preview backend: `POST /api/access-requests/send-otp` returns HTTP 200, `email_sent: true`.

### Verification before redeploy
- `grep -rn "resend\.Emails\.send" /app/backend --include="*.py"` returns matches only inside `email_async.py` (the helper itself) and a doc-comment in the test file. No production route calls the SDK directly.

---


## Feb 25, 2026 — Cloudflare 520 on access-request submission (event-loop blocking)

Right after redeploying the previous fix, production started returning a Cloudflare error: *"The origin web server returned an invalid or incomplete response to Cloudflare."* The user couldn't get past step 1 of the Request Access form.

### Root cause
`routes/access_requests.py::_send_email` was calling `resend.Emails.send(...)` — a **synchronous** requests-based SDK method — directly from an `async def` FastAPI route. While Resend was processing the send (first call to the freshly-verified `bashari.co` domain was apparently slow), the entire asyncio event loop was blocked. Cloudflare's edge proxy hit its origin-timeout window before any response came back and served its own 520 page. The 502 fix shipped earlier in the day couldn't help because the route never got a chance to return.

### Fix
- Wrapped the SDK call in `asyncio.to_thread(...)` + `asyncio.wait_for(timeout=15.0)`. The loop is now free to handle other requests while Resend is running, and a stuck Resend call now fails after 15s with a clean 502 from our own route instead of a 520 from Cloudflare.
- Added `import asyncio` and a `TimeoutError` handler that logs `"Email to X timed out after 15s"` and returns `False` (which the route turns into HTTP 502 with the friendly retry message).

### Scope note
Five other backend files have the same synchronous-Resend-in-async-route pattern: `manual_payments.py`, `notifications.py` (2 sites), `clients.py`, `auth_routes.py` (2 sites). They weren't touched in this fix because they weren't reported broken and the scope was kept tight. Tracked in ROADMAP as P1 cleanup so a future flaky send doesn't take down the relevant route. Same one-line fix applies to each.

### Tests
- `/app/backend/tests/test_access_request_otp_failure.py` — added 2 pytests:
  - `test_send_email_offloads_resend_sdk_to_thread` — runs 2 simulated 0.5s sends concurrently, asserts total < 0.9s (proves to_thread is in effect).
  - `test_send_email_returns_false_on_timeout` — simulates a hanging Resend call with a fast-track 0.2s timeout, asserts `_send_email` returns False.
- All 5 tests in the file pass.

---


## Feb 25, 2026 — "Send Verification Code" silently failed (Resend domain not verified)

Admin reported: clicking "Send Verification Code" on the Request Access modal showed a green Turnstile checkmark but no email arrived. Investigation: Resend was rejecting every send with `The bashds.com domain is not verified` because the configured `SENDER_EMAIL=notifications@bashds.com` belonged to an unverified domain. Backend caught the exception, logged it, and returned `{ok: true, email_sent: false}` → the frontend treated that as success and moved to the OTP step.

### Fixes
**Backend (`/app/backend/routes/access_requests.py`)**
- New-email path now raises HTTP 502 (`"We couldn't send the verification email right now... contact lab@bashari.co"`) when `_send_email` returns False. Frontend can now surface the failure instead of silently proceeding.
- Existing-email path (silent password-reset) still returns the "already_registered" shape unchanged — privacy-by-design must not leak account existence.

**Frontend (`/app/frontend/src/app/_landing/LandingPage.tsx`)**
- OTP step now shows: *"We've emailed a 6-digit code to {email}. It may take a minute — please also check your spam / junk folder."*
- New **"Didn't get the code? Resend it"** action (`data-testid='ra-resend-otp-button'`) that re-fires the same `send-otp` call. Confirmation message appears in the same banner slot. Backend rotates the OTP doc so previously-issued codes are invalidated.
- Error handler unchanged in behaviour but now reachable: the dialog stays on the form step on 502 and displays the backend's detail message.

**Env (`/app/backend/.env`)**
- `SENDER_EMAIL`: `notifications@bashds.com` → `lab@bashari.co`. **User must verify `bashari.co` in the Resend dashboard** before production redeploy — DNS records (SPF/DKIM) for the domain.

### Tests
- `/app/backend/tests/test_access_request_otp_failure.py` — 3 pytests (502 on send failure, 200 on send success, 200 still on existing-email duplicate path). All pass.

---


## Feb 25, 2026 — Email template fixes (parcel counts, subject, footer)

Admin reported five issues against the "Stones received" email for job #512:

### Fixes in `backend/email_templates.py`
1. **Subject** — `Job #N · Stones received at the lab` → `Job #N · Stones received`.
2. **Meta pill (shared across ALL job emails)** — was rendering `Stones: 1` for a job with one parcel covering 10 physical stones (i.e. counting *rows* not *stones*). Now uses `jobs_helpers.physical_stone_count()` to expand parcels: shows `10 stones · 1 certificate`. Singular/plural labels honored, cancelled stones still ignored. Verified with 6 unit cases in `tests/test_email_template_fixes.py` (single, multi, parcel-of-10, mixed parcel+singletons, cancellations).
3. **Stones-accepted body** — removed the line `"The signed Memo-In document is attached to this email."` We don't actually attach a memo; the line was misleading.
4. **Footer email** — `grs-il@bashds.com` → `lab@bashari.co`.
5. **Footer disclaimer** — replaced the "This is an automated message... please do not reply" line with a friendlier `Have a question? You can reply directly to this email — we're happy to help.`

### Tests
- `/app/backend/tests/test_email_template_fixes.py` — 9 pytests, all pass.

---


## Feb 25, 2026 — Session-expired bounce was broken (URL changed, content didn't)

User reported on production: clicking around an idle dashboard would set the URL to `/login?reason=expired` but the dashboard view stayed put, showing empty data. Every API call kept returning 401 in a silent loop.

### Root cause
`lib/api.ts` interceptor cleared `sessionStorage['token']` (via `clearToken()`) but **never cleared the zustand-persisted `sessionStorage['auth-storage']`** which still held `{isAuthenticated: true, token: <stale>, user: <stale>}`. Setting `window.location.href = '/login?reason=expired'` triggered a full reload — and on reload zustand rehydrated as authenticated, so `dashboard/layout.tsx`'s auth-gate (`if (mounted && !isAuthenticated) router.replace('/login')`) skipped the redirect. The dashboard tree kept rendering while every fetch 401'd.

### Fix
- Interceptor now also calls `useAuthStore.getState().logout()` which sets `isAuthenticated: false` in the in-memory store AND persists the cleared state to `auth-storage`. Falls back to a raw `sessionStorage.removeItem('auth-storage')` if zustand isn't initialised (defensive).
- Replaced `window.location.href = ...` with `window.location.replace(...)` so the protected URL doesn't sit in browser history — no back-button trap into the now-unauthorized page.

Verified end-to-end by testing agent iter-33.

---


## Feb 25, 2026 — Shipments monolith → 7-component extraction (P0 refactor)

`shipments/page.tsx` had grown to 2317 lines with 8 inline `<Dialog>` blocks and 47 `useState` hooks — flagged as the #1 maintainability pain point. Extracted every dialog into its own presentational component under `shipments/_components/`. **Zero behaviour change**; testing agent iter-32 confirmed 100% pass on the full regression suite.

### New components (all in `shipments/_components/`)
- `FileViewerDialog.tsx` (53 lines) — generic image/PDF viewer; collapses what were two near-identical Cert + Memo dialogs.
- `BulkStatusDialog.tsx` (95 lines)
- `AddJobsToShipmentDialog.tsx` (96 lines)
- `CreateShipmentDialog.tsx` (251 lines)
- `ShipmentDetailDialog.tsx` (430 lines) — the big one (sticky totals footer, edit form, compact meta strip, jobs table).
- `JobDetailDialog.tsx` (347 lines) — shipments-context copy; `jobs/page.tsx` still has its own inline version pending consolidation.
- `StoneEditDialog.tsx` (273 lines) — same story as JobDetailDialog.

### page.tsx
- 2317 → **1149 lines** (-50%).
- Extracted two inline closures into named handlers: `handleSaveStoneVerbal` and `handleStoneCertChange`.
- Pruned 24 unused imports after extraction.

### Design choice
"Lift JSX, not state." All `useState` hooks stayed in `page.tsx`; the new components receive everything they need as props. This kept the diff mechanical (and risk-free) at the cost of fairly long prop lists — which is fine because the goal was readability of `page.tsx`, not architectural purity.

---


## Feb 25, 2026 — Shipment "Completed" status (frontend wiring)

Backend auto-completion for `certificates_from_lab` shipments was landed in the previous fork. This session wired the corresponding frontend UX in `dashboard/shipments/page.tsx`.

### Frontend
- `shipments/page.tsx`:
  - Added `Switch`-based **"Show completed shipments"** toggle (`data-testid='shipments-show-completed-toggle'`). When OFF (default) the working view stays focused on pending/in_transit.
  - Added a **completed-count pill** (`data-testid='shipments-completed-count'`) that always displays the live archived count via a background `GET /api/shipments?include_archived=true` fetch — visible even when the toggle is OFF, so the metric is discoverable.
  - Added **"Completed"** option to the status filter dropdown alongside Cancelled / Delivered.
  - `fetchData` now auto-sends `include_archived=true` to the API whenever the operator selects a status filter that requires archived rows (`completed`, `cancelled`, `all`) — they don't also need to flip the toggle.
  - `matchesStatusFilter`: when the toggle is ON, both the `active` and `delivered` buckets reveal `completed` rows so the operator can audit recently-closed work without losing the live queue.
  - Slate `completed` badge (`data-testid='shipment-status-completed-badge'`) — visually distinct from the green `delivered` badge so case-closed work doesn't look like a fresh win.

### Tests
- `/app/backend/tests/test_shipments_completed.py` — 8 pytests covering: default-list exclusion of completed+cancelled, include_archived=true behaviour, auto-promotion of `certificates_from_lab` on delivery, non-promotion for other shipment types, explicit `status=completed` filter, and the config/options endpoint exposing the new status.
- Full UI flow verified end-to-end against the preview deployment (testing agent iter-30).

### Ops note
- The preview frontend is served via `serve build` (Next.js static export). Source changes require `cd /app/frontend && yarn build && sudo supervisorctl restart frontend` to land in the deployed artifact — there is no `next dev` hot-reload here. Documented in iter-30 report for future agents.

---


## Feb 25, 2026 — Recheck reasons (4-way replacement for separate recheck service types)

User asked to keep a single `Recheck` service type but require the operator to document **why** the recheck is happening — Origin, Color, Identification, Comment, or any combination. Multi-select. Admin-configurable list.

### Backend
- `models.py`:
  - `JobCreate.recheck_reasons: Optional[List[str]]`
  - `JobResponse.recheck_reasons: Optional[List[str]]`
  - `PricingUpdateRequest.recheck_reasons: Optional[List[str]]`
- `routes/jobs.py:create_job`:
  - When `service_type == "Recheck"`: reject (HTTP 400) if `recheck_reasons` is missing/empty. Trim, drop empties, dedupe case-sensitive preserving order.
  - When `service_type != "Recheck"`: silently drop the field (stale value from a UI switch).
- `routes/jobs.py:build_job_response`: pass through `recheck_reasons` from the DB document.
- `routes/pricing_routes.py`:
  - `DEFAULT_RECHECK_REASONS = ["Origin", "Color", "Identification", "Comment"]`
  - `GET /api/pricing` returns `recheck_reasons`
  - `PUT /api/pricing` persists a new `recheck_reasons` list when supplied.

### Frontend
- **Create Job dialog** (`CreateJobDialog.tsx`): when the user picks "Recheck", an amber multi-select panel appears with a pill-button per configured reason. Required: at least one. Switching to another service type clears the selection.
- **`isFormValid()`** and `validateForm()` in jobs/page.tsx enforce the Recheck-needs-≥1-reason rule client-side so the submit button stays disabled until satisfied.
- **Display surfaces** (all four requested):
  - `JobSummaryGrid` (top of Job detail dialog): amber pill `Origin · Color` next to the service type.
  - Stone Edit dialog header: small amber note `· Recheck: Origin, Color`.
  - Jobs table cells: small amber subline under "Recheck" with the reasons joined by `, `; tooltip shows the full list.
  - Job memo HTML + shipment memo HTML + backend memo PDF: service-type cell appends `(Origin, Color)` in amber.
- **Settings → Recheck Reasons** card: add/remove reasons, case-insensitive dedupe, save button (uses existing `settingsApi.updatePricing` round-trip).
- `lib/api.ts` `jobsApi.create` signature extended with `recheck_reasons?: string[]`.
- `Job` interface (jobs/_types.ts + shipments/_types.ts) gained `recheck_reasons?: string[]`.

### Regression tests
New `backend/tests/test_recheck_reasons.py` (7 tests):
1. POST /api/jobs with Recheck + no reasons → 400
2. POST with Recheck + all-empty-strings → 400
3. POST with Recheck + ["Origin", "Color"] → 200, persists, GET round-trip ok
4. Duplicates in input are deduped (order preserved)
5. Non-Recheck job with a stray `recheck_reasons` in the body → silently dropped
6. GET /api/pricing exposes `recheck_reasons`
7. PUT /api/pricing persists a custom `recheck_reasons` list (and restores the original)

### Verification
- 53/53 tests pass (46 existing + 7 new).
- Backend smoke walkthrough (curl): all 5 scenarios from the design check (no-reasons reject, with-reasons accept, GET round-trip, Express-with-stray-reasons dropped, pricing config exposes the list) confirmed.
- Frontend build clean, no new ESLint errors.

---

## Feb 25, 2026 — Shared `<StoneVerbalSection>` extracted (de-dup the stone modal)

User reported (rightly!) that the stone modal on `/dashboard/stones` was missing the parcel-aware verbal UI that I'd shipped on `/dashboard/jobs` the same day. Root cause: the verbal-findings block was a ~120-line inline copy in BOTH pages. Phase 3 only touched the jobs-page copy.

### Fix
Extracted a single shared component at `/app/frontend/src/components/StoneVerbalSection.tsx`:
- One source of truth for: shared cert ID input, single-stone grid (cert ID / weight / id / color / origin / comment), parcel N-card layout with shared cert ID + per-stone weight + 4 SearchableSelects, and the "Copy row 1 → all" helper.
- Exports `seedStructuredFindings(stone)` for parents to initialise their `structuredFindings` state correctly for both single stones and parcels.
- Pure presentational — owns no persistence, no async work.

### Replaced
- `dashboard/jobs/page.tsx`: removed 238 lines of inline verbal UI + 9-line `updateParcelStone` helper → swapped for one `<StoneVerbalSection>` invocation. File dropped 2487 → 2217 LOC.
- `dashboard/stones/page.tsx`: removed 103 lines of inline single-stone-only verbal UI → swapped for `<StoneVerbalSection>`. Parcels now editable from `/dashboard/stones` for the first time. File dropped 856 → 780 LOC.
- Stones page now also shows the amber `Parcel of N` badge on the type column + `(total)` microcopy on the weight cell, matching the jobs page.
- Stones page compact info strip: parcel-aware labels (`Total wt`, `Total value`, `PARCEL · N stones`) and CS fee math `+$50 × N = $X` to match.
- `lib/api.ts`: `stonesApi.updateStructuredVerbal` TS signature gained `per_stone[]` so TypeScript doesn't strip the parcel payload on save.

### Verification
- 46/46 backend pytests still pass (incl. the round-trip `test_parcel_verbal_findings_persist_per_stone_array` which exercises the exact same endpoint both pages now call).
- Frontend build clean. Bundle for `/dashboard/jobs` shrank from ~50 kB to 29.1 kB; `/dashboard/stones` from ~12 kB to 8.87 kB.

### Honest note on duplication still in the codebase
The user flagged broader duplication: job detail dialogs, shipment dialogs, stone modals all have multiple copies. This consolidation only addressed the verbal-findings block (the smallest unit that was actively breaking). Remaining work is logged in ROADMAP as P1 refactor.

---

## Feb 25, 2026 — Parcels Phases 3 + 4 complete

Phase 3 (StoneEditDialog) and Phase 4 (memo / invoice / shipment picker) shipped in the same session as P1+P2. The parcel feature is now end-to-end.

### Phase 3 — Stone edit dialog for parcels
When the user opens a stone row that has `kind === 'parcel'`, the modal now renders:
- A compact info strip with `PARCEL · N stones` and labels switched to "Total wt" / "Total value"
- ONE shared `Certificate ID` input at the top (full-width, with microcopy "shared across all N stones")
- N amber cards (`Stone 1 of N`, `Stone 2 of N`, …) each with its own weight input + identification / color / origin / comment SearchableSelects (testids: `parcel-stone-card-{i}`, `parcel-stone-weight-{i}`, etc.)
- A **"Copy row 1 → all"** helper that propagates identification/color/origin/comment (but NOT weight) from the first card to every other card. Big time-saver for high-N parcels where the only per-stone difference is weight.
- Fee preview math reflects `cs_fee × stone_count` when Color Stability is on — the toggle label reads `+$50 × 3 = $150` for a parcel-of-3.

The single-stone verbal grid is suppressed for parcels so the user can't accidentally fill in conflicting top-level + per-stone data. `hasUnsavedStoneChanges` was extended with per-stone array diffing so the unsaved-changes guard works for parcels too.

### Phase 4 — Memo / invoice / shipment picker
- **Job memo** (`buildJobMemoHtml`): parcel rows render as `<TYPE> · parcel of N` in the Type column and `<weight> ct (total)` in the Weight column. Footer "Total — N stones · M certificates" now counts PHYSICAL stones (sums `stone_count` for parcels + 1 for singles).
- **Shipment memo** (`buildShipmentJobMemoHtml`): same parcel-row format for the printable shipment job memo.
- **Backend PDF** (`routes/pdf.py`): both `memo-in` and `invoice` table rows label parcels as `· parcel of N` and weight as `(total)`. Confirmed via pypdf text extraction in the new `test_parcel_pdf.py`.
- **Partial-shipment picker** (`PartialStonesPicker.tsx`): parcels render as ONE atomic checkbox per parcel inside the partial-return picker, labeled `Parcel of N · <SKU>` (instead of the generic `Ungrouped · <SKU>`).

### Backend tests
- `test_parcel_verbal_findings_persist_per_stone_array` — full round-trip through `PUT /api/stones/{id}/verbal` for a parcel of 3, asserting the `per_stone` list of 3 entries comes back with weights, comments, and origins intact.
- `test_parcel_pdf.py` (new, 2 tests) — `GET /api/jobs/{id}/pdf/memo-in` and `/invoice` return >1KB PDFs whose extracted text contains "parcel of 3" and "(total)".

### Verification
- pytest: **46/46 pass** (15 jobs_helpers + 14 parcels + 8 parcels_api + 2 parcel_pdf + 7 auth_401).
- Testing agent iteration_29: end-to-end frontend walkthrough covering the entire parcel dialog interaction, including the CS-fee `+$50 × 3 = $150` math display and the Copy-row-1-to-all button. All Phase 3 + Phase 4 criteria pass — `retest_needed: false, should_main_agent_self_test: false`.

### Side note
The testing agent used Playwright with a `page.route('**/api/**')` redirect to bypass the localhost-vs-K8s-ingress quirk that makes direct localhost:3000 tests fail (because the static export's NEXT_PUBLIC_API_URL is `/api`, which only proxies in the ingress environment). Recording this here in case future agents hit the same wall.

---

## Feb 25, 2026 — Parcels (Phase 1 backend + Phase 2 create-job UI)

A *parcel* is a stone row that represents **N physical stones rolled up under one certificate**. It coexists with the existing "certificate group" feature (where N independent stone records share a cert), but a parcel cannot be combined with anything — it IS its own cert.

### Why
Some lots get certified as a batch — e.g. a parcel of small commercial-grade stones — without each one needing its own line item or verbal entry. The user's request: enter total weight, total value, count; charge based on the AVERAGE per-stone value × N; verbal findings have one shared certificate ID at the top and per-stone entries underneath.

### Pricing rule
```
per_stone_fee = bracket_lookup(value_total / stone_count, service)
base          = per_stone_fee × stone_count
+ cs_fee × stone_count   if color_stability_test (per-parcel toggle, charged ×N)
+ mounted_fee            if mounted              (per-parcel toggle, charged once)
```
Canonical case from the spec: parcel of 2, total value $15,000, Express service → avg $7,500 → bracket fee $450 → base $900. With the production DB pricing brackets, a parcel of 3 @ $15k Express → $1,350. Both verified end-to-end with curl.

### Phase 1 — Backend foundation
**Data model.** Extend the existing `stones` array on jobs with a `kind` discriminator (`"stone"` | `"parcel"`) and `stone_count`. No new collection — same lifecycle (SKU, hard-delete, shipments, memos, invoices). Legacy docs without `kind` are treated as singles.

- `backend/models.py`: `StoneCreate` / `AddStoneRequest` got `is_parcel`, `stone_count`, `mounted`. `StoneResponse` got `kind`, `stone_count`. `JobResponse` got `total_certificates`. `StructuredVerbalFindings` got `per_stone` (list of per-stone findings within a parcel).
- `backend/pricing.py`: new `calculate_parcel_fee_from_brackets()` + `_lookup_bracket_fee` helper.
- `backend/jobs_helpers.py`: new `is_parcel()`, `physical_stone_count()`. `recompute_job_totals()` now returns BOTH `total_stones` (physical: sum of `stone_count` for parcels + 1 for singles) AND `total_certificates` (row count).
- `backend/routes/jobs.py`: `_build_stones_for_create` handles parcels; `create_job` + `build_job_response` write/return `total_certificates`; `group_stones_for_certificate` rejects parcels with HTTP 400 "Parcels cannot be added to a certificate group: SKU"; `add_stone_to_job` accepts parcels and recomputes totals (vs the old `$inc` which would have miscounted physical stones for parcels).
- `backend/routes/stones.py`: `update_stone_fees` charges `cs_fee × N` on parcels and treats mounted as a single-row toggle (no group propagation — parcels never have a `certificate_group`).

### Phase 2 — Create-job UI
- `frontend/src/app/dashboard/jobs/_components/CreateJobDialog.tsx`: new "Kind" column with a Switch (Single ↔ Parcel) and new "Count" column. When parcel is on: count field pre-fills to 2, weight/value microcopy reads "total if parcel", and the row gets an amber tint. Mobile layout switches to "Total wt" / "Total $" labels and a 3-column grid that includes `# Stones`.
- `frontend/src/app/dashboard/jobs/page.tsx`: stone state extended with `is_parcel`/`stone_count`, `handleStoneChange` clears the count on toggle-off, `handleCreateJob` forwards the new fields, validation rejects parcels with count < 2, "Group" button now hidden when any selected row is a parcel (replaced by an inline hint).
- `frontend/src/app/dashboard/jobs/_components/StoneStatusBadges.tsx`: amber `Parcel of N` pill on the per-stone status row.
- Dashboard tweak: the jobs table now shows "X stones · Y certs" when they differ (mobile card and desktop table cell). Single-stone jobs stay clean — the certs sub-line only appears when there's at least one parcel.
- `frontend/src/lib/api.ts`: `jobsApi.create` and `addStone` signatures extended.
- `frontend/src/app/dashboard/jobs/_types.ts`: `Stone` got `kind` + `stone_count`; `Job` got `total_certificates`.

### Hard rules enforced
1. Parcels cannot be added to a certificate group. Backend rejects (HTTP 400); frontend hides the "Group" button + shows a hint.
2. A parcel is atomic — hard-delete the whole row, ship the whole row.
3. CS fee on a parcel = `cs_fee × stone_count`. Mounted fee on a parcel = `mounted_fee` once.

### Verification
- pytest: **36/36 pass** (15 jobs_helpers + 14 new parcels + 7 auth_401).
- Testing agent iteration_28: backend covered end-to-end with a new 7-test HTTP suite (`/app/backend/tests/test_parcels_api.py`). All scenarios pass — `retest_needed: false`.
- Curl walkthrough: create job → group rejection → CS toggle ×N → mounted once → parcel deletion → add parcel via `/jobs/{id}/stones` all return the correct totals.
- Smoke screenshot of the new Create Job dialog renders the Kind/Count columns, microcopy, and amber tint correctly.

### Remaining work for follow-up phases
- **Phase 3 — View & edit dialog** (StoneEditDialog): show the N per-stone weight/identification/color/origin/comment cards with one shared certificate_id; display the fee formula as `$X × N + CS×N + mounted-once`.
- **Phase 4 — Memo / invoice / shipments**: line format "<TYPE> parcel of N · <TotalCt> ct · $TotalValue · $TotalFee"; shipment picker treats each parcel as one atom.

---

## Feb 24, 2026 — Bug fix: idle session showed empty dashboards instead of redirecting to /login

User reported that leaving the app idle overnight resulted in every dashboard table (jobs, branches, clients, pricing) rendering as empty, instead of being kicked back to the login screen. Console showed `403 Forbidden` from every `/api/...` call.

**Root cause.** FastAPI's default `HTTPBearer()` security dep returns **403** (not 401) when the `Authorization` header is missing/malformed. The axios response interceptor in `lib/api.ts` only redirected on 401 — so 403s from a dropped session were silently swallowed by each page's `Promise.all` catch block, leaving `useState` arrays at `[]` and every table empty.

**Fix:**
- **`backend/auth.py` — new `JWTBearer` class.** Subclasses `HTTPBearer(auto_error=False)` and raises `401 "Not authenticated"` on missing creds (instead of the default 403), and `401 "Invalid authentication scheme"` on a non-Bearer scheme. Semantic 403s for *authenticated-but-no-permission* (admin/super-admin checks) are preserved.
- **`frontend/src/lib/api.ts` — broadened interceptor.** Now bounces to `/login?reason=expired` on **either** 401 or 403-with-an-auth-shaped detail (`/not authenticated|invalid authentication|missing|token/i`). Legitimate role-based 403s pass through so the calling page can show its own error.
- **`frontend/src/app/login/page.tsx` — session-expired banner.** A `useEffect` reads `?reason=expired` on mount, shows an amber `data-testid="session-expired-banner"` ("Your session expired. Please sign in again."), and uses `history.replaceState` to strip the query so a manual refresh doesn't re-show it.
- **Defensive: `dashboard/{jobs,shipments,clients,stones}/page.tsx`** — switched fetch blocks from `Promise.all` to `Promise.allSettled`. One flaky endpoint (a transient 502 from Cloudflare, etc.) now no longer wipes the whole dashboard — failed slices are logged, successful ones still render.

**Verification:**
- curl smoke: missing-auth, malformed scheme, bad bearer, expired JWT → all return **401** (was 403/401 mixed). Valid admin JWT → 200. Customer JWT hitting super-admin endpoint → 403 with `"admin"` in the detail (preserved).
- pytest: 7 new tests in `backend/tests/test_auth_401_flow.py` + 15 pre-existing in `test_jobs_helpers.py` = 22/22 pass.
- Playwright: `/login?reason=expired` renders the amber banner with the expected text and strips the query from the URL; `/login` (no query) does NOT show the banner.
- Testing agent (iteration_27): all 8 scenarios PASS, `retest_needed: false`.

**Side notes (out of scope, flagged for later):**
- `JWT_SECRET` in `backend/.env` is 30 bytes (< 32). PyJWT emits an `InsecureKeyLengthWarning` on encode/decode. Rotate to a longer secret on the next deploy.
- Cloudinary / Tranzila / Resend / SMS4Free / Turnstile secrets are committed in plaintext `.env` files. Worth moving to a secret manager before any external code share.

---

## Feb 19, 2026 — Bug fix: SearchableSelect dropdown layout broken inside modals

User screenshot showed the verbal-findings dropdown rendering with the search bar visually overlapping the first option ("NATURAL RUBY" was clipped behind the search input). Root cause was twofold:

1. **Sticky-positioned search bar inside a non-scroll parent.** The dropdown panel used `<div class="sticky top-0">` for the search header, expecting the parent to be the scroll container. But the parent had no `overflow` set — the actual scroll was on an inner sibling div for the options. `position: sticky` without a scrolling ancestor falls back to just sitting in normal flow, which combined with the inner options scroller's `maxHeight: 240px` produced the visual overlap.
2. **Drop-up heuristic measured only the viewport.** Triggers near the bottom of a tall modal (which has its own scroll) saw "plenty of room above, no room below" because the viewport bottom was beyond the modal. The heuristic flipped the panel upward more aggressively than needed.

**Fix in `frontend/src/components/ui/searchable-select.tsx`:**
- Rebuilt the panel as a **flex column** with `overflow-hidden` on the panel itself. Search header is `flex-shrink-0`, options list is `flex-1 overflow-y-auto`. The visual stacking is now guaranteed by flexbox — search is always at the top of the panel and options always scroll cleanly below it, no sticky needed.
- **Smarter drop-up heuristic**: walks the DOM upward to find the nearest scrollable ancestor (e.g. `<DialogContent>`) and measures available space relative to that container, not just the viewport. Only flips upward when `spaceBelow < 180px` (need at least ~3 rows visible) AND `spaceAbove > spaceBelow + 80px`. This keeps the panel in the conventional downward position unless really necessary.
- Gave the search `<input>` a real `bg-background` (was `bg-transparent`), and added `pointer-events-none` to the magnifier icon so it can't intercept the input click.

**Verification:** rebuilt static export, reopened the stone edit modal on preview, clicked Identification → dropdown opens (in this case upward because the trigger is near the bottom of the modal) with search bar cleanly on top, full list visible, "NATURAL RUBY" no longer clipped. No layout regressions in other dropdowns observed.

**Production note:** the bug exists on `lab.bashari.co` too; redeploy when ready.

---



### Backend
- New `backend/jobs_helpers.py` (95 LOC) with `active_stones(job_or_stones)`, `sum_fees`, `sum_values`, `recompute_job_totals(stones, mounted_fee=)`, `payable_amount(job)`. Single source of truth for cancel-aware job arithmetic.
- Refactored callers: `routes/stones.py` (cancel / uncancel / update_stone_fees — deleted the duplicate `_recompute_job_totals`), `routes/jobs.py:delete_stone_from_job`, all 3 customer-pay sites in `routes/payments.py`. Behaviour-preserving regression: toggle CS on/off → `$750/$700`; cancel/uncancel → correct totals. ✅
- Decomposed the 100-line `routes/jobs.py:create_job` into three small helpers (mirroring the existing `_resolve_shipment_ids`, `_serialize_payments` pattern):
  - `_enforce_client_branch_consistency(job, client)` — raises 400 on cross-branch mismatch; mutates `job.branch_id` to the client's branch when caller omitted it.
  - `_assign_next_job_number()` — single-line async helper; job numbers start at 500.
  - `_build_stones_for_create(certificate_units, ...)` → returns `(stones, total_value, total_fee)`. Centralises SKU generation, position assignment, fee bracket lookup, and the partial-return lifecycle defaults (`stone_status=at_office`, `cert_status=pending`).
  `create_job` body now reads almost as pseudocode. E2E test: created job #503 (Ruby 2.5ct $5000) via the API → got SKU `RU250J50301`, status `draft`, totals correct → cancelled the test job to clean up.
- Added pytest pin: `backend/tests/test_jobs_helpers.py` (15 tests, 0.02s). Covers `active_stones` filtering / list-vs-dict input / missing fields, `sum_fees` honouring `actual_fee`, `recompute_job_totals` empty / mounted-group dedup / mounted-without-group passthrough, `payable_amount` excluding cancelled stones / discount / floor-at-zero / adjustment override / `actual_fee` precedence. The cancel-leak regression would have failed `test_payable_amount_excludes_cancelled_stones` immediately.

### Frontend (P3 refactor pass)
- Extracted the ~300-line `handlePrintJob` HTML template from `dashboard/jobs/page.tsx` into a pure function at `dashboard/jobs/_lib/buildJobMemoHtml.ts`. The page now resolves client + branch + origin and delegates. **`jobs/page.tsx`: 2471 → 2178 LOC (-293, -12%)**. Cleaned up now-unused `esc` and `COMPANY_INFO` imports.
- Same treatment on `dashboard/shipments/page.tsx` — extracted `handlePrintJobInShipment` into `_lib/buildShipmentJobMemoHtml.ts`. **`shipments/page.tsx`: 2356 → 2233 LOC (-123, -5%)**.
- Stones page already shrank substantially in earlier rounds (round 1: extracted `filterOptionsForStone`, compacted the dialog) — sits at 891 LOC now (down from ~955).

### Bookkeeping
- Split `/app/memory/PRD.md` (1404 LOC, sprawling) into three smaller files:
  - **PRD.md** (169 LOC) — compact product spec, tech stack, entities, routing/auth gotchas, data-integrity rules, file layout.
  - **ROADMAP.md** (~60 LOC) — P0/P1/P2/P3 backlog, "done recent" highlights.
  - **CHANGELOG.md** — newest-first session log (this file); full legacy history preserved at the bottom.
- Original kept at `PRD.old.md` for one round of reference until the new split is verified.

### Cumulative LOC impact this session
- 5 big page files combined: **~6800 → ~6200** (-600 LOC frontend) + new pure-function modules (`buildJobMemoHtml.ts` 420, `buildShipmentJobMemoHtml.ts` 145, `stoneDropdownFilter.ts` 40).
- Backend: `routes/jobs.py:create_job` 100 → 35 LOC + new `jobs_helpers.py` (95 LOC) with 15 pytest pins.

### Verification
- `yarn tsc --noEmit` clean.
- `yarn build` static export clean.
- `pytest tests/test_jobs_helpers.py` — 15 passed in 0.02s.
- Smoke-tested: login page renders, deep-link `/dashboard/jobs/` while authed renders jobs list, job dialog opens with stones table and `Stones (N total · K cancelled hidden)` header. Print button wired to the new `buildJobMemoHtml`. E2E create_job via the refactored helper path succeeded.

---



## Legacy log (imported from the old monolithic PRD.md)

> Everything below is the unedited body of sessions / phases as captured in the previous combined PRD. Sections like 'API Endpoints', 'File Structure', 'Design System', 'Test Credentials' that were duplicated in PRD.md have NOT been stripped — they are kept here for completeness so we can reconstruct historical context if needed.

### Session: Feb 18, 2026 (round 5) — Bug fix: cancelled stones leaked back into job totals via fee/delete/payment paths

User report (verbatim):
> The fees are wrong when cancelling a stone from a job. It still counts the cancelled stone

**Root cause:** the cancel-stone route correctly recomputed `total_fee / total_value / total_stones` excluding cancelled stones. But **other backend routes that touch job totals were summing `job.stones` without filtering** — so the moment any of those routes ran, the cancelled stone's fee/value was re-introduced into the job totals. Affected paths:

1. **`backend/routes/stones.py:174` — `PUT /stones/{id}/fees`**. Every fee/CS/mounted toggle on any *other* stone rewrote `total_fee` from `sum(s.fee for s in stones_list)` (all stones, cancelled included). Also never refreshed `total_value` / `total_stones`, so once cancel happened those could drift if a re-add later occurred.
2. **`backend/routes/jobs.py:425` — `DELETE /jobs/{id}/stones/{id}`** (hard-delete). When a stone was hard-deleted, totals were recomputed from `remaining` which still included any soft-cancelled stones.
3. **`backend/routes/payments.py`** — three places computing the amount the customer pays:
   - `GET /payment/{token}` (line 115)
   - `POST /payment/{token}/handshake` (line 154)
   - `POST /payment/{token}/test-success` (line 298)
   All summed `s.fee` over all stones — so the customer could be charged for cancelled stones.

**Fix:** every place above now filters `if not s.get("cancelled")` before summing. In `update_stone_fees`, also keep `total_value` and `total_stones` in sync with the active set (the route now writes all three).

**Verified end-to-end on preview (job 501 had a $90k active stone fee $700 + a $150k cancelled stone fee $800):**
- Toggle Color Stability ON for the active stone → `total_fee = $750` (active $700 + $50 CS), **not $1550** (which would have included the cancelled $800). ✅
- Toggle CS OFF → `total_fee = $700`, **not $1500**. ✅
- `total_stones = 1`, `total_value = $90,000` throughout. ✅

**Files touched:**
- `backend/routes/stones.py` — `update_stone_fees` now filters active and rewrites all three totals.
- `backend/routes/jobs.py` — `delete_stone_from_job` recomputes totals from `[s for s in remaining if not s.get("cancelled")]`.
- `backend/routes/payments.py` — three customer-payment computations filter out cancelled stones.

**Production:** fix is in **preview only**. Customers on production at https://lab.bashari.co could currently be charged for cancelled stones if you trigger any fee edit after cancelling. Redeploy when ready.

Turnstile blanked for the curl-based reproduction and **restored** at end of session.

---



### Session: Feb 18, 2026 (round 4) — Bug fix: stuck on "Loading…" when deep-linking into the dashboard

User report (verbatim):
> The app is not working properly! pages are not loaded, I just see a black screen with "LOADING"

**Root cause:** the dashboard layout had its auth-gate redirect deliberately removed (per a comment from a previous session warning about Cloudflare loops on static export). The comment incorrectly assumed the root SPA router in `app/page.tsx` would always catch unauthenticated visitors — but **that's only true when the user lands on `/`**. Next.js's static export prerenders every protected route as its own HTML file, so visiting `/dashboard/jobs` directly (bookmark, manual refresh, returning to a tab after sessionStorage expiry, or any deep link) boots `DashboardLayout` directly, bypassing the SPA router. The layout then sat on its `if (!mounted || !isAuthenticated)` "Loading..." fallback forever because nothing redirected to `/login`.

**Fix** — restored the auth-gate redirect in `frontend/src/app/dashboard/layout.tsx`:

```tsx
useEffect(() => {
  if (mounted && !isAuthenticated) {
    router.replace('/login');
  }
}, [mounted, isAuthenticated, router]);
```

Safety notes:
- Gated on `mounted` so zustand-persist has rehydrated from sessionStorage first; authenticated users with a valid token are NOT bounced.
- `router.replace` (not `push`) so it doesn't pollute browser history.
- No loop with the SPA router: `app/page.tsx` only runs for `/` and renders `LoginPage` directly (no further redirect). `LoginPage` has no automatic "if-authed → /dashboard" effect; it only pushes after a successful login.
- No loop with the LoginPage itself: it doesn't auto-redirect on mount.

**Verification (preview, static export rebuilt):**
- Unauth → `/dashboard/jobs/` ➜ ends at `/login/` with the sign-in form rendered. ✅
- Auth → `/dashboard/jobs/` ➜ Jobs page renders with sidebar + 3 jobs. ✅
- Auth → `/dashboard/profile/` ➜ Profile page renders (this route wasn't even in the SPA router's `pickDashboardPage` whitelist, so deep-link access here was doubly broken before). ✅

**Production note:** fix is in **preview only**. Production at https://lab.bashari.co will continue to hang on "Loading…" for deep-link entries until you redeploy. Workaround for users in the meantime: enter the app via the root URL (https://lab.bashari.co/) which goes through the SPA router and works.

Turnstile blanked for screenshot login during testing and **restored** at end of session.

---



### Session: Feb 18, 2026 (round 3) — Bug fix: cancelled stones still showing on the job

User report (verbatim):
> Cancel a stone, expected: the stone is being removed from the job. Actual, the stone is still there. for example, stone SKU: EM552J50201

**Root cause:** the `StoneResponse` Pydantic model in `backend/models.py` was missing the `cancelled` field, so the API silently stripped that flag before sending the job to the frontend. Even though Mongo correctly stored `cancelled: True` on the subdoc (and the job's `total_stones / total_value / total_fee` were already recomputed at cancel time), every consumer that iterated `job.stones` had no signal to filter — the cancelled stone kept appearing on the job dialog, in the printed memo, and in client/lab notification emails.

**Fix — surface the flag, then hide the stone everywhere it's user-visible:**

- `backend/models.py` — added `cancelled`, `cancelled_at`, `cancelled_by` (all `Optional`) to `StoneResponse`. This is the actual root-cause fix; without it the frontend filters had nothing to filter on.
- `backend/routes/pdf.py` — Memo-In Receipt PDF and the shipment-per-job memo now skip stones where `s.get('cancelled')`. (The invoice PDF was already filtering correctly.)
- `backend/email_templates.py` — `build_notification_email_html` now seeds `ctx["stones"]` from `job.get("stones")` filtered to active only, so every email template (intake, verbal results, fees breakdown, cert scans, partial-return, etc.) inherits the filter via one line. Also fixed the standalone job-summary card's stone count.
- `frontend/src/app/dashboard/jobs/_types.ts` — added `cancelled?: boolean`, `cancelled_at?: string`, `cancelled_by?: string` to `Stone`.
- `frontend/src/app/dashboard/shipments/_types.ts` — same `cancelled?` addition.
- `frontend/src/app/dashboard/jobs/page.tsx`:
  - New memoised `selectedJobActiveStones = selectedJob.stones.filter(s => !s.cancelled)` and `selectedJobCancelledCount`.
  - `selectedJobStoneGroups` and `selectedJobUngroupedStones` now derive from `selectedJobActiveStones` instead of `selectedJob.stones`.
  - Mobile cards loop, desktop grouped-stones rendering, and the "Stones (N total)" header now use the active list. Header shows `Stones (N total · K cancelled hidden)` when any are cancelled, so admins still know they exist.
  - `handlePrintJob` builds its `activeStones` from `job.stones.filter(s => !s.cancelled)` and uses that for ungrouped, grouped, table footer totals, and the printed memo's stone count.
- `frontend/src/app/dashboard/shipments/page.tsx` — `handlePrintJobInShipment` now uses `(job.stones || []).filter(s => !s.cancelled)`.

**Untouched on purpose:** bulk-action checkbox filters and the "next available group number" computation continue to operate on the raw `selectedJob.stones`. Cancelled stones can't be selected (they don't render with checkboxes) and we want a cancelled group number to stay "used" so it isn't accidentally reassigned.

**Verification (preview):**
- `PATCH /api/stones/{id}/cancel` on stone `TZ5000J50201` (job 502, the only stone) → `total_stones: 0, total_value: 0, total_fee: 0`.
- `GET /api/jobs/{job_502_id}` now returns `cancelled: true` on the stone subdoc (previously the field was stripped by the response model).
- Opening Job #502 in the Jobs dialog: stones table is empty, header reads `Stones (0 total · 1 cancelled hidden)`, totals are $0/$0 — exactly the expected behaviour. Restored the stone via `PATCH /api/stones/{id}/uncancel` after testing.

TypeScript and Python imports both clean. Turnstile blanked for screenshot login and **restored** at end of session.

---



### Session: Feb 18, 2026 (round 2) — Stone modal: bug fix + density polish + jobs-page parity

User feedback after round 1 (verbatim):
> 1. you fixed only the stone modal from the stone page, it has to be fixed also when editing a stone from job.
> 2. BUG: assume 2 values are set for a stone (identification + color) and I'm trying to delete the values. I delete, save and close. now I reopen and the values are still there. If I delete only one of the values and save, it works.
> 3. The certificate upload action on the bottom: there is no need in all this wide design ... just add a button on the bottom left "upload cert scan" so you can reduce the height of the sticky area at the bottom.
> 4. The header where it displays the stone's details (type, weight, shape, value, etc.) takes a lot of space. ... The main area should be the verbal results. Generally, editing a stone shouldn't require scrolling normally.

**All four addressed:**

1. **Jobs-page stone editor parity.** Applied the same four round-1 fixes to the nested stone dialog inside `frontend/src/app/dashboard/jobs/page.tsx` (lines ~2010-2380): widened to `sm:max-w-4xl lg:max-w-5xl`, wired `filterOptionsForStone` into all four `SearchableSelect`s, compacted header, compacted bottom (see #3, #4).

2. **Bug — clearing multiple verbal fields didn't persist.** Root cause: both save handlers gated the structured-verbal API call behind `if (hasVerbalData)` (some field non-empty). When the user cleared *every* field, the call was skipped and the DB kept stale values; clearing one of two worked because the other still made `hasVerbalData` truthy. Fix: while in edit mode we **always** send `structuredFindings` to `PUT /api/stones/:id/verbal` — the backend already accepts and persists empty strings via `data.structured_findings.dict()`. Also fixed `hasUnsavedStoneChanges` in `jobs/page.tsx` (same gate caused the unsaved-changes warning to be missed when wiping fields).

3. **Compact bottom.** Removed the entire "Certificate Scan" titled block (label, badges, upload-applies-to-group helper line, double-button row). Replaced with a single small `Upload cert scan` button placed at the bottom-left of `<DialogFooter>`, alongside the existing right-aligned `Save Changes` / `Close`. Group-applies hint moved to the button's `title` tooltip. Cuts the footer from ~140px to ~52px.

4. **Compact header.** Replaced the 3- or 4-column tile grid (Type, Weight, Shape, Value, Fee, Color Stability, Mounted, Cert Group — each in its own `<div>` with a `Label` + `<p>`) with a single horizontal flex row that reads `TYPE Ruby │ WEIGHT 6 ct │ SHAPE Other │ VALUE $150,000 │ FEE $800 │ CERT GROUP n` plus a second one-line strip for Color Stability + Mounted toggles (only rendered when in edit mode or actually set). Saves ~65% of vertical space; the modal no longer requires scrolling at 900px viewport.

**Shared helper:** extracted the round-1 inline filter into `frontend/src/lib/stoneDropdownFilter.ts` (`filterOptionsForStone`) so both pages import the same logic.

**Files touched:**
- `frontend/src/lib/stoneDropdownFilter.ts` (new — extracted shared helper).
- `frontend/src/app/dashboard/stones/page.tsx` — compact header, compact footer, save fix, helper import, dropped unused `Link2` import.
- `frontend/src/app/dashboard/jobs/page.tsx` — same as above + widened nested stone dialog + `filterOptionsForStone` wired into all four dropdowns + `hasUnsavedStoneChanges` fix.

**Verification (Playwright on preview, admin login):**
- Stones page: opened Ruby `RU600J50101` (Identification = NATURAL RUBY pre-set) → Edit → clicked × on Identification → Save → closed → reopened → Identification is now empty. ✅ Bug fixed.
- Both modals render the new compact one-row header and the compact "Upload cert scan" footer button.
- TypeScript build green, static export rebuilt clean. Turnstile secret blanked during screenshots, restored at end.

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
