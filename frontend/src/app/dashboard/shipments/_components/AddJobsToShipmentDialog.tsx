"use client";

import React from 'react';
import { AlertCircle, Loader2, PlusCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { JobPickerRow } from './JobPickerRow';
import type { Job } from '../_types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentNumber: number | undefined;
  availableJobs: Job[];
  jobsToAdd: string[];
  setJobsToAdd: React.Dispatch<React.SetStateAction<string[]>>;
  adding: boolean;
  onConfirm: () => void;
}

/** Lets the operator append more jobs to an existing shipment.
 *  Lifted as-is from shipments/page.tsx — uses the shared JobPickerRow
 *  so each row shows full job details (client, stones, certs, weight, $). */
export const AddJobsToShipmentDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  shipmentNumber,
  availableJobs,
  jobsToAdd,
  setJobsToAdd,
  adding,
  onConfirm,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-900">
          Add Jobs to Shipment #{shipmentNumber}
        </DialogTitle>
        <DialogDescription>Select jobs to add to this shipment</DialogDescription>
      </DialogHeader>

      <div className="py-4">
        {availableJobs.length === 0 ? (
          <div className="p-4 text-center text-navy-500 bg-navy-50 rounded-lg">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-navy-400" />
            <p>No available jobs to add</p>
            <p className="text-sm">All jobs are either already in this shipment or completed</p>
          </div>
        ) : (
          <div className="border border-navy-200 rounded-lg max-h-64 overflow-y-auto">
            {availableJobs.map((job) => (
              <JobPickerRow
                key={job.id}
                job={job}
                selected={jobsToAdd.includes(job.id)}
                onToggle={() => {
                  setJobsToAdd((prev) =>
                    prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id]
                  );
                }}
                testid={`add-job-${job.job_number}`}
              />
            ))}
          </div>
        )}
        {jobsToAdd.length > 0 && (
          <p className="text-sm text-navy-600 mt-2">{jobsToAdd.length} job(s) selected</p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={adding || jobsToAdd.length === 0}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-add-jobs-button"
        >
          {adding ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>
          ) : (
            <><PlusCircle className="h-4 w-4 mr-2" />Add {jobsToAdd.length} Job(s)</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
