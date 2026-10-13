# Faster Screen Switching in Lab-Direct

Lab-Direct should move between Jobs, Shipments, Stones, Clients and the Dashboard in about a second or two, not 10+ seconds. The fix is in the code first; adding server resources is considered only if the measurements show it's still needed.

## Who it's for
- Super admins and branch admins, who switch screens all day.
- Customers using their portal also benefit, because their lists load the same way.

## Core features and experience

### 1. Measure production first
- Before any code changes:
  - record how long each main screen and its data requests take in production
  - record server memory and CPU use, and the database response time
  - record how much data there is (number of jobs, stones, shipments, clients)
- The same measurements are repeated after the changes, so there are clear before/after numbers.
- If the measurements show something unexpected (for example a slow or distant database), that is addressed first. Phase 1 is reordered to match.

### 2. Lighter, smarter data loading (main fix)
- **The cause:** today, every list screen loads every job with all its stones, notifications and payments. For each job, the server then makes three extra database lookups (client, branch, shipment).
- **The fix:**
  - The server gathers that information in a few combined lookups instead of one set per job.
  - Lists receive only the fields they display. The full job (stones, findings, notification history, payments) loads when a job is opened.
  - The database gets indexes for the lookups the app uses most (job number, client, branch, status, shipment membership), so each search finds its records directly instead of reading everything.

### 3. Paged lists (50 rows at a time)
- **Screens:** Jobs, Stones, Shipments and Clients show 50 rows per page, with Previous / Next controls and a total count (for example "1–50 of 612").
- **Search, filters and sorting run across all records, not just the visible page:**
  - search by job number, client or SKU
  - the status filter
  - the Expected Results filter (Overdue / Today / This week / Pick a date)
  - the branch selector
  - column sorting
- Existing links keep working: Dashboard → Jobs filtered by status or expected date, and opening a specific job by link even when it isn't on the current page.
- **Pickers search the server as you type** instead of loading every job up front. This covers "Add jobs to shipment" and similar job and client pickers.

### 4. Dashboard
- Totals and pipeline counts are calculated on the server and sent as small summaries, without loading every job.
- The Expected Results panel loads only the jobs that are awaiting results: overdue, today and the next 7 days.
- The recent jobs and shipments panels load only what they show.

### 5. Always fresh data
- Every screen fetches fresh data when it opens, as chosen. Nothing stale is shown.
- A short loading indicator appears while it loads. It should last about a second, not 10.

## User flow
1. The admin opens Jobs. The first 50 jobs (newest first) appear in about a second, with the total count shown.
2. They type a client name. Matching jobs from the whole system appear within moments.
3. They switch to Shipments. That screen loads its own first page quickly, without reloading all jobs.
4. They open a shipment and click "Add jobs". They search for a job number and pick it from the results.
5. They return to the Dashboard. Summary numbers and Expected Results load straight away.

## UI/UX feel
- The screens look the same as today. The only visible additions are page controls and a "showing X–Y of Z" count under each list.
- The loading state is a light placeholder in the table area, not a blank screen.
- Bulk actions (such as Update Status with the select-all checkbox) work on the rows on the current page. The count shown on the button is the number of selected rows.

## Implementation phases
- **Phase 1 (MVP, built now)**
  - Production measurement before and after, with the numbers shared
  - Combined lookups instead of per-job lookups, lighter list data, full detail loaded when a job is opened
  - Database indexes for the main lookups
  - Paged lists of 50 rows with search, filters and sorting run on the server, for Jobs, Stones, Shipments and Clients (admin screens and the customer portal)
  - Server-calculated Dashboard summaries and a dedicated Expected Results feed
  - Search-as-you-type job and client pickers
- **Phase 2**
  - Optional instant "last viewed" display while refreshing, if wanted later
  - Faster PDF and print generation, and smaller images and logos
  - Adjust server resources only if the Phase 1 measurements still show the server is undersized
- **Phase 3**
  - A simple admin "system health" view (slowest requests, response times) to spot slowdowns early
  - Optional archiving of old Done and Cancelled jobs out of the active lists, still searchable

## Assumptions
- The production check couldn't run during planning, so it is the first step of the build. Its findings may reorder the Phase 1 work, but they don't change the scope.
- The page size is fixed at 50 rows. Default sort is newest first, the same as today.
- Select-all and bulk actions apply only to the current page.
- The Active / All / per-status filters and the Expected Results filter keep their current meaning. They now cover every record, not just loaded ones.
- Opening a job, stone or shipment always shows its complete, fresh details.
- No data is changed, moved or deleted. Only how it is fetched changes.
- Printing, PDFs, emails, payments and signing pad behaviour stay the same.
- Server resources are not increased in Phase 1.
- Success target: a typical screen switch in production in about 1–2 seconds with current data volumes, confirmed by the before/after measurements.
