import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CreditCard, CheckCircle2, Loader2 } from 'lucide-react';

export interface ManualPaymentResult {
  id: string;
  amount: number;
  balance: number;
  is_fully_paid: boolean;
  email_status?: string;
  sms_status?: string;
}

interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobNumber?: number;
  paymentDestinations: string[];
  amount: string;
  setAmount: (v: string) => void;
  destination: string;
  setDestination: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  notifyEmail: boolean;
  setNotifyEmail: (v: boolean) => void;
  notifySms: boolean;
  setNotifySms: (v: boolean) => void;
  recording: boolean;
  lastResult: ManualPaymentResult | null;
  onSubmit: () => void;
}

export const ManualPaymentDialog: React.FC<ManualPaymentDialogProps> = ({
  open,
  onOpenChange,
  jobNumber,
  paymentDestinations,
  amount,
  setAmount,
  destination,
  setDestination,
  note,
  setNote,
  notifyEmail,
  setNotifyEmail,
  notifySms,
  setNotifySms,
  recording,
  lastResult,
  onSubmit,
}) => {
  const channelSuffix = notifyEmail || notifySms
    ? '(' + [notifyEmail && 'email', notifySms && 'SMS'].filter(Boolean).join(' + ') + ')'
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="manual-payment-dialog">
        <DialogHeader>
          <DialogTitle className="text-lg text-navy-900 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {lastResult ? 'Payment recorded' : 'Record Manual Payment'}
          </DialogTitle>
          <DialogDescription>
            {lastResult
              ? `Payment ID ${lastResult.id} saved successfully.`
              : `Log a wire transfer or cash payment against Job #${jobNumber}. The client will receive a receipt ${channelSuffix}.`}
          </DialogDescription>
        </DialogHeader>

        {lastResult ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-navy-900 text-white p-4">
              <div className="text-[10px] uppercase tracking-widest text-navy-300">Payment ID</div>
              <div className="text-2xl font-bold font-mono mt-1" data-testid="result-payment-id">
                {lastResult.id}
              </div>
              <div className="text-xs text-navy-200 mt-2">
                Amount: ${lastResult.amount.toLocaleString()}
              </div>
            </div>
            {lastResult.is_fully_paid ? (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Job paid in full
              </div>
            ) : (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-sm text-amber-800">
                Balance remaining: <strong>${lastResult.balance.toLocaleString()}</strong>
              </div>
            )}
            <div className="text-xs text-navy-500 space-y-1">
              <div>
                Email:{' '}
                {lastResult.email_status
                  ? <span className="font-semibold text-navy-700">{lastResult.email_status}</span>
                  : <span>skipped</span>}
              </div>
              <div>
                SMS:{' '}
                {lastResult.sms_status
                  ? <span className="font-semibold text-navy-700">{lastResult.sms_status}</span>
                  : <span>skipped</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Amount (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="manual-payment-amount"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Destination</Label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger data-testid="manual-payment-destination">
                  <SelectValue placeholder="Pick a destination" />
                </SelectTrigger>
                <SelectContent>
                  {paymentDestinations.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentDestinations.length === 0 && (
                <p className="text-[11px] text-amber-700 mt-1">
                  No destinations configured. Add them under Settings → Pricing.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Reference, check number, etc."
                data-testid="manual-payment-note"
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-navy-300"
                  data-testid="manual-payment-notify-email"
                />
                <span>Email receipt to client</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifySms}
                  onChange={(e) => setNotifySms(e.target.checked)}
                  className="h-4 w-4 rounded border-navy-300"
                  data-testid="manual-payment-notify-sms"
                />
                <span>SMS receipt link</span>
              </label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="manual-payment-close"
          >
            {lastResult ? 'Close' : 'Cancel'}
          </Button>
          {!lastResult && (
            <Button
              onClick={onSubmit}
              disabled={recording || !amount || !destination}
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="manual-payment-submit"
            >
              {recording ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording...</>
              ) : (
                <>Record Payment</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
