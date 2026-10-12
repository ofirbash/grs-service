# Expected Verbal Results Tracking + Precious / Semi-Precious Shipment Memos

Each job gets an Expected Verbal Date, counted from the day it actually left for the lab plus its service type's turnaround, and admins see all jobs due on the same day in one place.
Shipment memos are split into a Precious document and a Semi-Precious document, based on a stone-type classification you control in Settings.

## Who it's for
- Super admins and branch admins who send stones to and from the lab, follow up on verbal results, and print shipment paperwork.
- Branch admins see only their own branch's jobs and shipments, the same as today.

## Core features and experience

### A. Expected verbal results
- **Turnaround days per service type (Settings)**
  - Each service type in Settings (Express, Normal, Recheck, and any added later, such as Priority) gets a "Turnaround (calendar days)" number.
  - Starting values are Express 8 and Normal 30. All other types start empty.
  - A service type with no turnaround set gives no expected date.
- **Expected Verbal Date per job (automatic)**
  - The date is the "Date sent" of the to-lab shipment carrying the job, plus the turnaround days of the job's current service type.
  - A job that hasn't been shipped to the lab yet shows "Not shipped yet".
  - The date recalculates automatically when any of these change:
    - the shipment's "Date sent"
    - the job's service type (for example Express → Priority)
    - the turnaround value in Settings
- **Manual override**
  - An admin can set a specific expected date on a job, for example after the lab announces a delay. The job then shows an "Adjusted" tag.
  - The override stays until it's cleared, and clearing it brings back the automatic date.
  - Every set, change and clear is recorded in the job's Activity Log as old date → new date, with who made it and when.
- **Dashboard panel "Expected Results"**
  - Jobs are grouped into **Overdue**, **Today** and **Next 7 days**. Next 7 days has one row per date, with a job count.
  - Each job line shows the job number, client, service type, stone count, shipment number and expected date.
  - Clicking a job opens it. Clicking a date opens the Jobs page filtered to that date.
- **Jobs page**
  - A new, sortable "Expected Results" column shows the date with Overdue (red), Today (amber) and Adjusted tags.
  - A new filter offers Overdue / Today / This week / Pick a date.
- **Leaving the list**
  - A job drops off the panel and the Overdue/Today views as soon as either of these happens:
    - its status moves to the verbal-results-received stage
    - the Verbal Results notification is sent
  - The date stays visible on the job afterwards.

### B. Precious / Semi-Precious shipment memos
- **Classification (Settings)**
  - Each stone type in Settings gets a "Precious" checkbox.
  - Ruby, Sapphire and Emerald are ticked to start. Every other type, including ones added later, is Semi-Precious unless it's ticked.
- **Split documents on one shipment**
  - A shipment stays a single record with one courier, one tracking number and one set of jobs. Only the printed full shipment memo is split.
  - The "Print" action on a shipment offers **Precious**, **Semi-Precious** or **Both**:
    - Precious and Semi-Precious each print one document.
    - Both prints the two documents back to back.
  - Each document has the same layout as today, with the category added to the title:
    - To-lab: "Shipment Memo – Gemstones – Precious" / "Shipment Memo – Gemstones – Semi-Precious"
    - From-lab: "Shipment Memo Return – Precious" / "Shipment Memo Return – Semi-Precious"
  - Each document lists only its own category's stones, with its own totals (stone count, total value, fees).
  - Each document lists only the jobs that have stones in that category, so a job with mixed stones appears on both documents.
  - If a shipment holds only one category, only that document is offered and printed.
- **Scope**
  - Applies to the full shipment memo in both directions.
  - Per-job memos printed from a shipment stay as they are today, with all of the job's stones.

## User flow
1. One-time setup in Settings:
   - set turnaround days per service type
   - tick which stone types count as Precious
2. Jobs are created as usual and show "Not shipped yet".
3. On Thursday, the admin creates the to-lab shipment with Date sent = Thursday and adds 5 jobs. Each job immediately gets its expected date (Express: Thursday + 8, Normal: Thursday + 30).
4. The admin clicks Print → Both and gets a Precious memo and a Semi-Precious memo for that shipment.
5. Each day after login, the dashboard shows Overdue, Today and the coming week. Today mixes old and new jobs that are all due the same day.
6. The admin opens a due job, enters the verbal findings and sends the Verbal Results notification. The job leaves the panel.
7. If the lab reports a delay, the admin sets an override date on the affected jobs, and the change is logged.
8. When stones come back, the return shipment's Print offers the Precious / Semi-Precious split again.

## UI/UX feel
- Fits the existing navy dashboard. The Expected Results panel is a compact card that stays quiet unless something is due.
- Colour is used only for urgency: red for Overdue, amber for Today.
- The "Adjusted" tag shows the original automatic date on hover.
- Print choices are a small menu on the existing Print button, with no extra screens.
- Category is shown clearly in each memo's title, and stays readable in black-and-white printing.

## Implementation phases
- **Phase 1 (MVP, built now)**
  - Turnaround days per service type in Settings
  - Automatic Expected Verbal Date with recalculation
  - Manual override, logged in the Activity Log
  - Expected Results dashboard panel
  - Jobs page column, sort and filter
  - Expected date shown in the job details
  - "Precious" checkbox per stone type in Settings
  - Split full shipment memo (Precious / Semi-Precious / Both) in both directions
- **Phase 2**
  - Optional daily morning email to admins listing today's and overdue jobs
  - Bulk override: set one new date for every job in a shipment at once
  - Precious/Semi-Precious counts shown on the shipments list and in the shipment details
- **Phase 3**
  - Expected date shown to customers in their portal and in the "sent to lab" notification
  - Lab turnaround performance stats per service type
  - Optional category split for per-job memos and email attachments

## Assumptions
- Days are calendar days, so weekends and holidays are counted.
- The count starts from the to-lab shipment's "Date sent", not from when the job or the shipment was created. If "Date sent" is empty, the job has no expected date.
- If one job's stones went to the lab on more than one shipment, the latest send date is used for the whole job.
- Changing turnaround days in Settings also updates jobs already at the lab, unless they have an override.
- An override stays in place even if the job's service type changes.
- "Results received" means the job's status reaches the existing verbal-results stage, or the Verbal Results notification has been sent.
- Cancelled jobs never appear in the Expected Results panel.
- Classification is by stone type only. A parcel follows its stone type.
- A stone type removed from Settings and later added back starts as Semi-Precious.
- Mixed jobs appear on both memos, and each memo shows only that job's stones in its category.
- The two documents share the shipment number. No separate document numbers are created.
- Existing shipments get the split automatically when printed. Nothing about the shipment itself changes.
