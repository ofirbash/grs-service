"use client";

/**
 * useJobStones — local state + handlers for the Create Job dialog's stone list.
 *
 * Pulled out of jobs/page.tsx (2086 LOC, well past the 700-line guideline)
 * to keep the page focused on listing/editing existing jobs. The hook owns:
 *   - the array of in-progress stone rows
 *   - row UIDs (stable across rerenders + removals — critical so React doesn't
 *     drop input focus when the user deletes a row)
 *   - add / remove / change handlers (incl. the parcel-toggle side-effect that
 *     clears `stone_count` when a row flips off "is_parcel")
 *   - dirty + validity predicates used by the surrounding form
 *
 * Type re-uses `StoneInput` from CreateJobDialog so callers and the dialog
 * agree on the shape with no duplication.
 */

import { useCallback, useState } from 'react';

import type { StoneInput } from '../_components/CreateJobDialog';

// Module-local UID counter. `crypto.randomUUID()` when available; falls back to
// `Date.now() + counter` for older browsers. The counter keeps consecutive
// same-millisecond inserts unique.
let _stoneUidCounter = 0;
const makeStoneUid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `stone-${Date.now()}-${++_stoneUidCounter}`;

const emptyStone = (): StoneInput => ({
  _uid: makeStoneUid(),
  stone_type: '',
  weight: '',
  shape: '',
  value: '',
  color_stability_test: false,
});

export interface UseJobStonesReturn {
  stones: StoneInput[];
  setStones: (s: StoneInput[]) => void;
  addStone: () => void;
  removeStone: (index: number) => void;
  changeStone: (index: number, field: keyof StoneInput, value: string | boolean) => void;
  /** Reset back to a single empty row — used after submitting or closing
   *  the dialog without saving. */
  resetStones: () => void;
  /** True when at least one row has any user-entered data. Drives the
   *  unsaved-changes confirmation when the dialog closes. */
  hasStoneData: () => boolean;
  /** True when at least one row has the trio of fields a submittable
   *  stone requires (type + weight + value). */
  hasValidStone: () => boolean;
}

export function useJobStones(): UseJobStonesReturn {
  const [stones, setStones] = useState<StoneInput[]>([emptyStone()]);

  const addStone = useCallback(() => {
    setStones((prev) => [...prev, emptyStone()]);
  }, []);

  const removeStone = useCallback((index: number) => {
    setStones((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }, []);

  const changeStone = useCallback(
    (index: number, field: keyof StoneInput, value: string | boolean) => {
      setStones((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        // When a row flips OFF parcel, clear the count so a stale string
        // doesn't ride along into submission.
        if (field === 'is_parcel' && value === false) {
          next[index].stone_count = '';
        }
        return next;
      });
    },
    [],
  );

  const resetStones = useCallback(() => {
    setStones([emptyStone()]);
  }, []);

  const hasStoneData = useCallback(
    () => stones.some((s) => s.stone_type || s.weight || s.value || s.shape),
    [stones],
  );

  const hasValidStone = useCallback(
    () => stones.some((s) => Boolean(s.stone_type && s.weight && s.value)),
    [stones],
  );

  return {
    stones,
    setStones,
    addStone,
    removeStone,
    changeStone,
    resetStones,
    hasStoneData,
    hasValidStone,
  };
}
