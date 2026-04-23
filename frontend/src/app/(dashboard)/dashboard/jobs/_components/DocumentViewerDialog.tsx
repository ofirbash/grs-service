import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface DocumentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  url?: string;
  adminOnly?: boolean;
  maxWidth?: string;
}

/** Shared viewer for PDF/image attachments (certificate scans, memos, lab invoices). */
export const DocumentViewerDialog: React.FC<DocumentViewerDialogProps> = ({
  open,
  onOpenChange,
  title,
  url,
  adminOnly,
  maxWidth = 'sm:max-w-5xl',
}) => {
  const isPdf = !!url && (
    url.startsWith('data:application/pdf') ||
    url.toLowerCase().endsWith('.pdf')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidth} max-h-[95vh]`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            {adminOnly && (
              <Badge variant="secondary" className="bg-navy-200 text-navy-700">Admin Only</Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div
          className="flex items-center justify-center bg-gray-100 rounded-lg"
          style={{ minHeight: '500px', maxHeight: '75vh' }}
        >
          {url && (isPdf ? (
            <iframe
              src={url}
              className="w-full h-full rounded-lg"
              style={{ minHeight: '500px', maxHeight: '75vh' }}
              title={typeof title === 'string' ? title : 'Document preview'}
            />
          ) : (
            <img
              src={url}
              alt={typeof title === 'string' ? title : 'Document preview'}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
