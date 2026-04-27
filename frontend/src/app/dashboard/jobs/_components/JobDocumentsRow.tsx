import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Upload, Eye, Receipt, FileText, CheckCircle2, Loader2,
} from 'lucide-react';
import type { Job } from '../_types';

interface JobDocumentsRowProps {
  job: Job;
  isAdmin: boolean;
  // Memo
  memoInputRef: React.RefObject<HTMLInputElement>;
  uploadingMemo: boolean;
  onMemoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewMemo: () => void;
  // Client invoice
  generatingInvoice: boolean;
  onGenerateInvoice: () => void;
  onViewInvoice: () => void;
  // Lab invoice
  labInvoiceInputRef: React.RefObject<HTMLInputElement>;
  uploadingLabInvoice: boolean;
  onLabInvoiceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewLabInvoice: () => void;
}

/**
 * Document cards inside the View Job dialog's Actions sidebar:
 * Signed Memo, Client Invoice, Lab Invoice.
 *
 * The Payment + Notifications cards remain side-by-side with these in the
 * parent grid (we don't render those here — the parent composes the row).
 */
export const JobDocumentsRow: React.FC<JobDocumentsRowProps> = ({
  job,
  isAdmin,
  memoInputRef,
  uploadingMemo,
  onMemoChange,
  onViewMemo,
  generatingInvoice,
  onGenerateInvoice,
  onViewInvoice,
  labInvoiceInputRef,
  uploadingLabInvoice,
  onLabInvoiceChange,
  onViewLabInvoice,
}) => (
  <>
    {/* Signed Memo - hide for clients when no memo uploaded */}
    {(isAdmin || job.signed_memo_url) && (
      <div className="rounded-lg border border-navy-200 p-3 space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Upload className="h-3.5 w-3.5" />
          Signed Memo
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <input
                type="file"
                ref={memoInputRef}
                onChange={onMemoChange}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => memoInputRef.current?.click()}
                disabled={uploadingMemo}
                className="text-xs"
                data-testid="upload-memo-button"
              >
                {uploadingMemo ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="h-3 w-3 mr-1" />{job.signed_memo_url ? 'Replace' : 'Upload'}</>
                )}
              </Button>
            </>
          )}
          {job.signed_memo_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewMemo}
              className="text-xs"
              data-testid="view-memo-button"
            >
              <Eye className="h-3 w-3 mr-1" />View
            </Button>
          )}
        </div>
      </div>
    )}

    {/* Client Invoice */}
    {isAdmin && (
      <div className="rounded-lg border border-navy-200 p-3 space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5" />
          Client Invoice
          <Badge variant="secondary" className="bg-navy-900 text-white text-[10px] px-1.5 py-0">Email</Badge>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateInvoice}
            disabled={generatingInvoice}
            className="text-xs border-navy-300"
            data-testid="generate-invoice-button"
          >
            {generatingInvoice ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating...</>
            ) : (
              <><Receipt className="h-3 w-3 mr-1" />{job.invoice_url ? 'Regenerate' : 'Generate'}</>
            )}
          </Button>
          {job.invoice_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewInvoice}
              className="text-xs"
              data-testid="view-invoice-button"
            >
              <Eye className="h-3 w-3 mr-1" />View
            </Button>
          )}
        </div>
        {job.invoice_url && (
          <p className="text-[10px] text-navy-500">
            <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5" />
            Attached to &quot;Stones Returned&quot; email
          </p>
        )}
      </div>
    )}

    {/* Lab Invoice */}
    {isAdmin && (
      <div className="rounded-lg border border-navy-200 p-3 space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          Lab Invoice
          <Badge variant="secondary" className="bg-navy-200 text-navy-700 text-[10px] px-1.5 py-0">Admin</Badge>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={labInvoiceInputRef}
            type="file"
            onChange={onLabInvoiceChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => labInvoiceInputRef.current?.click()}
            disabled={uploadingLabInvoice}
            className="text-xs"
            data-testid="upload-lab-invoice-button"
          >
            {uploadingLabInvoice ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading...</>
            ) : (
              <><Upload className="h-3 w-3 mr-1" />{job.lab_invoice_url ? 'Replace' : 'Upload'}</>
            )}
          </Button>
          {job.lab_invoice_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewLabInvoice}
              className="text-xs"
              data-testid="view-lab-invoice-button"
            >
              <Eye className="h-3 w-3 mr-1" />View
            </Button>
          )}
        </div>
      </div>
    )}
  </>
);
