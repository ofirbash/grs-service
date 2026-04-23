import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Receipt, FileText } from 'lucide-react';

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSave: () => void;
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  open, onOpenChange, onDiscard, onSave,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogDescription>
          You have unsaved changes. Would you like to save before closing?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onDiscard} data-testid="discard-changes-button">
          Discard
        </Button>
        <Button
          onClick={onSave}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="save-and-close-button"
        >
          Save & Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface BulkStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  status: string;
  setStatus: (v: string) => void;
  updating: boolean;
  onConfirm: () => void;
}

export const BulkStatusDialog: React.FC<BulkStatusDialogProps> = ({
  open, onOpenChange, selectedCount, status, setStatus, updating, onConfirm,
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="bulk-status-select">
            <SelectValue placeholder="Select status" />
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
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={updating || !status}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-bulk-status-button"
        >
          {updating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</>
          ) : 'Update Status'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface ClientInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobNumber?: number;
  invoiceUrl?: string;
}

export const ClientInvoiceDialog: React.FC<ClientInvoiceDialogProps> = ({
  open, onOpenChange, jobNumber, invoiceUrl,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-4xl max-h-[90vh]">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Client Invoice - Job #{jobNumber}
        </DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-hidden" style={{ height: '70vh' }}>
        {invoiceUrl && (
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(invoiceUrl)}&embedded=true`}
            className="w-full h-full border-0"
            title="Invoice PDF"
          />
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        <Button
          onClick={() => invoiceUrl && window.open(invoiceUrl, '_blank')}
          className="bg-navy-900 hover:bg-navy-800"
        >
          <FileText className="h-4 w-4 mr-2" />
          Download
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
