import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Mail, Send, FileText } from 'lucide-react';
import type { NotificationPreview } from '../_types';

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  preview: NotificationPreview | null;
  sending: boolean;
  onSend: () => void;
}

export const EmailPreviewDialog: React.FC<EmailPreviewDialogProps> = ({
  open, onOpenChange, loading, preview, sending, onSend,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Review Email Before Sending
        </DialogTitle>
        <DialogDescription>
          Preview the email content before sending to the client.
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
        </div>
      ) : preview ? (
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-navy-50 rounded-lg">
            <div>
              <Label className="text-navy-500 text-xs">To</Label>
              <p className="font-medium text-navy-900">{preview.recipient_email}</p>
              <p className="text-sm text-navy-600">{preview.recipient_name}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Job</Label>
              <p className="font-medium text-navy-900">#{preview.job_number}</p>
            </div>
            <div className="col-span-2">
              <Label className="text-navy-500 text-xs">Subject</Label>
              <p className="font-medium text-navy-900">{preview.subject}</p>
            </div>
            {preview.attachments.length > 0 && (
              <div className="col-span-2">
                <Label className="text-navy-500 text-xs">Attachments</Label>
                <div className="flex gap-2 mt-1">
                  {preview.attachments.map((att, idx) => (
                    <Badge
                      key={`att-${idx}-${att.name}`}
                      variant="secondary"
                      className="bg-navy-200 text-navy-700"
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      {att.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sandboxed iframe to prevent XSS from any untrusted fields */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-navy-100 px-4 py-2 text-sm font-medium text-navy-700 border-b">
              Email Preview
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview.html_body}
              sandbox=""
              style={{ height: '400px' }}
              className="w-full border-0 bg-white"
              data-testid="notification-email-preview"
            />
          </div>

          {!preview.can_send && (
            <div className="bg-navy-50 border border-navy-200 rounded-lg p-4">
              <p className="text-navy-700 text-sm">
                <strong>Note:</strong> Email sending is not configured. The API key may be missing.
              </p>
            </div>
          )}
        </div>
      ) : null}

      <DialogFooter className="border-t pt-4 mt-auto">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={onSend}
          disabled={sending || !preview?.can_send}
          className="bg-green-600 hover:bg-green-700"
          data-testid="send-notification-button"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
          ) : (
            <><Send className="h-4 w-4 mr-2" />Send Email</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
