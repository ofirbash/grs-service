import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Job } from '../_types';

export interface EditJobFormData {
  status: string;
  discount: string;
  notes: string;
}

interface JobSummaryGridProps {
  job: Job;
  editMode: boolean;
  editFormData: EditJobFormData;
  setEditFormData: (d: EditJobFormData) => void;
}

/**
 * Compact single-row job-summary strip rendered inside the View Job dialog
 * body. Saves ~60% vertical space compared to the previous 4-column grid.
 *
 * The status badge is no longer shown here — it lives in the sticky dialog
 * header next to the job number. Net total is rendered inline beside the
 * discount field when a discount is set.
 */
export const JobSummaryGrid: React.FC<JobSummaryGridProps> = ({
  job, editMode, editFormData, setEditFormData,
}) => {
  const netTotal = Math.max(0, job.total_fee - (job.discount || 0));
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 bg-navy-50 rounded-md text-sm">
        <span><span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Client</span><span className="font-medium text-navy-900">{job.client_name || 'N/A'}</span></span>
        <span className="text-navy-200">|</span>
        <span><span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Branch</span><span className="font-medium text-navy-900">{job.branch_name || 'N/A'}</span></span>
        <span className="text-navy-200">|</span>
        <span><span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Service</span><span className="font-medium text-navy-900">{job.service_type}</span></span>
        <span className="text-navy-200">|</span>
        <span><span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Value</span><span className="font-medium text-navy-900">${job.total_value.toLocaleString()}</span></span>
        <span className="text-navy-200">|</span>
        <span><span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Est. Fees</span><span className="font-medium text-navy-900">${job.total_fee.toLocaleString()}</span></span>
        {(editMode || (job.discount || 0) > 0) && (
          <>
            <span className="text-navy-200">|</span>
            <span className="flex items-center gap-1.5">
              <span className="text-navy-500 text-xs uppercase tracking-wide">Discount</span>
              {editMode ? (
                <span className="flex items-center gap-1">
                  <span className="text-navy-600 text-sm">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.discount}
                    onChange={(e) => setEditFormData({ ...editFormData, discount: e.target.value })}
                    className="h-7 w-24 border-navy-200 text-sm py-0"
                    placeholder="0"
                    data-testid="job-discount-input"
                  />
                </span>
              ) : (
                <span className="font-medium text-navy-900">-${(job.discount || 0).toLocaleString()}</span>
              )}
            </span>
            {(job.discount || 0) > 0 && (
              <>
                <span className="text-navy-200">|</span>
                <span><span className="text-navy-500 text-xs uppercase tracking-wide mr-1.5">Net Total</span><span className="font-bold text-navy-900">${netTotal.toLocaleString()}</span></span>
              </>
            )}
          </>
        )}
      </div>

      {/* Notes — only when present or in edit mode */}
      {editMode ? (
        <div>
          <Label className="text-navy-500 text-xs">Notes</Label>
          <Textarea
            value={editFormData.notes}
            onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
            className="mt-1"
            rows={2}
          />
        </div>
      ) : job.notes ? (
        <div className="px-3 py-1.5 text-sm text-navy-700 italic">
          <span className="text-navy-500 text-xs uppercase tracking-wide mr-2">Notes</span>
          {job.notes}
        </div>
      ) : null}
    </>
  );
};
