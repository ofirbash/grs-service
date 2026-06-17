/**
 * Stone & job completeness helpers (Feb 25 2026).
 *
 * Pure functions: given a stone (or list of stones) decide whether the
 * verbal-findings record and certificate scan are "complete" for the
 * purposes of the green-check indicators in the UI.
 *
 * Decisions captured here (per product call):
 *   - Verbal complete = all structured fields EXCEPT `comment` are filled.
 *     For parcels, the top-level fields must be filled AND every per_stone
 *     entry must have its own core fields filled too.
 *   - Cert complete = every certificate_group has at least one stone with
 *     a certificate_scan_url; ungrouped stones each need their own scan.
 *   - Cancelled stones are excluded from job-level completeness checks.
 */

interface CompletenessStone {
  id?: string;
  certificate_group?: number | null;
  certificate_scan_url?: string | null;
  cancelled?: boolean | null;
  kind?: string | null;
  stone_count?: number | null;
  // verbal_findings can arrive as a free-text string (legacy), a structured
  // object, or be missing entirely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verbal_findings?: any;
}

interface StructuredVerbal {
  certificate_id?: string | null;
  weight?: number | string | null;
  identification?: string | null;
  color?: string | null;
  origin?: string | null;
  comment?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  per_stone?: any[] | null;
}

/** A single value counts as "filled" when it's a non-empty string or a
 *  non-null number. Whitespace-only strings don't count. */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return Boolean(value);
}

/** Returned-stones summary for job-level visual indication.
 *  - none: no active stones have been returned
 *  - partial: some but not all
 *  - all: every active stone is returned */
export type ReturnedSummary = 'none' | 'partial' | 'all';

export function getJobReturnedSummary(stones: CompletenessStone[]): ReturnedSummary {
  const active = stones.filter((s) => !s.cancelled);
  if (active.length === 0) return 'none';
  const returned = active.filter((s) => (s as { stone_status?: string }).stone_status === 'returned');
  if (returned.length === 0) return 'none';
  if (returned.length === active.length) return 'all';
  return 'partial';
}

const CORE_FIELDS: Array<keyof StructuredVerbal> = [
  'certificate_id',
  'weight',
  'identification',
  'color',
  'origin',
];

function isStructuredCoreComplete(v: StructuredVerbal): boolean {
  return CORE_FIELDS.every((k) => isFilled(v[k]));
}

export function isStoneVerbalComplete(stone: CompletenessStone): boolean {
  const v = stone.verbal_findings;
  // No record at all → not complete.
  if (v === null || v === undefined) return false;
  // Legacy free-text record — treat any non-empty string as complete.
  // (We never required the structured form for legacy stones.)
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v !== 'object') return false;

  const struct = v as StructuredVerbal;
  if (!isStructuredCoreComplete(struct)) return false;

  // Parcels: every per_stone entry must also be complete.
  if (stone.kind === 'parcel') {
    const arr = Array.isArray(struct.per_stone) ? struct.per_stone : [];
    const expected = stone.stone_count ?? arr.length;
    if (arr.length < expected) return false;
    return arr.every((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      // Per-stone entries don't repeat certificate_id (shared at top level).
      return (
        isFilled(entry.weight) &&
        isFilled(entry.identification) &&
        isFilled(entry.color) &&
        isFilled(entry.origin)
      );
    });
  }

  return true;
}

export function isStoneCertComplete(stone: CompletenessStone): boolean {
  return isFilled(stone.certificate_scan_url);
}

export function isJobVerbalComplete(stones: CompletenessStone[]): boolean {
  const active = stones.filter((s) => !s.cancelled);
  if (active.length === 0) return false;
  return active.every(isStoneVerbalComplete);
}

export function isJobCertComplete(stones: CompletenessStone[]): boolean {
  const active = stones.filter((s) => !s.cancelled);
  if (active.length === 0) return false;

  // Group stones by certificate_group. Ungrouped stones each form a
  // singleton "group" keyed by stone.id so they need their own scan.
  const groups = new Map<string, CompletenessStone[]>();
  for (const s of active) {
    const key = s.certificate_group != null
      ? `cg:${s.certificate_group}`
      : `s:${s.id ?? Math.random()}`;
    const bucket = groups.get(key) || [];
    bucket.push(s);
    groups.set(key, bucket);
  }
  // Every group needs at least one stone with a scan URL.
  return Array.from(groups.values()).every((bucket) =>
    bucket.some(isStoneCertComplete),
  );
}
