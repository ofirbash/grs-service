"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Generic image/PDF viewer modal. Used by the shipments page for both
 *  certificate scans and signed memos — they had identical markup so they
 *  share one component. PDFs render inside an iframe, images fit inside the
 *  bordered viewport. */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url?: string;
  alt: string;
}

export const FileViewerDialog: React.FC<Props> = ({ open, onOpenChange, title, url, alt }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-5xl max-h-[95vh]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div
        className="flex items-center justify-center bg-gray-100 rounded-lg"
        style={{ minHeight: '500px', maxHeight: '75vh' }}
      >
        {url && (url.startsWith('data:application/pdf') ? (
          <iframe
            src={url}
            className="w-full h-full rounded-lg"
            style={{ minHeight: '500px', maxHeight: '75vh' }}
            title={alt}
          />
        ) : (
          <img src={url} alt={alt} className="max-w-full max-h-[70vh] object-contain" />
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
