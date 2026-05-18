/**
 * Filter verbal-findings dropdown options by stone type.
 *
 * Settings admins can scope each option (identification / color / origin /
 * comment) to specific stone types. This helper applies that scope at the
 * UI layer:
 *
 *   - An option is "universal" if its `stone_types` array is empty/undefined
 *     OR contains the sentinel `"all"` (case-insensitive). The settings UI
 *     uses `["all"]` as the explicit wildcard.
 *   - Otherwise the option only shows up when `stoneType` matches one of
 *     its `stone_types` entries (case-insensitive).
 *   - The currently-selected `currentValue` is force-included so legacy
 *     entries that no longer match the whitelist still render in the
 *     trigger (and can be cleared).
 */
export interface DropdownOptionWithScope {
  value: string;
  stone_types?: string[];
}

export function filterOptionsForStone(
  opts: DropdownOptionWithScope[],
  stoneType: string | undefined,
  currentValue: string,
): { value: string }[] {
  const st = (stoneType || "").trim().toLowerCase();
  const matched = opts.filter((opt) => {
    const types = (opt.stone_types || []).map((t) => t.trim().toLowerCase());
    if (!types.length) return true; // universal — no scope set
    if (types.includes("all")) return true; // explicit wildcard
    return types.includes(st);
  });
  if (currentValue && !matched.some((m) => m.value === currentValue)) {
    matched.unshift({ value: currentValue, stone_types: [] });
  }
  return matched.map((opt) => ({ value: opt.value }));
}
