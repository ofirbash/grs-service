"use client";

/**
 * Signing Pad — kiosk page for the dedicated tablet/phone at the front desk.
 *
 * Logged in as a `signing_pad` role account whose `branch_id` is set to the
 * physical branch where the pad lives. Idle state shows a friendly "Waiting
 * for next signature" placeholder; polling every 2s for the oldest pending
 * `signature_request` in this branch. When one appears the page swaps to a
 * full-screen canvas + Submit button. After submit the row flips to
 * status=signed on the desktop's poll and the pad returns to idle.
 *
 * No admin chrome: the dashboard layout's sidebar is hidden via the special
 * path check inside `layout.tsx` so the kiosk stays full-bleed.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, Loader2, RotateCcw, Tablet, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  signaturesApi,
  SIGNATURE_ROLE_LABELS,
  type SignatureRow,
} from '@/lib/api';
import { useAuthStore } from '@/lib/store';

// signature_canvas needs window — load only on the client.
const SignatureCanvas = dynamic(
  () => import('react-signature-canvas') as Promise<{ default: React.ComponentType<unknown> }>,
  { ssr: false },
);

const POLL_INTERVAL_MS = 2000;

export default function SigningPadPage() {
  const user = useAuthStore((s) => s.user);
  const isPad = user?.role === 'signing_pad';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';

  const [pending, setPending] = useState<SignatureRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);

  // Cast to `any` (kept narrow): the alpha `react-signature-canvas` type
  // surface doesn't ship ref types; we only call `clear()`, `isEmpty()`,
  // and `toDataURL()` — all stable for 5+ years.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);

  // Poll for pending requests. Both `signing_pad` and admins land here —
  // admins are useful for previewing the pad UX from their own machine.
  useEffect(() => {
    if (!isPad && !isAdmin) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const next = await signaturesApi.pending();
        if (cancelled) return;
        // Don't yank an in-progress signature canvas out from under the
        // user just because a different (or duplicate) request appears.
        if (!pending && next) {
          setPending(next);
          setJustSigned(false);
        } else if (pending && !next) {
          // The current pending row was cancelled server-side (e.g. admin
          // re-clicked, replacing it). Drop the canvas state.
          setPending(null);
        }
        setError(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Polling failed';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPad, isAdmin, pending]);

  const handleClear = () => {
    canvasRef.current?.clear();
  };

  const handleSubmit = async () => {
    if (!pending) return;
    if (canvasRef.current?.isEmpty?.()) {
      setError('Please sign before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const dataUrl = canvasRef.current?.toDataURL?.('image/png');
      if (!dataUrl) throw new Error('Could not read signature canvas');
      await signaturesApi.submit(pending.id, dataUrl);
      setPending(null);
      setJustSigned(true);
      // Auto-clear the "Thank you" screen after 4s.
      setTimeout(() => setJustSigned(false), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Submit failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isPad && !isAdmin) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-8 text-navy-500"
        data-testid="pad-not-authorised"
      >
        This device is not configured as a signing pad. Please log in with a
        signing_pad account.
      </div>
    );
  }

  // Active capture screen.
  if (pending) {
    const roleLabel = SIGNATURE_ROLE_LABELS[pending.role] || pending.role;
    return (
      <div
        className="min-h-screen flex flex-col bg-white p-4 md:p-8"
        data-testid="pad-active-capture"
      >
        <header className="mb-4">
          <div className="text-xs uppercase tracking-widest text-navy-500">
            {roleLabel}
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-navy-900 mt-1">
            {pending.signer_name}, please sign below
          </h1>
        </header>

        <div className="flex-1 border-2 border-navy-300 rounded-lg bg-navy-50/30 overflow-hidden relative">
          <SignatureCanvas
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ ref: canvasRef } as any)}
            penColor="#0a1a3f"
            backgroundColor="rgba(255,255,255,1)"
            canvasProps={{
              className: 'w-full h-full',
              'data-testid': 'pad-canvas',
            }}
          />
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 flex items-center gap-2" data-testid="pad-error">
            <X className="h-4 w-4" /> {error}
          </div>
        )}

        <footer className="mt-4 flex gap-3 justify-end">
          <Button
            variant="outline"
            size="lg"
            onClick={handleClear}
            disabled={submitting}
            data-testid="pad-clear"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-navy-900 hover:bg-navy-800"
            data-testid="pad-submit"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Submit signature
          </Button>
        </footer>
      </div>
    );
  }

  // Idle (or just-signed) screen.
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-navy-50 p-8"
      data-testid="pad-idle"
    >
      <div className="text-center max-w-md">
        {justSigned ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-3xl font-semibold text-navy-900">Thank you!</h1>
            <p className="text-navy-600 mt-2">Your signature has been recorded.</p>
          </>
        ) : (
          <>
            <Tablet className="h-16 w-16 text-navy-400 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-navy-900">Signing pad ready</h1>
            <p className="text-navy-500 mt-2">
              Waiting for the next signature request…
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs text-navy-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Polling every 2s
            </div>
          </>
        )}
        {error && (
          <div className="mt-6 text-sm text-red-500" data-testid="pad-poll-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
