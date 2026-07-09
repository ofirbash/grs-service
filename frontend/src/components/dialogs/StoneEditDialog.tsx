"use client";

import React from 'react';
import {
  Check,
  Diamond,
  Eye,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { StoneVerbalSection } from '@/components/StoneVerbalSection';
import type { DropdownSettings } from '@/components/StoneVerbalSection';

/** Minimal shape this dialog depends on; both Job and Stone types in the
 *  codebase already satisfy these — we accept the loose shape rather than
 *  importing the full types so this component is reusable from any page. */
interface StoneLike {
  id: string;
  sku: string;
  stone_type: string;
  weight: number;
  shape: string;
  value: number;
  fee: number;
  kind?: 'stone' | 'parcel';
  stone_count?: number;
  certificate_group?: number | null;
  certificate_scan_url?: string | null;
  color_stability_test?: boolean;
  mounted?: boolean;
  verbal_findings?: unknown;
}

interface JobLike {
  job_number?: number;
  service_type?: string;
  recheck_reasons?: string[] | null;
  client_name?: string | null;
}

interface DropdownOption {
  value: string;
}

type DropdownSettingsLike = DropdownSettings;

interface StructuredVerbalLike {
  certificate_id?: string;
  weight?: number;
  identification?: string;
  color?: string;
  origin?: string;
  comment?: string;
}

/** Draft for the editable core details (type/weight/shape/value). Owned
 *  by the parent page so the parent's `onSave` can PUT them alongside
 *  the CS/mounted + verbal-findings updates. Optional on the dialog —
 *  if the parent doesn't pass it, the details row stays read-only even
 *  in edit mode (used for surfaces where core-editing isn't allowed). */
export interface StoneDetailsDraft {
  stone_type: string;
  weight: string;
  shape: string;
  value: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** The stone being inspected/edited. Null while the dialog is closing. */
  stone: StoneLike | null;
  /** Parent job — used for the description line, recheck reasons display,
   *  and to anchor cert-upload Cloudinary paths in the parent handler. */
  job: JobLike | null;
  isAdmin: boolean;

  /** Verbal findings model — owned by parent so save/discard semantics are
   *  consistent across callers. */
  findings: StructuredVerbalLike;
  setFindings: React.Dispatch<React.SetStateAction<StructuredVerbalLike>>;
  dropdownSettings: DropdownSettingsLike;

  /** Edit-mode toggle — when off, the dialog is a read-only summary. */
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;

  /** Fee-affecting toggles (only meaningful in edit mode). Optional —
   *  if the parent doesn't need fee editing on this surface, skip them
   *  and the section auto-hides. */
  colorStability?: boolean;
  setColorStability?: React.Dispatch<React.SetStateAction<boolean>>;
  mounted?: boolean;
  setMounted?: React.Dispatch<React.SetStateAction<boolean>>;
  csFeeCost?: number;
  mountedFeeCost?: number;

  /** Editable core details draft (stone_type/weight/shape/value). Pass
   *  these + the dropdown lists to enable inline editing of the top
   *  summary bar in edit mode. Parent owns the state so its `onSave`
   *  handler can PUT the details alongside fees/verbal in one flow.
   *  Feb 28 2026 user request: "open a stone -> edit -> save; fees
   *  should update from the new details". Parcels are not supported
   *  here (their per-stone-value semantics are different). */
  detailsDraft?: StoneDetailsDraft;
  setDetailsDraft?: React.Dispatch<React.SetStateAction<StoneDetailsDraft>>;
  stoneTypes?: string[];
  shapes?: string[];

  /** Save handler — parent persists fees + verbal findings + refreshes. */
  saving: boolean;
  onSave: () => void;

  /** Cert-scan upload wiring — parent owns the file ref + handler so it
   *  can route to either the single-stone or certificate-group upload. */
  certInputRef: React.RefObject<HTMLInputElement>;
  uploadingCert: boolean;
  onCertChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewCert: () => void;
}

/** Canonical stone-edit modal — used by the Jobs, Stones, and Shipments
 *  pages. Lifted from jobs/page.tsx (the richest version) on Feb 25 2026 to
 *  kill three copies that had drifted (the parcel feature shipped on
 *  /dashboard/jobs but quietly missed /dashboard/stones because of the
 *  duplicate code). Single source of truth keeps that bug class impossible.
 *
 *  Design note: "lift JSX, not state". All `useState` hooks remain in the
 *  parent page; this component is a pure presentational wrapper that
 *  receives 15-ish props. That's intentional — the save handler has to be
 *  parent-owned anyway (it calls into different API methods per page) and
 *  splitting it differently would mean either context-coupling or a
 *  state-management framework, neither of which we need yet. */
export const StoneEditDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  stone,
  job,
  isAdmin,
  findings,
  setFindings,
  dropdownSettings,
  editMode,
  setEditMode,
  colorStability,
  setColorStability,
  mounted,
  setMounted,
  csFeeCost = 0,
  mountedFeeCost = 0,
  detailsDraft,
  setDetailsDraft,
  stoneTypes,
  shapes,
  saving,
  onSave,
  certInputRef,
  uploadingCert,
  onCertChange,
  onViewCert,
}) => {
  // Compact fee preview math. When the operator toggles CS/Mounted in edit
  // mode, we want the "Fee" pill to reflect the price the save would commit.
  // Parcels charge CS per stone in the parcel; mounted is per row.
  const stoneCount = stone?.stone_count || 1;
  const isParcel = stone?.kind === 'parcel';
  const csMultiplier = isParcel ? stoneCount : 1;

  const previewedFee = (() => {
    if (!stone) return 0;
    if (!editMode) return stone.fee;
    let f = stone.fee;
    const csOn = colorStability ?? false;
    const csWas = stone.color_stability_test ?? false;
    const mtOn = mounted ?? false;
    const mtWas = stone.mounted ?? false;
    if (csOn && !csWas) f += csFeeCost * csMultiplier;
    if (!csOn && csWas) f -= csFeeCost * csMultiplier;
    if (mtOn && !mtWas) f += mountedFeeCost;
    if (!mtOn && mtWas) f -= mountedFeeCost;
    return f;
  })();

  const hasFeeToggles =
    setColorStability !== undefined && setMounted !== undefined;
  const shouldShowToggleStrip =
    hasFeeToggles &&
    (editMode || stone?.color_stability_test || stone?.mounted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
            <Diamond className="h-5 w-5" />
            Stone - {stone?.sku}
            {isAdmin && (
              <Button
                variant={editMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEditMode(!editMode)}
                className={`ml-auto h-7 text-xs ${
                  editMode
                    ? 'bg-brand-red hover:bg-brand-red-dark'
                    : 'border-navy-300 hover:bg-navy-100'
                }`}
                data-testid="edit-stone-button"
              >
                <Pencil className="h-3 w-3 mr-1" />
                {editMode ? 'Editing...' : 'Edit'}
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            Job #{job?.job_number} | {stone?.stone_type} | {stone?.weight} ct
            {job?.service_type === 'Recheck' && job?.recheck_reasons && job.recheck_reasons.length > 0 && (
              <span
                className="ml-2 text-amber-700 font-medium"
                data-testid="stone-dialog-recheck-reasons"
              >
                · Recheck: {job.recheck_reasons.join(', ')}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {stone && (
          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-2">
            {/* Editable core-details block — visible only when the parent
                page enabled inline detail editing (passed `detailsDraft`).
                Parcels intentionally skipped: their weight/value semantics
                (totals split across N stones) aren't editable here. */}
            {editMode && isAdmin && detailsDraft && setDetailsDraft && !isParcel ? (
              <div
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-md"
                data-testid="stone-details-edit-block"
              >
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-navy-500">Type</Label>
                  <Select
                    value={detailsDraft.stone_type}
                    onValueChange={(v) => setDetailsDraft({ ...detailsDraft, stone_type: v })}
                  >
                    <SelectTrigger className="h-8 text-sm" data-testid="stone-details-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(stoneTypes ?? []).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-navy-500">Weight (ct)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 text-sm"
                    value={detailsDraft.weight}
                    onChange={(e) => setDetailsDraft({ ...detailsDraft, weight: e.target.value })}
                    data-testid="stone-details-weight-input"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-navy-500">Shape</Label>
                  <Select
                    value={detailsDraft.shape}
                    onValueChange={(v) => setDetailsDraft({ ...detailsDraft, shape: v })}
                  >
                    <SelectTrigger className="h-8 text-sm" data-testid="stone-details-shape-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(shapes ?? []).map((sh) => (
                        <SelectItem key={sh} value={sh}>{sh}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide text-navy-500">Value (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 text-sm"
                    value={detailsDraft.value}
                    onChange={(e) => setDetailsDraft({ ...detailsDraft, value: e.target.value })}
                    data-testid="stone-details-value-input"
                  />
                </div>
                <div className="col-span-2 sm:col-span-4 text-xs text-amber-800">
                  Fees will recompute automatically on save based on the new details.
                </div>
              </div>
            ) : (
              /* Compact stone info summary — read-only horizontal row */
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 bg-navy-50 rounded-md text-sm">
                <span>
                  <span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Type</span>
                  <span className="font-medium text-navy-900">{stone.stone_type}</span>
                </span>
                <span className="text-navy-200">|</span>
                <span>
                  <span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">
                    {isParcel ? 'Total wt' : 'Weight'}
                  </span>
                  <span className="font-medium text-navy-900">{stone.weight} ct</span>
                </span>
                <span className="text-navy-200">|</span>
                <span>
                  <span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Shape</span>
                  <span className="font-medium text-navy-900">{stone.shape}</span>
                </span>
                <span className="text-navy-200">|</span>
                <span>
                  <span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">
                    {isParcel ? 'Total value' : 'Value'}
                  </span>
                  <span className="font-medium text-navy-900">${stone.value.toLocaleString()}</span>
                </span>
                {isParcel && (
                  <>
                    <span className="text-navy-200">|</span>
                    <span>
                      <span className="text-amber-700 text-xs uppercase tracking-wide mr-1.5">Parcel</span>
                      <span className="font-medium text-amber-900">{stone.stone_count} stones</span>
                    </span>
                  </>
                )}
                <span className="text-navy-200">|</span>
                <span>
                  <span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Fee</span>
                  <span className="font-medium text-navy-900">${previewedFee.toLocaleString()}</span>
                </span>
                {stone.certificate_group ? (
                  <>
                    <span className="text-navy-200">|</span>
                    <span>
                      <span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Cert Group</span>
                      <span className="font-medium text-navy-900">{stone.certificate_group}</span>
                    </span>
                  </>
                ) : null}
              </div>
            )}

            {/* Color Stability + Mounted toggles */}
            {shouldShowToggleStrip && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-navy-500 text-xs uppercase tracking-wide">Color Stability</span>
                  {editMode ? (
                    <>
                      <Switch
                        checked={colorStability || false}
                        onCheckedChange={setColorStability!}
                        className="scale-75"
                        data-testid="stone-color-stability-switch"
                      />
                      <span className="text-xs text-navy-600">
                        {colorStability
                          ? `+$${csFeeCost}${isParcel && stoneCount > 1 ? ` × ${stoneCount} = $${csFeeCost * stoneCount}` : ''}`
                          : 'No'}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium text-navy-900">
                      {stone.color_stability_test
                        ? `Yes (+$${csFeeCost}${isParcel && stoneCount > 1 ? ` × ${stoneCount}` : ''})`
                        : 'No'}
                    </span>
                  )}
                </span>
                <span className="text-navy-200">|</span>
                <span className="flex items-center gap-2">
                  <span className="text-navy-500 text-xs uppercase tracking-wide">Mounted</span>
                  {editMode ? (
                    <>
                      <Switch
                        checked={mounted || false}
                        onCheckedChange={setMounted!}
                        className="scale-75"
                        data-testid="stone-mounted-switch"
                      />
                      <span className="text-xs text-navy-600">{mounted ? `+$${mountedFeeCost}` : 'No'}</span>
                    </>
                  ) : (
                    <span className="font-medium text-navy-900">{stone.mounted ? `Yes (+$${mountedFeeCost})` : 'No'}</span>
                  )}
                </span>
              </div>
            )}

            {/* Verbal Findings Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-navy-200 pb-2">
                <Label className="text-lg font-semibold flex items-center gap-2 text-navy-900">
                  <FileText className="h-5 w-5" />
                  Verbal Findings
                </Label>
                {(() => {
                  const vf = stone.verbal_findings;
                  const hasFindings =
                    vf && typeof vf === 'object' && (vf as StructuredVerbalLike).certificate_id;
                  return hasFindings ? (
                    <Badge variant="secondary" className="bg-navy-900 text-white">Completed</Badge>
                  ) : null;
                })()}
              </div>

              {/* Lock indicator when not in edit mode */}
              {!editMode && isAdmin && (
                <div className="bg-navy-50 border border-navy-200 rounded-md px-3 py-2 text-sm text-navy-600 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Click &quot;Edit&quot; to modify fees and verbal findings.
                </div>
              )}

              <StoneVerbalSection
                stone={stone}
                structuredFindings={findings}
                setStructuredFindings={setFindings}
                dropdownSettings={dropdownSettings}
                editMode={editMode}
              />
            </div>
          </div>
        )}

        {/* Hidden file input — triggered by the footer "Upload cert scan" button. */}
        {stone && (
          <input
            ref={certInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={onCertChange}
            className="hidden"
          />
        )}

        <DialogFooter className="flex-shrink-0 border-t pt-3 gap-2 flex-row items-center justify-between sm:justify-between">
          {/* Left: compact certificate-scan controls */}
          <div className="flex items-center gap-2">
            {stone && isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => certInputRef.current?.click()}
                disabled={uploadingCert}
                data-testid="upload-stone-cert-button"
                title={stone.certificate_group ? `Applies to certificate group ${stone.certificate_group}` : 'Upload certificate scan'}
              >
                {uploadingCert ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {stone.certificate_scan_url ? 'Replace cert scan' : 'Upload cert scan'}
                  </>
                )}
              </Button>
            )}
            {stone?.certificate_scan_url && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewCert}
                data-testid="view-stone-cert-button"
                title="View certificate scan"
              >
                <Eye className="h-4 w-4 mr-2" />
                View scan
              </Button>
            )}
          </div>
          {/* Right: save (admin + edit) + close */}
          <div className="flex items-center gap-2">
            {isAdmin && editMode && (
              <Button
                onClick={onSave}
                disabled={saving}
                size="sm"
                className="bg-navy-900 hover:bg-navy-800"
                data-testid="save-stone-button"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" />Save Changes</>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
