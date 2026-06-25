"use client";

import React from 'react';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JobPickerRow } from './JobPickerRow';
import { PartialStonesPicker } from './PartialStonesPicker';
import type { Job, ShipmentOptions } from '../_types';

export interface CreateShipmentFormData {
  shipment_type: string;
  courier: string;
  source_address: string;
  destination_address: string;
  tracking_number: string;
  date_sent: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CreateShipmentFormData;
  setFormData: React.Dispatch<React.SetStateAction<CreateShipmentFormData>>;
  options: ShipmentOptions | null;
  formatShipmentType: (t: string) => string;
  availableJobs: Job[];
  selectedJobs: string[];
  toggleJobSelection: (id: string) => void;
  selectedStoneIds: string[];
  setSelectedStoneIds: (ids: string[]) => void;
  creating: boolean;
  onConfirm: () => void;
}

/** Create-shipment modal: pick type/courier/from/to, optional tracking + date
 *  + notes, then check off jobs (and optional partial stones for return
 *  shipments). Extracted from shipments/page.tsx — parent still owns the
 *  state so all the validation lives in one place. */
export const CreateShipmentDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  formData,
  setFormData,
  options,
  formatShipmentType,
  availableJobs,
  selectedJobs,
  toggleJobSelection,
  selectedStoneIds,
  setSelectedStoneIds,
  creating,
  onConfirm,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-900">Create New Shipment</DialogTitle>
        <DialogDescription>
          Create a shipment to send jobs to the lab or return stones
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Shipment Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="shipment_type">Shipment Type *</Label>
            <Select
              value={formData.shipment_type}
              onValueChange={(value) => setFormData({ ...formData, shipment_type: value })}
            >
              <SelectTrigger data-testid="shipment-type-select">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {options?.shipment_types.map((type) => (
                  <SelectItem key={type} value={type}>{formatShipmentType(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="courier">Courier *</Label>
            <Select
              value={formData.courier}
              onValueChange={(value) => setFormData({ ...formData, courier: value })}
            >
              <SelectTrigger data-testid="courier-select">
                <SelectValue placeholder="Select courier" />
              </SelectTrigger>
              <SelectContent>
                {options?.couriers.map((courier) => (
                  <SelectItem key={courier} value={courier}>{courier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source_address">Source Address *</Label>
            <Select
              value={formData.source_address}
              onValueChange={(value) => setFormData({ ...formData, source_address: value })}
            >
              <SelectTrigger data-testid="source-address-select">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {options?.address_options.map((addr) => (
                  <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination_address">Destination Address *</Label>
            <Select
              value={formData.destination_address}
              onValueChange={(value) => setFormData({ ...formData, destination_address: value })}
            >
              <SelectTrigger data-testid="destination-address-select">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                {options?.address_options.map((addr) => (
                  <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label htmlFor="tracking_number">Tracking Number</Label>
            <Input
              id="tracking_number"
              value={formData.tracking_number}
              onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
              placeholder="Enter tracking number (optional)"
              className="border-navy-200"
              data-testid="tracking-number-input"
            />
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label htmlFor="date_sent">Date Sent</Label>
            <Input
              id="date_sent"
              type="date"
              value={formData.date_sent}
              onChange={(e) => setFormData({ ...formData, date_sent: e.target.value })}
              className="border-navy-200"
              data-testid="date-sent-input"
            />
            <p className="text-xs text-navy-500">Defaults to today if left empty</p>
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              className="border-navy-200"
              rows={2}
              data-testid="notes-textarea"
            />
          </div>
        </div>

        {/* Select Jobs */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Select Jobs to Include</Label>
          {availableJobs.length === 0 ? (
            <div className="p-4 text-center text-navy-500 bg-navy-50 rounded-lg">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-navy-400" />
              {formData.shipment_type ? (
                <>
                  <p>No eligible jobs for this shipment type</p>
                  <p className="text-sm">
                    {formData.shipment_type === 'send_stones_to_lab' && 'Only jobs at status "stones accepted" can be sent to the lab.'}
                    {formData.shipment_type === 'stones_from_lab' && 'Only jobs at status "verbal uploaded" can have stones returned.'}
                    {formData.shipment_type === 'certificates_from_lab' && 'Only jobs at status "verbal uploaded" or "cert uploaded" can have certificates returned.'}
                    {' Jobs already on a pending / in-transit shipment are hidden.'}
                  </p>
                </>
              ) : (
                <>
                  <p>Pick a shipment type first</p>
                  <p className="text-sm">The eligible jobs depend on whether you're sending stones to the lab, returning stones, or returning certificates.</p>
                </>
              )}
            </div>
          ) : (
            <div className="border border-navy-200 rounded-lg max-h-64 overflow-y-auto">
              {availableJobs.map((job) => (
                <JobPickerRow
                  key={job.id}
                  job={job}
                  selected={selectedJobs.includes(job.id)}
                  onToggle={() => toggleJobSelection(job.id)}
                  testid={`select-job-${job.job_number}`}
                />
              ))}
            </div>
          )}
          {selectedJobs.length > 0 && (
            <p className="text-sm text-navy-600">{selectedJobs.length} job(s) selected</p>
          )}
        </div>

        {/* Partial stones picker for return shipments (stones/certificates from lab) */}
        <PartialStonesPicker
          jobs={availableJobs.filter((j) => selectedJobs.includes(j.id))}
          shipmentType={formData.shipment_type}
          selectedStoneIds={selectedStoneIds}
          onChange={setSelectedStoneIds}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={
            creating ||
            !formData.shipment_type ||
            !formData.courier ||
            !formData.source_address ||
            !formData.destination_address
          }
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-create-shipment-button"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
          ) : (
            <><Plus className="h-4 w-4 mr-2" />Create Shipment</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
