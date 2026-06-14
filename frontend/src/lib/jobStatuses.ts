/**
 * Canonical job status list. Used by every status `<Select>` in the app
 * (jobs page Job Detail dialog, shipments page Job Detail dialog, etc.).
 *
 * Why a constant rather than a component: the surrounding `<Select>` markup
 * differs slightly between callsites (sticky header inline vs full-width
 * card) — sharing the LIST instead of the WIDGET avoids forcing a single
 * visual style on both surfaces, while still guaranteeing the option set
 * doesn't drift if we add/remove a status.
 *
 * Tuple shape: [code, human-readable label].
 */
export const JOB_STATUSES: ReadonlyArray<readonly [string, string]> = [
  ['draft', 'Draft'],
  ['stones_accepted', 'Stones Accepted'],
  ['sent_to_lab', 'Sent to Lab'],
  ['verbal_uploaded', 'Verbal Uploaded'],
  ['stones_returned', 'Stones Returned'],
  ['cert_uploaded', 'Cert. Uploaded'],
  ['cert_returned', 'Cert. Returned'],
  ['done', 'Done'],
];

/** Statuses available from the JOBS page edit flow only (admins managing
 *  the full lifecycle can also mark a job as cancelled). The shipments
 *  dialog hides this since cancelling from a shipment-side view is not
 *  a supported workflow. */
export const JOB_STATUSES_WITH_CANCEL: ReadonlyArray<readonly [string, string]> = [
  ...JOB_STATUSES,
  ['cancelled', 'Cancelled'],
];
