"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DoubleConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single-line title shown on the first step. */
  title: string;
  /** Plain-language description shown on both steps. */
  description: React.ReactNode;
  /** Label for the final destructive button (e.g. "Cancel Job"). */
  confirmLabel: string;
  /** Async callback. Dialog auto-closes on success. */
  onConfirm: () => Promise<void>;
  testIdPrefix?: string;
}

/**
 * Two-click confirmation dialog used wherever an admin destructively
 * cancels a record. Step 1 explains the action; step 2 forces the user
 * to click a second time before we fire the API call. This prevents
 * accidental clicks and gives a clear "are you really sure?" beat.
 */
export function DoubleConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  testIdPrefix = 'double-confirm',
}: DoubleConfirmDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const handleClose = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Reset for next open after the close animation finishes.
      setTimeout(() => {
        setStep(1);
        setSubmitting(false);
        setError('');
      }, 200);
    }
  };

  const handleStepOne = () => {
    setError('');
    setStep(2);
  };

  const handleFinalConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      handleClose(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Operation failed');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid={`${testIdPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-navy-900">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {step === 1 ? title : 'Final confirmation'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? description
              : 'This cannot be undone from the UI. Click again to confirm.'}
          </DialogDescription>
        </DialogHeader>

        {step === 2 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Last chance.</strong> Press &quot;{confirmLabel}&quot; one more time to proceed.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={submitting}
            data-testid={`${testIdPrefix}-cancel-button`}
          >
            Keep
          </Button>
          {step === 1 ? (
            <Button
              variant="destructive"
              onClick={handleStepOne}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid={`${testIdPrefix}-step1-button`}
            >
              {confirmLabel}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleFinalConfirm}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid={`${testIdPrefix}-confirm-button`}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>{confirmLabel}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
