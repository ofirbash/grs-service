"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const JOB_STATUSES: Array<[string, string]> = [
  ['draft', 'Draft'],
  ['stones_accepted', 'Stones Accepted'],
  ['sent_to_lab', 'Sent to Lab'],
  ['verbal_uploaded', 'Verbal Uploaded'],
  ['stones_returned', 'Stones Returned'],
  ['cert_uploaded', 'Cert. Uploaded'],
  ['cert_returned', 'Cert. Returned'],
  ['done', 'Done'],
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  bulkStatus: string;
  setBulkStatus: (status: string) => void;
  updating: boolean;
  onConfirm: () => void;
}

/** Sets the same status on the currently-checked jobs of a shipment.
 *  Pulled out of shipments/page.tsx — pure presentational, parent owns state. */
export const BulkStatusDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  selectedCount,
  bulkStatus,
  setBulkStatus,
  updating,
  onConfirm,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-900">Update Job Status</DialogTitle>
        <DialogDescription>
          Update status for {selectedCount} selected job(s)
        </DialogDescription>
      </DialogHeader>

      <div className="py-4">
        <Label className="text-navy-700 mb-2 block">New Status</Label>
        <Select value={bulkStatus} onValueChange={setBulkStatus}>
          <SelectTrigger data-testid="bulk-status-select">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {JOB_STATUSES.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={updating || !bulkStatus}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-bulk-status-button"
        >
          {updating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</>
          ) : (
            'Update Status'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
