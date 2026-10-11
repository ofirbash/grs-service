# Three small fixes: shipment-return title, cleaner stones table, Customer SKU

Three independent adjustments to shipment documents and stone tracking that affect what admins see on screen, what customers see on paper, and what identifiers travel through the system.

## Who it's for

Lab operators and the admins who send stones back out, plus the customers who receive the returned-shipment documents and emails. Customer-visible docs use the new label and new column; admins get a new input to fill in.

## Core features and experience

### 1. "Shipment Memo Return" — the outbound-from-lab document gets its name

When the lab ships stones back out to a client (the outbound half of a shipment cycle), the generated PDF/document is titled **"Shipment Memo Return"**. The incoming / dispatched-to-lab shipment document keeps its existing title. The change is a label swap on the generated document and its filename — nothing about the shipment flow itself moves.

### 2. Shape column removed from all shipment-document stone tables

In every shipment-document stone table (incoming shipment, shipment memo return), the "Shape" column is removed. Columns like SKU, Stone Type, Weight, Value stay. Stone-level documents outside the shipment flow (job memos, cert collections, individual memos) keep their Shape column — this is a shipment-document-only change.

### 3. Customer SKU — a second identifier that follows the stone

Alongside the auto-generated SKU (e.g. `DI100J60001`), each stone can carry an optional **Customer SKU** — a short free-text identifier supplied by the customer (their own inventory code, lot number, their internal reference). It is per stone and stays on the stone for its lifetime.

**Where admins enter it**

- **At job creation**: the "Add Stone" form in the job-creation flow gets a new "Customer SKU" field, placed under or next to the stone's type/weight fields. Blank is fine.
- **After the fact**: the Stone Edit dialog (opened from the stones table or the stones page) gets the same field in its editable section. An admin who forgets at creation can fill it in later. Editing uses the same inline-edit mechanism that already handles weight / type / shape / value, so no new buttons or modals.

**Where it appears in output**

- **Job dialog stones table**: a new "Customer SKU" column after the auto SKU. If the stone has no customer SKU, the cell shows a muted dash.
- **Stones admin page**: same column, same rule.
- **Shipment Memo Return** and the incoming / dispatched-to-lab shipment document: new "Customer SKU" column after the auto SKU, before Stone Type.
- **Memos, cert-collection docs, job-level memos (any customer-facing document that already lists stones)**: new "Customer SKU" column after the auto SKU.
- **Customer-facing emails that list stones** (intake confirmation, dispatch notification, delivery notification, payment receipt): the stone line now shows the Customer SKU in parentheses after the auto SKU, if it exists — e.g. `DI100J60001 (ABC-123)`. If no Customer SKU, the parentheses are omitted.
- **Nothing changes about search / lookup** in this phase — admins can see the Customer SKU in the table, but searching by Customer SKU is a later consideration.

## User flow

1. An admin opens a new job and adds stones. For each stone, they fill in the usual fields plus (optionally) the customer's SKU. They save the job. The stones table on the job dialog shows both IDs side by side.
2. The customer receives an intake-confirmation email that lists each stone by both IDs where provided, giving them something to cross-reference against their own books.
3. Testing happens on the lab side as usual.
4. When the lab sends stones back, the generated "Shipment Memo Return" document carries both IDs for every stone and omits the Shape column (cleaner for the recipient who already has Shape in their original paperwork).
5. If the admin forgot to enter a Customer SKU at creation, they open the stone from the job or stones page, hit Edit, type the Customer SKU in, and save. The next generated document picks it up.

## UI/UX feel

- The Customer SKU input is a plain text field, same visual weight as every other input in the Add Stone form — not highlighted, not required.
- The new table column has a muted dash where empty so blank rows don't shout.
- In emails, the inline parentheses form keeps the stone line short and scannable: `DI100J60001 (ABC-123)` rather than a separate paragraph.
- In documents, the two-column layout (auto SKU, Customer SKU) means a customer scanning the paper can go top-to-bottom on their own code without reading past the auto SKU.
- The "Shipment Memo Return" title uses the same heading style as the existing shipment document — purely a label swap. No layout change, no logo change.
- The Shape column disappearing from shipment-document tables is silent — the remaining columns reflow to use the freed width.

## Implementation phases

**Phase 1 — MVP (built now).** All three fixes above, in full: the label change on the outbound-from-lab shipment document, the Shape column removal across every shipment-document stones table, and end-to-end Customer SKU (create + edit on the stone, visible in every table / document / email that already lists stones).

**Phase 2 — later, not now.** Search / filter by Customer SKU across jobs and stones. Bulk-import a job with Customer SKUs from a CSV. These are useful once customers start using the field heavily.

**Phase 3 — later, not now.** A per-customer namespace that validates Customer SKU uniqueness within that customer's own history and warns if a value has been used before. Also, surfacing the Customer SKU on the customer's own portal view of their job.

## Assumptions

- **Customer SKU is per stone, in its own column** (chosen in the pre-plan question round).
- **Customer SKU is optional everywhere.** No validation, no uniqueness check, no required-field asterisk. If an admin leaves it blank, nothing bad happens.
- **No length cap enforced in this phase** beyond a soft maximum of 64 characters at the input level — enough for any inventory code a customer would reasonably send, short enough to not blow up a table cell.
- **Any character accepted.** Customer SKUs out in the wild include slashes, dashes, spaces, dots. The field accepts them all, trimmed of leading/trailing whitespace on save.
- **No audit-log entry for setting / changing the Customer SKU.** It is a label, not a value that affects fees or status, and the stone's own update audit already covers who changed what on the stone.
- **The "Shipment Memo Return" title applies only to the outbound-from-lab shipment document.** The incoming shipment document retains its current title. If the incoming one should rename too, say so during review and I'll fold it in.
- **The Shape column removal is scoped to shipment documents only.** Memos and cert-collection docs continue to show Shape — those are per-stone documents where shape matters for identification; shipments are bulk and the shape is already in the per-stone paperwork customers already have.
- **Email changes apply only to emails that already list stones in a line-by-line format.** Transactional emails that don't enumerate stones (password reset, access-request OTP, etc.) are unaffected.
- **No change to the auto-generated SKU format.** Customer SKU sits beside it, never replaces it.
- **"Customer SKU" is the label used across the UI, docs, and emails.** Not "Client SKU", not "Customer Reference", not "Client Code" — one consistent name so admins and customers can refer to it unambiguously.
- **The incoming shipment document also gets the Customer SKU column** — if a customer sent in their own SKUs, they expect to see them on the paperwork that comes back when they send the stones in too.
