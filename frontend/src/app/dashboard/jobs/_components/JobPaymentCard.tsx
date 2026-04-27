import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard, CheckCircle2, Link2, Check, ExternalLink, Loader2,
} from 'lucide-react';
import type { Job } from '../_types';

interface JobPaymentCardProps {
  job: Job;
  adjustmentMode: boolean;
  setAdjustmentMode: (v: boolean) => void;
  adjustmentAmount: string;
  setAdjustmentAmount: (v: string) => void;
  generatingPaymentLink: boolean;
  copiedPaymentLink: boolean;
  onOpenManualPayment: () => void;
  onGeneratePaymentLink: (isAdjustment?: boolean) => void;
  onCopyPaymentLink: () => void;
}

/**
 * Payment panel inside the View Job dialog's Actions sidebar.
 * Shows balance strip, payment history, payment link generation, and adjustments.
 */
export const JobPaymentCard: React.FC<JobPaymentCardProps> = ({
  job,
  adjustmentMode,
  setAdjustmentMode,
  adjustmentAmount,
  setAdjustmentAmount,
  generatingPaymentLink,
  copiedPaymentLink,
  onOpenManualPayment,
  onGeneratePaymentLink,
  onCopyPaymentLink,
}) => {
  const net = Math.max(0, (job.total_fee || 0) - (job.discount || 0));
  const paid = (job.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, net - paid);
  const pct = net > 0 ? Math.min(100, Math.round((paid / net) * 100)) : 0;

  return (
    <div className="rounded-lg border border-navy-200 p-3 space-y-2">
      <Label className="text-sm font-semibold flex items-center gap-2">
        <CreditCard className="h-3.5 w-3.5" />
        Payment
        {job.payment_status === 'paid' ? (
          <Badge className="bg-navy-900 text-white text-[10px] px-1.5 py-0">Paid</Badge>
        ) : job.payment_status === 'partial' ? (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1.5 py-0">
            Partial
          </Badge>
        ) : job.payment_token ? (
          <Badge variant="outline" className="text-navy-600 border-navy-300 text-[10px] px-1.5 py-0">
            Pending
          </Badge>
        ) : null}
      </Label>

      {/* Balance strip */}
      <div className="space-y-1" data-testid="payment-balance-strip">
        <div className="flex items-center justify-between text-[11px] text-navy-600">
          <span>${paid.toLocaleString()} of ${net.toLocaleString()} paid</span>
          {balance > 0 && (
            <span className="text-amber-700 font-semibold">Balance ${balance.toLocaleString()}</span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-navy-100 overflow-hidden">
          <div
            className={`h-full transition-[width] duration-500 ${
              balance === 0 ? 'bg-emerald-500' : 'bg-navy-900'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Manual payment button */}
      {balance > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenManualPayment}
          className="w-full text-xs border-navy-300"
          data-testid="record-manual-payment-button"
        >
          <CreditCard className="h-3 w-3 mr-1.5" />
          Record Payment
        </Button>
      )}

      {/* Payment history */}
      {(job.payments || []).length > 0 && (
        <div className="pt-1">
          <div className="text-[10px] uppercase tracking-wide text-navy-500 mb-1">
            Payment history
          </div>
          <div className="space-y-1">
            {(job.payments || []).slice().reverse().map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-[11px] border border-navy-100 rounded-md px-2 py-1 bg-navy-50/40"
                data-testid={`payment-row-${p.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-navy-900 text-[10px]">
                      {p.id}
                    </span>
                    <span className="text-navy-900 font-semibold">
                      ${p.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-navy-500 truncate">
                    {p.destination || '—'} ·{' '}
                    {new Date(p.recorded_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment link / adjustment workflows */}
      {job.payment_status === 'paid' && !adjustmentMode ? (
        <div className="space-y-1.5">
          <p className="text-xs text-navy-900 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Payment received
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdjustmentMode(true)}
            className="text-xs border-navy-300 w-full"
            data-testid="create-adjustment-button"
          >
            <CreditCard className="h-3 w-3 mr-1" />
            Create Adjustment Payment
          </Button>
        </div>
      ) : adjustmentMode ? (
        <div className="space-y-1.5">
          <p className="text-[10px] text-navy-500">Enter the adjustment amount to charge:</p>
          <div className="flex items-center gap-1">
            <span className="text-navy-600 text-xs">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={adjustmentAmount}
              onChange={(e) => setAdjustmentAmount(e.target.value)}
              className="text-xs h-7 border-navy-200"
              placeholder="0.00"
              data-testid="adjustment-amount-input"
            />
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={() => onGeneratePaymentLink(true)}
              disabled={
                generatingPaymentLink ||
                !adjustmentAmount ||
                parseFloat(adjustmentAmount) <= 0
              }
              className="text-xs flex-1 bg-navy-900 hover:bg-navy-800"
              data-testid="confirm-adjustment-button"
            >
              {generatingPaymentLink ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Creating...</>
              ) : 'Create Link'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdjustmentMode(false);
                setAdjustmentAmount('');
              }}
              className="text-xs border-navy-300"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {!job.payment_token ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGeneratePaymentLink()}
              disabled={generatingPaymentLink}
              className="text-xs border-navy-300 w-full"
              data-testid="generate-payment-link-button"
            >
              {generatingPaymentLink ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating...</>
              ) : (
                <><Link2 className="h-3 w-3 mr-1" />Generate Payment Link</>
              )}
            </Button>
          ) : (
            <div className="space-y-1.5">
              <Input
                value={job.payment_url || ''}
                readOnly
                className="text-[10px] font-mono bg-navy-50 border-navy-200 h-7"
                data-testid="payment-link-input"
              />
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCopyPaymentLink}
                  className={`text-xs flex-1 ${
                    copiedPaymentLink ? 'bg-navy-50 border-navy-300 text-navy-900' : 'border-navy-300'
                  }`}
                  data-testid="copy-payment-link-button"
                >
                  {copiedPaymentLink ? (
                    <><Check className="h-3 w-3 mr-1" />Copied</>
                  ) : 'Copy Link'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(job.payment_url, '_blank')}
                  className="text-xs flex-1 border-navy-300"
                  data-testid="open-payment-link-button"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
