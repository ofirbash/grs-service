import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, Package, Gem, UserPlus } from 'lucide-react';
import type { Client, Branch } from '../_types';
import { CreateClientDialog } from '../../clients/_components/CreateClientDialog';
import type { Client as ClientsClient, Branch as ClientsBranch } from '../../clients/_types';

export interface JobFormData {
  client_id: string;
  branch_id: string;
  service_type: string;
  notes: string;
  // Only populated when service_type === "Recheck"; cleared when the user
  // switches to another service type.
  recheck_reasons: string[];
}

export interface StoneInput {
  _uid: string;
  stone_type: string;
  weight: string;
  shape: string;
  value: string;
  // Tracked at the page level for inclusion in the create payload; the
  // dialog itself doesn't render a CS toggle on the create form (CS is
  // toggled post-receipt from the stone detail dialog). Kept on the shape
  // so `useJobStones` and the create POST both have a single source of truth.
  color_stability_test?: boolean;
  // Parcel support (Feb 25, 2026). When `is_parcel` is true, this row
  // represents N physical stones rolled up under a single certificate;
  // `stone_count` holds N (>=2), weight/value are TOTALS.
  is_parcel?: boolean;
  stone_count?: string;
  customer_sku?: string;
}

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationErrors: string[];
  formData: JobFormData;
  setFormData: (d: JobFormData) => void;
  clients: Client[];
  branches: Branch[];
  serviceTypes: string[];
  recheckReasonOptions: string[];
  stoneTypes: string[];
  shapes: string[];
  stones: StoneInput[];
  onStoneChange: (index: number, field: keyof StoneInput, value: string | boolean) => void;
  onAddStone: () => void;
  onRemoveStone: (index: number) => void;
  creating: boolean;
  isFormValid: () => boolean;
  onSubmit: () => void;
  /** Fires when an admin creates a new client from inside the job modal.
   *  Parent should refresh its `clients` list — the dialog auto-selects
   *  the newly-created client into `formData.client_id` so the operator
   *  can continue creating the job without leaving the modal. */
  onClientCreated?: (client: Client) => void | Promise<void>;
  /** Branch to preselect in the inline new-client dialog if the user
   *  hasn't already chosen a client (and therefore there's no client-derived
   *  branch yet). Typically the page's selectedBranchId or the operator's
   *  own branch for branch_admins. */
  defaultBranchId?: string;
}

export const CreateJobDialog: React.FC<CreateJobDialogProps> = ({
  open,
  onOpenChange,
  validationErrors,
  formData,
  setFormData,
  clients,
  branches,
  serviceTypes,
  recheckReasonOptions,
  stoneTypes,
  shapes,
  stones,
  onStoneChange,
  onAddStone,
  onRemoveStone,
  creating,
  isFormValid,
  onSubmit,
  onClientCreated,
  defaultBranchId,
}) => {
  const [newClientOpen, setNewClientOpen] = useState(false);

  // Track stones.length so we can auto-focus the freshly-added row's
  // first input. Pressing Enter on the last (Value) input now both
  // adds a new stone AND jumps focus into it, so admins can enter a
  // long list of stones without ever touching the mouse.
  const prevStoneCountRef = useRef(stones.length);
  useEffect(() => {
    if (stones.length > prevStoneCountRef.current) {
      // A row was added (vs. removed). Focus the new last row's first
      // editable control. The mobile path uses a SelectTrigger (no
      // native focus); we still call focus() — Radix will open the
      // popover if the user hits Enter/Space afterwards.
      const newIndex = stones.length - 1;
      // Use both data-testids — desktop and mobile branches render
      // mutually-exclusive trees, so only one selector resolves.
      const target =
        document.querySelector<HTMLElement>(`[data-testid="stone-type-${newIndex}"]`) ||
        document.querySelector<HTMLElement>(`[data-testid="stone-type-mobile-${newIndex}"]`);
      target?.focus();
    }
    prevStoneCountRef.current = stones.length;
  }, [stones.length]);

  // Pressing Enter on the Value input is the natural "I'm done with
  // this row, give me a new one" shortcut. We swallow the keystroke so
  // the dialog's implicit form-submit doesn't fire.
  const handleValueEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAddStone();
    }
  };

  return (
  <>
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-900">Create New Job</DialogTitle>
        <DialogDescription>Create a new job with stones for testing</DialogDescription>
      </DialogHeader>

      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm font-medium text-red-800 mb-1">Please fix the following errors:</p>
          <ul className="list-disc list-inside text-sm text-red-700">
            {validationErrors.map((error, idx) => (
              <li key={`err-${idx}-${error.slice(0, 20)}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6 py-4">
        {/* Job details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Client <span className="text-red-500">*</span></Label>
              {/* "+ New" affordance — opens the same CreateClientDialog used
                  on /dashboard/clients. After save, the newly-created
                  client is auto-selected via onCreated → setFormData. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-navy-700 hover:text-navy-900"
                onClick={() => setNewClientOpen(true)}
                data-testid="job-add-new-client-button"
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                New client
              </Button>
            </div>
            <SearchableSelect
              value={formData.client_id}
              onValueChange={(value) => {
                // When a client is picked, auto-derive the branch — jobs must live
                // in the client's branch (no cross-branch jobs).
                const c = clients.find((cl) => cl.id === value);
                setFormData({
                  ...formData,
                  client_id: value,
                  branch_id: c?.branch_id || '',
                });
              }}
              options={clients.map((c) => ({
                value: c.id,
                label: `${c.name}${c.company ? ` · ${c.company}` : ''}${c.email ? ` — ${c.email}` : ''}`,
              }))}
              placeholder="Select client..."
              searchPlaceholder="Search by name, company or email..."
              data-testid="job-client-select"
            />
            {formData.client_id && (() => {
              const c = clients.find((cl) => cl.id === formData.client_id);
              const b = branches.find((br) => br.id === c?.branch_id);
              return b ? (
                <p className="text-[11px] text-navy-500">
                  Branch: <span className="font-medium text-navy-700">{b.name}</span>
                  {b.code ? <span className="text-navy-400"> ({b.code})</span> : null}
                </p>
              ) : null;
            })()}
          </div>

          <div className="space-y-2">
            <Label>Service Type <span className="text-red-500">*</span></Label>
            <Select
              value={formData.service_type}
              onValueChange={(value) => {
                // When switching away from Recheck, clear any selected
                // reasons so they don't ride along into the payload.
                setFormData({
                  ...formData,
                  service_type: value,
                  recheck_reasons: value === 'Recheck' ? formData.recheck_reasons : [],
                });
              }}
            >
              <SelectTrigger data-testid="job-service-select">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {serviceTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Recheck reasons — only shown when service_type === Recheck.
                Multi-select: the user can pick e.g. "Origin + Color" if the
                stone is being re-examined on more than one axis. Required:
                backend rejects Recheck jobs with an empty list. */}
            {formData.service_type === 'Recheck' && (
              <div
                className="mt-3 p-3 border border-amber-200 bg-amber-50/40 rounded-md space-y-2"
                data-testid="recheck-reasons-block"
              >
                <Label className="text-sm text-amber-900 font-semibold">
                  Recheck reason(s) <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-amber-800/80">Pick one or more reasons. Admins can edit this list in Settings.</p>
                <div className="flex flex-wrap gap-2">
                  {recheckReasonOptions.map((reason) => {
                    const checked = formData.recheck_reasons.includes(reason);
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? formData.recheck_reasons.filter((r) => r !== reason)
                            : [...formData.recheck_reasons, reason];
                          setFormData({ ...formData, recheck_reasons: next });
                        }}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          checked
                            ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                            : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                        }`}
                        data-testid={`recheck-reason-${reason.toLowerCase()}`}
                        aria-pressed={checked}
                      >
                        {checked ? '✓ ' : ''}{reason}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Label className="text-base font-semibold">Stones <span className="text-red-500">*</span></Label>
              <p className="text-xs text-navy-500 mt-1">
                At least one stone required. Shape is optional. Toggle <strong>Parcel</strong> to
                combine multiple stones under a single certificate (weight &amp; value become totals).
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddStone}
              className="flex-shrink-0"
              data-testid="add-stone-button"
            >
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Add Stone</span>
            </Button>
          </div>

          {/* Mobile: stacked cards. Desktop: dense grid (≥ sm) */}
          <div className="border border-navy-200 rounded-lg overflow-hidden">
            {/* Desktop column headers */}
            <div className="hidden sm:grid grid-cols-[110px,1fr,110px,90px,100px,90px,110px,auto] gap-2 p-3 bg-navy-50 text-sm font-medium text-navy-700">
              <div>Kind</div>
              <div>Type <span className="text-red-500">*</span></div>
              <div>Customer SKU</div>
              <div>
                Weight <span className="text-red-500">*</span>
                <span className="text-[10px] font-normal text-navy-500 block">total if parcel</span>
              </div>
              <div>Shape</div>
              <div>Count</div>
              <div>
                Value <span className="text-red-500">*</span>
                <span className="text-[10px] font-normal text-navy-500 block">total if parcel</span>
              </div>
              <div></div>
            </div>

            {stones.map((stone, index) => {
              const isParcel = Boolean(stone.is_parcel);
              return (
              <div
                key={stone._uid}
                className={`border-t border-navy-200 first:border-t-0 sm:first:border-t ${isParcel ? 'bg-amber-50/40' : ''}`}
                data-testid={`create-job-stone-row-${index}`}
              >
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-[110px,1fr,110px,90px,100px,90px,110px,auto] gap-2 p-3 items-center">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={isParcel}
                      onCheckedChange={(checked) => {
                        onStoneChange(index, 'is_parcel', checked);
                        if (checked && !stone.stone_count) {
                          onStoneChange(index, 'stone_count', '2');
                        }
                      }}
                      className="scale-90"
                      data-testid={`stone-parcel-toggle-${index}`}
                    />
                    <span className={`inline-flex items-center gap-1 font-medium ${isParcel ? 'text-amber-700' : 'text-navy-600'}`}>
                      {isParcel ? <><Package className="h-3 w-3" /> Parcel</> : <><Gem className="h-3 w-3" /> Single</>}
                    </span>
                  </div>
                  <Select
                    value={stone.stone_type}
                    onValueChange={(value) => onStoneChange(index, 'stone_type', value)}
                  >
                    <SelectTrigger data-testid={`stone-type-${index}`}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {stoneTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Optional"
                    maxLength={64}
                    value={stone.customer_sku || ''}
                    onChange={(e) => onStoneChange(index, 'customer_sku', e.target.value)}
                    className="border-navy-200"
                    data-testid={`stone-customer-sku-${index}`}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={stone.weight}
                    onChange={(e) => onStoneChange(index, 'weight', e.target.value)}
                    className="border-navy-200"
                    data-testid={`stone-weight-${index}`}
                  />
                  <Select
                    value={stone.shape}
                    onValueChange={(value) => onStoneChange(index, 'shape', value)}
                  >
                    <SelectTrigger data-testid={`stone-shape-${index}`}>
                      <SelectValue placeholder="Shape" />
                    </SelectTrigger>
                    <SelectContent>
                      {shapes.map((shape) => (
                        <SelectItem key={shape} value={shape}>{shape}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isParcel ? (
                    <Input
                      type="number"
                      step="1"
                      min="2"
                      placeholder="≥2"
                      value={stone.stone_count || ''}
                      onChange={(e) => onStoneChange(index, 'stone_count', e.target.value)}
                      className="border-navy-200"
                      data-testid={`stone-count-${index}`}
                    />
                  ) : (
                    <span className="text-xs text-navy-300 text-center">—</span>
                  )}
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={stone.value}
                    onChange={(e) => onStoneChange(index, 'value', e.target.value)}
                    onKeyDown={handleValueEnter}
                    className="border-navy-200"
                    data-testid={`stone-value-${index}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveStone(index)}
                    disabled={stones.length === 1}
                    // Skip the delete button in the natural tab order —
                    // it's a destructive action and shouldn't sit
                    // between "I finished this stone" and the next row.
                    tabIndex={-1}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Mobile stacked card */}
                <div className="sm:hidden p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">
                      {isParcel ? `Parcel ${index + 1}` : `Stone ${index + 1}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-navy-500">Parcel</span>
                      <Switch
                        checked={isParcel}
                        onCheckedChange={(checked) => {
                          onStoneChange(index, 'is_parcel', checked);
                          if (checked && !stone.stone_count) {
                            onStoneChange(index, 'stone_count', '2');
                          }
                        }}
                        className="scale-75"
                        data-testid={`stone-parcel-toggle-mobile-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveStone(index)}
                        disabled={stones.length === 1}
                        tabIndex={-1}
                        className="text-red-500 hover:text-red-600 h-7 w-7"
                        data-testid={`remove-stone-mobile-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type <span className="text-red-500">*</span></Label>
                    <Select
                      value={stone.stone_type}
                      onValueChange={(value) => onStoneChange(index, 'stone_type', value)}
                    >
                      <SelectTrigger data-testid={`stone-type-mobile-${index}`}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {stoneTypes.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Customer SKU</Label>
                    <Input
                      placeholder="Optional"
                      maxLength={64}
                      value={stone.customer_sku || ''}
                      onChange={(e) => onStoneChange(index, 'customer_sku', e.target.value)}
                      className="border-navy-200"
                      data-testid={`stone-customer-sku-mobile-${index}`}
                    />
                  </div>
                  <div className={`grid gap-2 ${isParcel ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {isParcel && (
                      <div className="space-y-1.5">
                        <Label className="text-xs"># Stones <span className="text-red-500">*</span></Label>
                        <Input
                          type="number"
                          step="1"
                          min="2"
                          placeholder="≥2"
                          value={stone.stone_count || ''}
                          onChange={(e) => onStoneChange(index, 'stone_count', e.target.value)}
                          className="border-navy-200"
                          data-testid={`stone-count-mobile-${index}`}
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">{isParcel ? 'Total wt (ct)' : 'Weight (ct)'} <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={stone.weight}
                        onChange={(e) => onStoneChange(index, 'weight', e.target.value)}
                        className="border-navy-200"
                        data-testid={`stone-weight-mobile-${index}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{isParcel ? 'Total $' : 'Value (USD)'} <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={stone.value}
                        onChange={(e) => onStoneChange(index, 'value', e.target.value)}
                        onKeyDown={handleValueEnter}
                        className="border-navy-200"
                        data-testid={`stone-value-mobile-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Shape</Label>
                    <Select
                      value={stone.shape}
                      onValueChange={(value) => onStoneChange(index, 'shape', value)}
                    >
                      <SelectTrigger data-testid={`stone-shape-mobile-${index}`}>
                        <SelectValue placeholder="Shape" />
                      </SelectTrigger>
                      <SelectContent>
                        {shapes.map((shape) => (
                          <SelectItem key={shape} value={shape}>{shape}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );})}
          </div>
        </div>
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={creating || !isFormValid()}
          className="bg-navy-900 hover:bg-navy-800 w-full sm:w-auto"
          data-testid="confirm-create-job-button"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
          ) : 'Create Job'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <CreateClientDialog
    open={newClientOpen}
    onOpenChange={setNewClientOpen}
    // The CreateClientDialog has its own Branch type but the shapes are
    // identical (id/name/code). Cast at the boundary to keep both type
    // modules independent.
    branches={branches as unknown as ClientsBranch[]}
    defaultBranchId={formData.branch_id || defaultBranchId || ''}
    onCreated={async (newClient) => {
      // Auto-select the new client in the job form and adopt its branch.
      setFormData({
        ...formData,
        client_id: newClient.id,
        branch_id: newClient.branch_id,
      });
      // Let the parent refresh its `clients` list so the SearchableSelect
      // shows the new entry on next interaction.
      if (onClientCreated) {
        // The ClientsClient type already extends our Client shape (same
        // fields). Cast at the boundary.
        await onClientCreated(newClient as unknown as Client);
      }
    }}
  />
  </>
);
};
