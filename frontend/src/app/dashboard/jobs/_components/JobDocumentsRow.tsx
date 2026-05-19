import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload, Eye, Receipt, FileText, Loader2,
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
 * Three compact action clusters (Signed Memo, Client Invoice, Lab Invoice)
 * rendered inline in the View Job dialog's sticky footer bar.
 *
 * Previous version rendered each as a labelled card in a 4-column grid in
 * the scroll body — chewing up vertical space. This compact rendering keeps
 * the same affordances (upload/replace + view, generate + view, etc.) but
 * fits all three clusters plus the payment summary into a single sticky
 * row above the dialog's primary footer.
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
    {/* Signed Memo */}
    {(isAdmin || job.signed_memo_url) && (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-navy-700">
          <Upload className="h-3.5 w-3.5" />
          Memo
        </span>
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
              className="h-7 px-2 text-xs"
              data-testid="upload-memo-button"
            >
              {uploadingMemo ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Upload className="h-3 w-3 mr-1" />
                  {job.signed_memo_url ? 'Replace' : 'Upload'}
                </>
              )}
            </Button>
          </>
        )}
        {job.signed_memo_url && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewMemo}
            className="h-7 px-2 text-xs"
            data-testid="view-memo-button"
          >
            <Eye className="h-3 w-3 mr-1" />View
          </Button>
        )}
      </div>
    )}

    {/* Client Invoice */}
    {isAdmin && (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-navy-700">
          <Receipt className="h-3.5 w-3.5" />
          Client Invoice
          <Badge variant="secondary" className="bg-navy-900 text-white text-[9px] px-1 py-0 ml-0.5">Email</Badge>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerateInvoice}
          disabled={generatingInvoice}
          className="h-7 px-2 text-xs border-navy-300"
          data-testid="generate-invoice-button"
        >
          {generatingInvoice ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Receipt className="h-3 w-3 mr-1" />
              {job.invoice_url ? 'Regenerate' : 'Generate'}
            </>
          )}
        </Button>
        {job.invoice_url && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewInvoice}
            className="h-7 px-2 text-xs"
            data-testid="view-invoice-button"
          >
            <Eye className="h-3 w-3 mr-1" />View
          </Button>
        )}
      </div>
    )}

    {/* Lab Invoice */}
    {isAdmin && (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-navy-700">
          <FileText className="h-3.5 w-3.5" />
          Lab Invoice
          <Badge variant="secondary" className="bg-navy-200 text-navy-700 text-[9px] px-1 py-0 ml-0.5">Admin</Badge>
        </span>
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
          className="h-7 px-2 text-xs"
          data-testid="upload-lab-invoice-button"
        >
          {uploadingLabInvoice ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Upload className="h-3 w-3 mr-1" />
              {job.lab_invoice_url ? 'Replace' : 'Upload'}
            </>
          )}
        </Button>
        {job.lab_invoice_url && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewLabInvoice}
            className="h-7 px-2 text-xs"
            data-testid="view-lab-invoice-button"
          >
            <Eye className="h-3 w-3 mr-1" />View
          </Button>
        )}
      </div>
    )}
  </>
);
