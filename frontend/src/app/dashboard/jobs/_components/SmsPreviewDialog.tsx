import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, MessageSquare } from 'lucide-react';

export interface SmsPreviewData {
  name: string;
  phone: string;
  message: string;
}

interface SmsPreviewDialogProps {
  preview: SmsPreviewData | null;
  onClose: () => void;
  onConfirm: () => void;
  sending: boolean;
}

export const SmsPreviewDialog: React.FC<SmsPreviewDialogProps> = ({
  preview, onClose, onConfirm, sending,
}) => (
  <Dialog open={!!preview} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          SMS Preview
        </DialogTitle>
        <DialogDescription>Review the message before sending</DialogDescription>
      </DialogHeader>
      {preview && (
        <div className="space-y-3">
          <div className="text-xs text-navy-500">
            <span className="font-medium">To:</span> {preview.name} ({preview.phone})
          </div>
          <div className="bg-navy-50 border border-navy-200 rounded-lg p-3 text-sm text-navy-900 whitespace-pre-wrap">
            {preview.message}
          </div>
          <p className="text-[10px] text-navy-400">{preview.message.length} characters</p>
        </div>
      )}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={onConfirm}
          disabled={sending}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="confirm-send-sms-button"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
          ) : (
            <><MessageSquare className="h-4 w-4 mr-2" />Send SMS</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
