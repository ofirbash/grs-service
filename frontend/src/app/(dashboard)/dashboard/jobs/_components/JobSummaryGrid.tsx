import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  getStatusBadge: (status: string) => React.ReactNode;
}

/** Top info grid + notes section inside the View Job dialog. */
export const JobSummaryGrid: React.FC<JobSummaryGridProps> = ({
  job, editMode, editFormData, setEditFormData, getStatusBadge,
}) => (
  <>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      <div>
        <Label className="text-navy-500 text-xs">Client</Label>
        <p className="font-medium text-navy-900 text-sm">{job.client_name || 'N/A'}</p>
      </div>
      <div>
        <Label className="text-navy-500">Branch</Label>
        <p className="font-medium text-navy-900">{job.branch_name || 'N/A'}</p>
      </div>
      <div>
        <Label className="text-navy-500">Service Type</Label>
        <p className="font-medium text-navy-900">{job.service_type}</p>
      </div>
      <div>
        <Label className="text-navy-500">Status</Label>
        {editMode ? (
          <Select
            value={editFormData.status}
            onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
          >
            <SelectTrigger className="mt-1" data-testid="edit-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
              <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
              <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
              <SelectItem value="stones_returned">Stones Returned</SelectItem>
              <SelectItem value="cert_uploaded">Cert. Uploaded</SelectItem>
              <SelectItem value="cert_returned">Cert. Returned</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="mt-1">{getStatusBadge(job.status)}</div>
        )}
      </div>
      <div>
        <Label className="text-navy-500">Total Value</Label>
        <p className="font-medium text-navy-900">${job.total_value.toLocaleString()}</p>
      </div>
      <div>
        <Label className="text-navy-500">Total Est. Fees</Label>
        <p className="font-medium text-navy-900">${job.total_fee.toLocaleString()}</p>
      </div>
      <div>
        <Label className="text-navy-500">Discount</Label>
        {editMode ? (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-navy-600 text-sm">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={editFormData.discount}
              onChange={(e) => setEditFormData({ ...editFormData, discount: e.target.value })}
              className="h-7 w-24 border-navy-200 text-sm"
              placeholder="0"
              data-testid="job-discount-input"
            />
          </div>
        ) : (
          <p className="font-medium text-navy-900">
            {job.discount ? `-$${job.discount.toLocaleString()}` : '-'}
          </p>
        )}
      </div>
      {job.discount ? (
        <div>
          <Label className="text-navy-500 font-semibold">Net Total</Label>
          <p className="font-bold text-navy-900">
            ${Math.max(0, job.total_fee - (job.discount || 0)).toLocaleString()}
          </p>
        </div>
      ) : null}
    </div>

    {/* Notes */}
    {editMode ? (
      <div>
        <Label className="text-navy-500">Notes</Label>
        <Textarea
          value={editFormData.notes}
          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
          className="mt-1"
          rows={2}
        />
      </div>
    ) : job.notes ? (
      <div>
        <Label className="text-navy-500">Notes</Label>
        <p className="font-medium text-navy-900">{job.notes}</p>
      </div>
    ) : null}
  </>
);
