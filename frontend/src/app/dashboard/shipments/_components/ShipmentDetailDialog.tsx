"use client";

import React from 'react';
import {
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { summariseJob } from './JobPickerRow';
import { PrintMemoMenu } from './PrintMemoMenu';
import type { MemoCategory } from '../_print/shipment-memo';
import type { Job, Shipment, ShipmentOptions } from '../_types';

interface EditFormData {
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
  shipment: Shipment | null;
  jobs: Job[];

  // top-right actions
  generatingPdf: boolean;
  onPrintPdf: (category: MemoCategory) => void;
  printCategories: Array<'precious' | 'semi'>;
  editing: boolean;
  onToggleEdit: () => void;
  onAddJobs: () => void;

  // edit form
  editFormData: EditFormData;
  setEditFormData: React.Dispatch<React.SetStateAction<EditFormData>>;
  options: ShipmentOptions | null;
  savingEdit: boolean;
  onSaveEdit: () => void;
  onCancelShipment: () => void;

  // jobs table
  isAdmin: boolean;
  selectedShipmentJobs: string[];
  toggleShipmentJobSelection: (id: string) => void;
  selectAllShipmentJobs: (jobs: Job[]) => void;
  onOpenBulkStatus: () => void;
  onRemoveJob: (jobId: string, jobNumber: number) => void;
  onOpenJob: (job: Job) => void;

  // helpers
  formatShipmentType: (t: string) => string;
  getStatusBadge: (s: string) => React.ReactNode;
  shipmentTypeIcon: (t: string) => React.ReactNode;
}

/** Big shipment-detail modal: compact header meta strip, body with edit form
 *  OR jobs table, and a sticky totals footer. Parent owns all the state and
 *  API handlers; this component is pure JSX wiring. Extracted from
 *  shipments/page.tsx (Feb 25, 2026). */
export const ShipmentDetailDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  shipment,
  jobs,
  generatingPdf,
  onPrintPdf,
  printCategories,
  editing,
  onToggleEdit,
  onAddJobs,
  editFormData,
  setEditFormData,
  options,
  savingEdit,
  onSaveEdit,
  onCancelShipment,
  isAdmin,
  selectedShipmentJobs,
  toggleShipmentJobSelection,
  selectAllShipmentJobs,
  onOpenBulkStatus,
  onRemoveJob,
  onOpenJob,
  formatShipmentType,
  getStatusBadge,
  shipmentTypeIcon,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
      <DialogHeader className="px-6 pt-5 pb-3 border-b border-navy-100 shrink-0">
        <DialogTitle className="text-xl text-navy-800 flex items-center justify-between gap-3">
          <span>Shipment #{shipment?.shipment_number}</span>
          {shipment && (
            <div className="flex gap-2">
              <PrintMemoMenu
                categories={printCategories}
                generating={generatingPdf}
                onPrint={onPrintPdf}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleEdit}
                data-testid="edit-shipment-button"
              >
                <Pencil className="h-4 w-4 mr-1" />
                {editing ? 'Cancel Edit' : 'Edit'}
              </Button>
              {shipment.status !== 'delivered' && shipment.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddJobs}
                  data-testid="add-jobs-button"
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Add Jobs
                </Button>
              )}
            </div>
          )}
        </DialogTitle>
        {/* Compact meta strip — replaces the old 2x3 grid that pushed the
            table below the fold. Each chip is read-only; click "Edit" to
            modify. Stays visible while the jobs table scrolls because the
            whole DialogHeader is outside the scroll container. */}
        {shipment && !editing && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-navy-600 pt-1">
            <span className="inline-flex items-center gap-1.5">
              {shipmentTypeIcon(shipment.shipment_type)}
              <span className="font-medium text-navy-800">{formatShipmentType(shipment.shipment_type)}</span>
            </span>
            <span>{getStatusBadge(shipment.status)}</span>
            <span><span className="text-navy-500">Courier:</span> <span className="font-medium text-navy-800">{shipment.courier}</span></span>
            {shipment.tracking_number && (
              <span><span className="text-navy-500">Tracking:</span> <span className="font-mono font-medium text-navy-800">{shipment.tracking_number}</span></span>
            )}
            <span><span className="text-navy-500">From:</span> <span className="font-medium text-navy-800">{shipment.source_address}</span></span>
            <span>→</span>
            <span><span className="text-navy-500">To:</span> <span className="font-medium text-navy-800">{shipment.destination_address}</span></span>
            {shipment.date_sent && (
              <span><span className="text-navy-500">Sent:</span> <span className="font-medium text-navy-800">{shipment.date_sent}</span></span>
            )}
          </div>
        )}
      </DialogHeader>

      {shipment && (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-navy-500">Type</Label>
                  <Select value={editFormData.shipment_type} onValueChange={(v) => setEditFormData({ ...editFormData, shipment_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options?.shipment_types.map((t) => (<SelectItem key={t} value={t}>{formatShipmentType(t)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-navy-500">Courier</Label>
                  <Select value={editFormData.courier} onValueChange={(v) => setEditFormData({ ...editFormData, courier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options?.couriers.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-navy-500">From</Label>
                  <Select value={editFormData.source_address} onValueChange={(v) => setEditFormData({ ...editFormData, source_address: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options?.address_options.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-navy-500">To</Label>
                  <Select value={editFormData.destination_address} onValueChange={(v) => setEditFormData({ ...editFormData, destination_address: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options?.address_options.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-navy-500">Tracking Number</Label>
                  <Input value={editFormData.tracking_number} onChange={(e) => setEditFormData({ ...editFormData, tracking_number: e.target.value })} className="border-navy-200" />
                </div>
                <div className="space-y-1">
                  <Label className="text-navy-500">Date Sent</Label>
                  <Input
                    type="date"
                    value={editFormData.date_sent}
                    onChange={(e) => setEditFormData({ ...editFormData, date_sent: e.target.value })}
                    className="border-navy-200"
                    data-testid="edit-date-sent-input"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-navy-500">Notes</Label>
                  <Input value={editFormData.notes} onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} className="border-navy-200" />
                </div>
              </div>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                {/* Cancel Shipment lives ONLY in edit mode now — it used to
                    sit at the top-right of the modal which read like a
                    close-modal button. Cancelling is a rare destructive
                    action so it belongs alongside the other edit
                    affordances. Hidden once the shipment is already
                    cancelled or completed (terminal states). */}
                {shipment.status !== 'cancelled' && shipment.status !== 'completed' ? (
                  <Button
                    variant="outline"
                    onClick={onCancelShipment}
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    data-testid="cancel-shipment-button"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancel Shipment
                  </Button>
                ) : <span />}
                <Button onClick={onSaveEdit} disabled={savingEdit} className="bg-navy-900 hover:bg-navy-800" data-testid="save-shipment-edit-button">
                  {savingEdit ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
                </Button>
              </div>
            </div>
          ) : null}

          {shipment.notes && !editing && (
            <div>
              <Label className="text-navy-500">Notes</Label>
              <p className="font-medium text-navy-900">{shipment.notes}</p>
            </div>
          )}

          {/* Jobs Table */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">
                Jobs in Shipment ({jobs.length})
              </Label>
              {jobs.length > 0 && selectedShipmentJobs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenBulkStatus}
                  data-testid="bulk-status-button"
                >
                  Update Status ({selectedShipmentJobs.length})
                </Button>
              )}
            </div>
            {jobs.length > 0 ? (
              <>
                {/* Mobile Cards */}
                <div className="md:hidden space-y-2">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="border border-navy-200 rounded-lg p-2.5 active:bg-navy-50 relative"
                      onClick={() => onOpenJob(job)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-navy-900 text-sm">#{job.job_number}</span>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(job.status)}
                          {isAdmin && editing && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onRemoveJob(job.id, job.job_number); }}
                              className="text-red-500 p-1 -mr-1 rounded active:bg-red-50"
                              title="Remove job from shipment"
                              data-testid={`remove-job-from-shipment-mobile-${job.job_number}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-navy-500 mt-0.5">
                        {job.client_name || '-'} &middot; {job.total_stones} stones &middot; ${job.total_value.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="text-navy-700 w-12">
                          <input
                            type="checkbox"
                            checked={jobs.length > 0 && selectedShipmentJobs.length === jobs.length}
                            onChange={() => selectAllShipmentJobs(jobs)}
                            className="h-4 w-4 rounded border-navy-300"
                            data-testid="select-all-shipment-jobs"
                          />
                        </TableHead>
                        <TableHead className="text-navy-700">Job #</TableHead>
                        <TableHead className="text-navy-700">Client</TableHead>
                        <TableHead className="text-navy-700">Stones</TableHead>
                        <TableHead className="text-navy-700">Value</TableHead>
                        <TableHead className="text-navy-700">Status</TableHead>
                        {isAdmin && editing && <TableHead className="text-navy-700 w-10"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow
                          key={job.id}
                          className={`cursor-pointer hover:bg-navy-100 ${selectedShipmentJobs.includes(job.id) ? 'bg-navy-100' : ''}`}
                          data-testid={`shipment-job-row-${job.job_number}`}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedShipmentJobs.includes(job.id)}
                              onChange={() => toggleShipmentJobSelection(job.id)}
                              className="h-4 w-4 rounded border-navy-300"
                              data-testid={`select-shipment-job-${job.job_number}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium" onClick={() => onOpenJob(job)}>#{job.job_number}</TableCell>
                          <TableCell onClick={() => onOpenJob(job)}>{job.client_name || '-'}</TableCell>
                          <TableCell onClick={() => onOpenJob(job)}>{job.total_stones}</TableCell>
                          <TableCell onClick={() => onOpenJob(job)}>${job.total_value.toLocaleString()}</TableCell>
                          <TableCell onClick={() => onOpenJob(job)}>
                            <Badge variant="secondary">{job.status.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          {isAdmin && editing && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => onRemoveJob(job.id, job.job_number)}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                title="Remove job from shipment"
                                data-testid={`remove-job-from-shipment-${job.job_number}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <p className="text-navy-400 text-center py-4">No jobs in this shipment</p>
            )}
          </div>
        </div>
      )}

      {/* Sticky footer — aggregates the loaded jobs (so weight / certs /
          fee reflect the same data the operator just scrolled past). The
          older standalone "Summary" box was floating *inside* the scroll
          region which meant operators had to scroll back down to see
          totals after inspecting jobs. */}
      {shipment && (() => {
        const totals = jobs.reduce(
          (acc, j) => {
            const s = summariseJob(j);
            acc.stones += s.stones;
            acc.certificates += s.certificates;
            acc.weight += s.weightCt;
            acc.fee += s.fee;
            acc.value += s.value;
            return acc;
          },
          { stones: 0, certificates: 0, weight: 0, fee: 0, value: 0 },
        );
        return (
          <div
            className="shrink-0 border-t border-navy-100 bg-navy-50/60 px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
            data-testid="shipment-totals-footer"
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span><span className="text-navy-500">Jobs</span>{' '}<span className="font-semibold text-navy-900" data-testid="totals-jobs">{jobs.length}</span></span>
              <span><span className="text-navy-500">Stones</span>{' '}<span className="font-semibold text-navy-900" data-testid="totals-stones">{totals.stones}</span></span>
              <span><span className="text-navy-500">Certificates</span>{' '}<span className="font-semibold text-navy-900" data-testid="totals-certificates">{totals.certificates}</span></span>
              <span><span className="text-navy-500">Weight</span>{' '}<span className="font-semibold text-navy-900" data-testid="totals-weight">{totals.weight.toFixed(2)} ct</span></span>
              <span><span className="text-navy-500">Fees</span>{' '}<span className="font-semibold text-navy-900" data-testid="totals-fees">${totals.fee.toLocaleString()}</span></span>
              <span><span className="text-navy-500">Value</span>{' '}<span className="font-semibold text-navy-900" data-testid="totals-value">${totals.value.toLocaleString()}</span></span>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        );
      })()}
    </DialogContent>
  </Dialog>
);
