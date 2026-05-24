import React from 'react';
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
import { Plus, Trash2, Loader2, Package, Gem } from 'lucide-react';
import type { Client, Branch } from '../_types';

export interface JobFormData {
  client_id: string;
  branch_id: string;
  service_type: string;
  notes: string;
}

export interface StoneInput {
  _uid: string;
  stone_type: string;
  weight: string;
  shape: string;
  value: string;
  // Parcel support (Feb 25, 2026). When `is_parcel` is true, this row
  // represents N physical stones rolled up under a single certificate;
  // `stone_count` holds N (>=2), weight/value are TOTALS.
  is_parcel?: boolean;
  stone_count?: string;
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
  stoneTypes: string[];
  shapes: string[];
  stones: StoneInput[];
  onStoneChange: (index: number, field: keyof StoneInput, value: string | boolean) => void;
  onAddStone: () => void;
  onRemoveStone: (index: number) => void;
  creating: boolean;
  isFormValid: () => boolean;
  onSubmit: () => void;
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
  stoneTypes,
  shapes,
  stones,
  onStoneChange,
  onAddStone,
  onRemoveStone,
  creating,
  isFormValid,
  onSubmit,
}) => (
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
            <Label>Client <span className="text-red-500">*</span></Label>
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
              onValueChange={(value) => setFormData({ ...formData, service_type: value })}
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
            <div className="hidden sm:grid grid-cols-[110px,1fr,90px,100px,90px,110px,auto] gap-2 p-3 bg-navy-50 text-sm font-medium text-navy-700">
              <div>Kind</div>
              <div>Type <span className="text-red-500">*</span></div>
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
                <div className="hidden sm:grid grid-cols-[110px,1fr,90px,100px,90px,110px,auto] gap-2 p-3 items-center">
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
                    className="border-navy-200"
                    data-testid={`stone-value-${index}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveStone(index)}
                    disabled={stones.length === 1}
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
);
