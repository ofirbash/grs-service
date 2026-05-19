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
 * Three stacked action clusters (Signed Memo, Client Invoice, Lab Invoice)
 * rendered in the View Job dialog's sticky footer bar.
 *
 * Each cluster renders as a labelled column: title (with icon + badge) on
 * top, action buttons in a row below. Clusters are separated by a vertical
 * divider so the visual grouping is obvious at a glance.
 */
interface ActionGroupProps {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const ActionGroup: React.FC<ActionGroupProps> = ({ icon, title, badge, children }) => (
  <div className="flex flex-col items-center gap-1 px-3 py-0.5">
    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-navy-600 leading-none">
      {icon}
      <span>{title}</span>
      {badge}
    </div>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

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
}) => {
  const visibleGroups = [
    isAdmin || job.signed_memo_url ? 'memo' : null,
    isAdmin ? 'client' : null,
    isAdmin ? 'lab' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex items-stretch divide-x divide-navy-200 gap-0">
      {/* Signed Memo */}
      {visibleGroups.includes('memo') && (
        <ActionGroup icon={<Upload className="h-3 w-3" />} title="Memo">
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
                className="h-6 px-2 text-[11px]"
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
              className="h-6 px-2 text-[11px]"
              data-testid="view-memo-button"
            >
              <Eye className="h-3 w-3 mr-1" />View
            </Button>
          )}
        </ActionGroup>
      )}

      {/* Client Invoice */}
      {visibleGroups.includes('client') && (
        <ActionGroup
          icon={<Receipt className="h-3 w-3" />}
          title="Client Invoice"
          badge={<Badge variant="secondary" className="bg-navy-900 text-white text-[9px] px-1 py-0">Email</Badge>}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateInvoice}
            disabled={generatingInvoice}
            className="h-6 px-2 text-[11px] border-navy-300"
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
              className="h-6 px-2 text-[11px]"
              data-testid="view-invoice-button"
            >
              <Eye className="h-3 w-3 mr-1" />View
            </Button>
          )}
        </ActionGroup>
      )}

      {/* Lab Invoice */}
      {visibleGroups.includes('lab') && (
        <ActionGroup
          icon={<FileText className="h-3 w-3" />}
          title="Lab Invoice"
          badge={<Badge variant="secondary" className="bg-navy-200 text-navy-700 text-[9px] px-1 py-0">Admin</Badge>}
        >
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
            className="h-6 px-2 text-[11px]"
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
              className="h-6 px-2 text-[11px]"
              data-testid="view-lab-invoice-button"
            >
              <Eye className="h-3 w-3 mr-1" />View
            </Button>
          )}
        </ActionGroup>
      )}
    </div>
  );
};
