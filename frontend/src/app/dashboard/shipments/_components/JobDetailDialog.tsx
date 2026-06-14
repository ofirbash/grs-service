"use client";

import React from 'react';
import {
  Eye,
  FileText,
  Gem,
  Loader2,
  Pencil,
  Printer,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JOB_STATUSES } from '@/lib/jobStatuses';
import { JobStonesTable } from '@/components/jobs/JobStonesTable';
import type { Job, Stone } from '../_types';

interface EditJobFormData {
  notes: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;

  // top-right actions
  onPrint: () => void;
  onOpenInNewTab: () => void;

  // edit mode
  editMode: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  editForm: EditJobFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditJobFormData>>;
  onSaveEdit: () => void;

  // memo upload
  memoInputRef: React.RefObject<HTMLInputElement>;
  uploadingMemo: boolean;
  onMemoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewMemo: () => void;

  // stones
  onOpenStone: (stone: Stone) => void;
}

/** Read-only-ish job detail dialog opened from the shipment view (and a few
 *  other places). Includes edit-status + edit-notes form, signed-memo upload,
 *  and a stones table with certificate grouping. Extracted from
 *  shipments/page.tsx — the jobs/page.tsx still has its own inline copy that
 *  we'll consolidate in a follow-up. */
export const JobDetailDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  job,
  onPrint,
  onOpenInNewTab,
  editMode,
  startEdit,
  cancelEdit,
  editForm,
  setEditForm,
  onSaveEdit,
  memoInputRef,
  uploadingMemo,
  onMemoChange,
  onViewMemo,
  onOpenStone,
}) => (
  <Dialog
    open={open}
    onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) cancelEdit();
    }}
  >
    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
          <span>Job #{job?.job_number}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onPrint} data-testid="print-job-shipment-button">
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={startEdit} data-testid="edit-job-shipment-button">
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenInNewTab} data-testid="open-job-new-tab">
              <FileText className="h-4 w-4 mr-1" />
              Open in New Tab
            </Button>
          </div>
        </DialogTitle>
        <DialogDescription>
          {job?.client_name} | {job?.branch_name || 'N/A'}
        </DialogDescription>
      </DialogHeader>

      {job && (
        <div className="space-y-4 py-4">
          {/* Edit Mode */}
          {editMode ? (
            <div className="space-y-4 p-4 bg-navy-50 rounded-lg border-2 border-amber-400">
              <h3 className="font-semibold text-navy-800 flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit Job
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JOB_STATUSES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="bg-white"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                  <Button onClick={onSaveEdit}>Save Changes</Button>
                </div>
              </div>
            </div>
          ) : (
            /* Job Info (View Mode) */
            <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
              <div>
                <Label className="text-navy-500 text-xs">Service Type</Label>
                <p className="font-medium text-navy-900">{job.service_type || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Status</Label>
                <Badge variant="secondary">{job.status.replace(/_/g, ' ')}</Badge>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Total Stones</Label>
                <p className="font-medium text-navy-900">{job.total_stones}</p>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Total Value</Label>
                <p className="font-medium text-navy-900">${job.total_value.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Total Fee</Label>
                <p className="font-medium text-navy-900">${job.total_fee.toLocaleString()}</p>
              </div>
            </div>
          )}

          {job.notes && !editMode && (
            <div>
              <Label className="text-navy-500">Notes</Label>
              <p className="font-medium text-navy-900">{job.notes}</p>
            </div>
          )}

          {/* Signed Memo Section */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Signed Memo
            </Label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="file"
                ref={memoInputRef}
                onChange={onMemoChange}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => memoInputRef.current?.click()}
                disabled={uploadingMemo}
                data-testid="upload-memo-shipment-button"
              >
                {uploadingMemo ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{job.signed_memo_url ? 'Replace Memo' : 'Upload Memo'}</>
                )}
              </Button>

              {job.signed_memo_url && (
                <Button variant="outline" onClick={onViewMemo} data-testid="view-memo-shipment-button">
                  <Eye className="h-4 w-4 mr-2" />
                  View Memo
                </Button>
              )}
            </div>
          </div>

          {/* Stones Table with Certificate Grouping — uses the canonical
              `<JobStonesTable variant='compact'>` so cert-grouping logic
              stays in lockstep with the jobs page. */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
              <Gem className="h-4 w-4" />
              Stones ({job.stones?.length || 0})
            </Label>
            <JobStonesTable
              variant="compact"
              stones={(job.stones ?? []) as unknown as React.ComponentProps<typeof JobStonesTable>['stones']}
              onOpenStone={(stone) => onOpenStone(stone as unknown as Stone)}
            />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
