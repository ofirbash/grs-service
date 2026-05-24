"use client";

/**
 * Shared verbal-findings editor used by BOTH the jobs-page stone modal and
 * the stones-page stone modal. Before this component existed, the same
 * ~120-line block was inlined into two places — which meant fixes (like the
 * parcel-aware per-stone cards added on Feb 25, 2026) had to be applied
 * twice. That kept failing: the jobs-page got the parcel UI but the
 * stones-page did not, and the user could not enter verbal results for a
 * parcel from /dashboard/stones at all.
 *
 * Single source of truth. Pure presentational component — owns no
 * persistence, no async work. Parent passes structuredFindings + setter +
 * stone + dropdownSettings + editMode and gets back the rendered editor.
 *
 * For a SINGLE stone: renders the legacy 2-col grid (cert ID, weight,
 * identification, color, origin, comment).
 *
 * For a PARCEL (stone.kind === 'parcel'): renders ONE shared certificate_id
 * input at the top (full-width, with microcopy "shared across all N
 * stones"), then N amber cards each with its own per-stone weight +
 * identification/color/origin/comment SearchableSelects. The "Copy row 1 →
 * all" button (edit-mode only, N>=2) propagates row 1's id/color/origin/
 * comment to every other row while leaving weights alone.
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { filterOptionsForStone } from "@/lib/stoneDropdownFilter";

// Local mirror of the StructuredVerbalFindings shape. Kept tiny &
// self-describing so this component has no upward dependency on either of
// the two pages that import it.
export interface ParcelStoneFinding {
  weight?: number;
  identification?: string;
  color?: string;
  origin?: string;
  comment?: string;
}

export interface StructuredVerbalFindings {
  certificate_id?: string;
  weight?: number;
  identification?: string;
  color?: string;
  origin?: string;
  comment?: string;
  per_stone?: ParcelStoneFinding[];
}

interface DropdownOption {
  value: string;
  stone_types: string[];
}

export interface DropdownSettings {
  identification: DropdownOption[];
  color: DropdownOption[];
  origin: DropdownOption[];
  comment: DropdownOption[];
}

interface StoneLike {
  stone_type: string;
  kind?: string;
  stone_count?: number;
}

interface StoneVerbalSectionProps {
  stone: StoneLike;
  structuredFindings: StructuredVerbalFindings;
  setStructuredFindings: React.Dispatch<React.SetStateAction<StructuredVerbalFindings>>;
  dropdownSettings: DropdownSettings;
  editMode: boolean;
}

export const StoneVerbalSection: React.FC<StoneVerbalSectionProps> = ({
  stone,
  structuredFindings,
  setStructuredFindings,
  dropdownSettings,
  editMode,
}) => {
  const isParcel = stone.kind === "parcel";
  const parcelStones = structuredFindings.per_stone || [];

  // Mutate one per-stone entry inside the parcel.per_stone array
  // immutably, so React notices the change.
  const updateParcelStone = (
    index: number,
    field: keyof ParcelStoneFinding,
    value: string | number | undefined,
  ) => {
    setStructuredFindings((prev) => {
      const next = [...(prev.per_stone || [])];
      next[index] = { ...(next[index] || {}), [field]: value };
      return { ...prev, per_stone: next };
    });
  };

  const copyRow1ToAll = () => {
    // Common case for high-N parcels: all stones share the same id / color /
    // origin / comment, only weights differ. Weight is intentionally NOT
    // copied so the lab tech still records each stone's individual weight.
    const first = parcelStones[0];
    if (!first) return;
    setStructuredFindings((prev) => ({
      ...prev,
      per_stone: (prev.per_stone || []).map((s, idx) =>
        idx === 0
          ? s
          : {
              ...s,
              identification: first.identification ?? "",
              color: first.color ?? "",
              origin: first.origin ?? "",
              comment: first.comment ?? "",
            },
      ),
    }));
  };

  const lockedClasses = `border-navy-200 ${
    !editMode ? "bg-gray-200 text-gray-600 cursor-not-allowed opacity-70" : "bg-white"
  }`;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Certificate ID — shared for both singles and parcels */}
        <div className={`space-y-1 ${isParcel ? "sm:col-span-2" : ""}`}>
          <Label className="text-sm text-navy-600">
            Certificate ID
            {isParcel && (
              <span className="ml-2 text-xs text-amber-700 font-normal">
                (shared across all {stone.stone_count || 0} stones)
              </span>
            )}
          </Label>
          <Input
            placeholder="Enter certificate ID..."
            value={structuredFindings.certificate_id || ""}
            onChange={(e) =>
              setStructuredFindings((prev) => ({ ...prev, certificate_id: e.target.value }))
            }
            className={lockedClasses}
            disabled={!editMode}
            data-testid="verbal-certificate-id"
          />
        </div>

        {!isParcel && (
          <>
            {/* Weight */}
            <div className="space-y-1">
              <Label className="text-sm text-navy-600">Weight (ct)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Weight..."
                value={structuredFindings.weight || ""}
                onChange={(e) =>
                  setStructuredFindings((prev) => ({
                    ...prev,
                    weight: parseFloat(e.target.value) || 0,
                  }))
                }
                className={lockedClasses}
                disabled={!editMode}
                data-testid="verbal-weight"
              />
            </div>

            {/* Identification */}
            <div className="space-y-1">
              <Label className="text-sm text-navy-600">Identification</Label>
              <SearchableSelect
                value={structuredFindings.identification || ""}
                onValueChange={(value) =>
                  setStructuredFindings((prev) => ({ ...prev, identification: value }))
                }
                disabled={!editMode}
                options={filterOptionsForStone(
                  dropdownSettings.identification,
                  stone.stone_type,
                  structuredFindings.identification || "",
                )}
                placeholder="Select identification..."
                searchPlaceholder="Search identification..."
                data-testid="verbal-identification"
              />
            </div>

            {/* Color */}
            <div className="space-y-1">
              <Label className="text-sm text-navy-600">Color</Label>
              <SearchableSelect
                value={structuredFindings.color || ""}
                onValueChange={(value) =>
                  setStructuredFindings((prev) => ({ ...prev, color: value }))
                }
                disabled={!editMode}
                options={filterOptionsForStone(
                  dropdownSettings.color,
                  stone.stone_type,
                  structuredFindings.color || "",
                )}
                placeholder="Select color..."
                searchPlaceholder="Search color..."
                data-testid="verbal-color"
              />
            </div>

            {/* Origin */}
            <div className="space-y-1">
              <Label className="text-sm text-navy-600">Origin</Label>
              <SearchableSelect
                value={structuredFindings.origin || ""}
                onValueChange={(value) =>
                  setStructuredFindings((prev) => ({ ...prev, origin: value }))
                }
                disabled={!editMode}
                options={filterOptionsForStone(
                  dropdownSettings.origin,
                  stone.stone_type,
                  structuredFindings.origin || "",
                )}
                placeholder="Select origin..."
                searchPlaceholder="Search origin..."
                data-testid="verbal-origin"
              />
            </div>

            {/* Comment */}
            <div className="space-y-1">
              <Label className="text-sm text-navy-600">Comment</Label>
              <SearchableSelect
                value={structuredFindings.comment || ""}
                onValueChange={(value) =>
                  setStructuredFindings((prev) => ({ ...prev, comment: value }))
                }
                disabled={!editMode}
                options={filterOptionsForStone(
                  dropdownSettings.comment,
                  stone.stone_type,
                  structuredFindings.comment || "",
                )}
                placeholder="Select comment..."
                searchPlaceholder="Search comment..."
                data-testid="verbal-comment"
              />
            </div>
          </>
        )}
      </div>

      {isParcel && (
        <div className="space-y-3 mt-2" data-testid="parcel-per-stone-section">
          <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
            <Label className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
              Per-stone findings ({parcelStones.length} stones)
            </Label>
            {editMode && parcelStones.length >= 2 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                onClick={copyRow1ToAll}
                data-testid="parcel-copy-row-1-to-all"
              >
                Copy row 1 → all
              </Button>
            )}
          </div>
          {parcelStones.map((ps, i) => (
            <div
              key={i}
              className="border border-amber-200 rounded-md p-3 bg-amber-50/30 space-y-2"
              data-testid={`parcel-stone-card-${i}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                  Stone {i + 1} of {parcelStones.length}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Weight (ct)"
                  value={ps.weight ?? ""}
                  onChange={(e) =>
                    updateParcelStone(
                      i,
                      "weight",
                      e.target.value === "" ? undefined : parseFloat(e.target.value),
                    )
                  }
                  className={`border-amber-300 h-7 w-32 text-xs ${
                    !editMode
                      ? "bg-gray-200 text-gray-600 cursor-not-allowed opacity-70"
                      : "bg-white"
                  }`}
                  disabled={!editMode}
                  data-testid={`parcel-stone-weight-${i}`}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-navy-600">Identification</Label>
                  <SearchableSelect
                    value={ps.identification || ""}
                    onValueChange={(value) => updateParcelStone(i, "identification", value)}
                    disabled={!editMode}
                    options={filterOptionsForStone(
                      dropdownSettings.identification,
                      stone.stone_type,
                      ps.identification || "",
                    )}
                    placeholder="Select identification..."
                    searchPlaceholder="Search identification..."
                    data-testid={`parcel-stone-identification-${i}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-navy-600">Color</Label>
                  <SearchableSelect
                    value={ps.color || ""}
                    onValueChange={(value) => updateParcelStone(i, "color", value)}
                    disabled={!editMode}
                    options={filterOptionsForStone(
                      dropdownSettings.color,
                      stone.stone_type,
                      ps.color || "",
                    )}
                    placeholder="Select color..."
                    searchPlaceholder="Search color..."
                    data-testid={`parcel-stone-color-${i}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-navy-600">Origin</Label>
                  <SearchableSelect
                    value={ps.origin || ""}
                    onValueChange={(value) => updateParcelStone(i, "origin", value)}
                    disabled={!editMode}
                    options={filterOptionsForStone(
                      dropdownSettings.origin,
                      stone.stone_type,
                      ps.origin || "",
                    )}
                    placeholder="Select origin..."
                    searchPlaceholder="Search origin..."
                    data-testid={`parcel-stone-origin-${i}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-navy-600">Comment</Label>
                  <SearchableSelect
                    value={ps.comment || ""}
                    onValueChange={(value) => updateParcelStone(i, "comment", value)}
                    disabled={!editMode}
                    options={filterOptionsForStone(
                      dropdownSettings.comment,
                      stone.stone_type,
                      ps.comment || "",
                    )}
                    placeholder="Select comment..."
                    searchPlaceholder="Search comment..."
                    data-testid={`parcel-stone-comment-${i}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/**
 * Seed `structuredFindings` from a stone (used by both pages when opening
 * the stone modal). For parcels, builds N empty per_stone entries; reuses
 * existing data if present.
 */
export function seedStructuredFindings(
  stone: StoneLike & { weight?: number; verbal_findings?: unknown },
): StructuredVerbalFindings {
  const vf = stone.verbal_findings;
  const findings = vf && typeof vf === "object" ? (vf as StructuredVerbalFindings) : null;

  if (stone.kind === "parcel") {
    const n = Math.max(1, stone.stone_count || 1);
    const existing =
      findings?.per_stone && Array.isArray(findings.per_stone) ? findings.per_stone : [];
    const seeded: ParcelStoneFinding[] = Array.from({ length: n }, (_, i) => ({
      weight: existing[i]?.weight ?? undefined,
      identification: existing[i]?.identification ?? "",
      color: existing[i]?.color ?? "",
      origin: existing[i]?.origin ?? "",
      comment: existing[i]?.comment ?? "",
    }));
    return {
      certificate_id: findings?.certificate_id || "",
      per_stone: seeded,
    };
  }

  return {
    certificate_id: findings?.certificate_id || "",
    weight: findings?.weight || stone.weight,
    identification: findings?.identification || "",
    color: findings?.color || "",
    origin: findings?.origin || "",
    comment: findings?.comment || "",
  };
}
