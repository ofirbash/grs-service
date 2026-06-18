"use client";

/**
 * <SignatureSection> — admin-side widget for the Job Detail dialog.
 *
 * Renders three things:
 *   1. Captured signatures gallery (thumbnails + role + signer + delete)
 *   2. "Capture signature" dropdown — pick one of 4 roles → opens a small
 *      modal asking for the signer's name → POSTs to the backend, the
 *      pad picks it up.
 *   3. While a request is pending, a "Waiting on signing pad…" panel
 *      polls every 2s for the signed result. Either auto-closes when
 *      signed (showing the new row in the gallery) or admin can cancel.
 *
 * Multi-branch awareness: the backend sets `branch_id` from the JOB, so
 * the admin never has to pick a pad — they just click and it routes
 * automatically.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  PenLine,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  signaturesApi,
  SIGNATURE_ROLE_LABELS,
  type SignatureRow,
} from '@/lib/api';

interface Props {
  jobId: string;
  /** Default signer name (usually the client.name) so the admin doesn't
   *  have to retype it for `client_*` roles. */
  defaultSignerName?: string;
}

const ROLE_CODES: Array<SignatureRow['role']> = [
  'client_drop_off',
  'client_collection',
  'cert_collection',
  'courier_drop_off',
];

const PENDING_POLL_MS = 2000;

export function SignatureSection({ jobId, defaultSignerName = '' }: Props) {
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Capture-request modal state
  const [requestRole, setRequestRole] = useState<SignatureRow['role'] | null>(null);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Active pending request — drives the "waiting on pad" panel + poll.
  const [activePending, setActivePending] = useState<SignatureRow | null>(null);

  // Ticker for the "expires in M:SS" countdown shown in the pending
  // banner. We don't need millisecond precision — re-render once per
  // second is plenty. The actual expiry is enforced server-side; this
  // is purely informational so the admin knows when the pad will time
  // out on a client who hasn't shown up.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activePending?.expires_at) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activePending?.expires_at]);

  const expiryCountdown = useMemo(() => {
    const exp = activePending?.expires_at;
    if (!exp) return null;
    const msRemaining = new Date(exp).getTime() - now;
    if (msRemaining <= 0) return { label: 'expired', expired: true };
    const totalSec = Math.floor(msRemaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return {
      label: `${m}:${String(s).padStart(2, '0')}`,
      // Visual warning when under 30 seconds remain.
      urgent: msRemaining < 30_000,
      expired: false,
    };
  }, [activePending?.expires_at, now]);

  const fetchRows = useCallback(async () => {
    try {
      const data = await signaturesApi.listForJob(jobId);
      setRows(data);
      // If a pending row exists on the server (e.g. admin reloaded the
      // dialog after starting a capture), surface it so the wait panel
      // appears automatically.
      const stillPending = data.find((r) => r.status === 'pending');
      if (stillPending) setActivePending(stillPending);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Poll the active pending request until it's signed or cancelled.
  useEffect(() => {
    if (!activePending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const row = await signaturesApi.getOne(activePending.id);
        if (cancelled) return;
        if (row.status === 'signed') {
          // No toast — the row appearing in the gallery is the signal.
          setActivePending(null);
          fetchRows();
          return;
        }
        if (row.status === 'cancelled' || row.status === 'expired') {
          // Server reaped this request (or admin cancelled it from
          // another tab). Drop the banner so the admin sees a clean
          // slate and can re-trigger if needed.
          setActivePending(null);
          fetchRows();
          return;
        }
      } catch {
        // ignore transient poll errors — keep polling
      }
      if (!cancelled) timer = setTimeout(tick, PENDING_POLL_MS);
    };

    timer = setTimeout(tick, PENDING_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activePending, fetchRows]);

  const openCaptureModal = (role: SignatureRow['role']) => {
    setRequestRole(role);
    // Default the signer name from the client for client-side roles.
    if (role === 'client_drop_off' || role === 'client_collection' || role === 'cert_collection') {
      setSignerName(defaultSignerName || '');
    } else {
      setSignerName('');
    }
    setMenuOpen(false);
  };

  const handleCreateRequest = async () => {
    if (!requestRole || !signerName.trim()) return;
    setSubmittingRequest(true);
    try {
      const row = await signaturesApi.request(jobId, requestRole, signerName.trim());
      setActivePending(row);
      setRequestRole(null);
      fetchRows();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start capture';
      window.alert(msg);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleCancelPending = async () => {
    if (!activePending) return;
    try {
      await signaturesApi.cancel(activePending.id);
      setActivePending(null);
      fetchRows();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Cancel failed';
      window.alert(msg);
    }
  };

  const handleDelete = async (row: SignatureRow) => {
    if (!window.confirm(`Delete this ${SIGNATURE_ROLE_LABELS[row.role]} signature?`)) return;
    try {
      await signaturesApi.delete(row.id);
      fetchRows();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      window.alert(msg);
    }
  };

  const signedRows = useMemo(() => rows.filter((r) => r.status === 'signed'), [rows]);

  return (
    <div className="border border-navy-200 rounded-lg bg-white" data-testid="signature-section">
      <div className="px-4 py-2.5 border-b border-navy-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
          <PenLine className="h-4 w-4 text-navy-600" />
          Signatures
          <span className="text-xs text-navy-500 font-normal">
            ({loading ? '…' : signedRows.length})
          </span>
        </h3>

        {/* Capture menu */}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={!!activePending}
            data-testid="capture-signature-button"
          >
            <PenLine className="h-3.5 w-3.5 mr-1.5" />
            Capture signature
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 bg-white border border-navy-200 rounded-md shadow-lg py-1 min-w-[200px]"
              data-testid="capture-menu"
            >
              {ROLE_CODES.map((role) => (
                <button
                  key={role}
                  onClick={() => openCaptureModal(role)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-navy-50"
                  data-testid={`capture-role-${role}`}
                >
                  {SIGNATURE_ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active pending banner */}
      {activePending && (
        <div
          className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex items-center gap-3"
          data-testid="pending-signature-banner"
        >
          <Tablet className="h-5 w-5 text-amber-600 animate-pulse" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-amber-900">
              Waiting for {SIGNATURE_ROLE_LABELS[activePending.role]} signature on pad…
            </div>
            <div className="text-xs text-amber-700">
              {activePending.signer_name}
            </div>
          </div>
          {expiryCountdown && (
            <div
              className={`flex items-center gap-1 text-xs font-mono font-semibold rounded px-2 py-1 border ${
                expiryCountdown.expired
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : expiryCountdown.urgent
                    ? 'bg-red-50 border-red-200 text-red-700 animate-pulse'
                    : 'bg-white/70 border-amber-200 text-amber-800'
              }`}
              title="Time before this request auto-expires on the pad"
              data-testid="pending-signature-countdown"
            >
              <Clock className="h-3 w-3" />
              {expiryCountdown.label}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancelPending}
            data-testid="cancel-pending-signature"
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {/* Captured signatures gallery */}
      {!loading && signedRows.length === 0 && !activePending && (
        <div className="px-4 py-6 text-sm text-navy-500 text-center" data-testid="signatures-empty">
          No signatures captured yet.
        </div>
      )}

      {signedRows.length > 0 && (
        <ul className="divide-y divide-navy-100" data-testid="signed-list">
          {signedRows.map((row) => (
            <li
              key={row.id}
              className="px-4 py-2 flex items-center gap-3"
              data-testid={`signature-row-${row.role}`}
            >
              {row.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.signed_url}
                  alt={`${row.role} signature`}
                  className="h-12 w-24 object-contain border border-navy-100 rounded bg-white"
                />
              ) : (
                <div className="h-12 w-24 border border-dashed border-navy-200 rounded flex items-center justify-center text-xs text-navy-400">
                  no image
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-navy-900 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {SIGNATURE_ROLE_LABELS[row.role]}
                </div>
                <div className="text-xs text-navy-600 truncate">
                  {row.signer_name}
                  {row.signed_at && (
                    <span className="text-navy-400">
                      {' · '}
                      {new Date(row.signed_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(row)}
                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                title="Delete signature"
                data-testid={`delete-signature-${row.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Capture request modal */}
      <Dialog open={!!requestRole} onOpenChange={(open) => !open && setRequestRole(null)}>
        <DialogContent className="max-w-md" data-testid="capture-request-dialog">
          <DialogHeader>
            <DialogTitle>
              Request {requestRole ? SIGNATURE_ROLE_LABELS[requestRole] : ''} signature
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-navy-600">
              The request will appear on the signing pad. Enter the signer&apos;s
              name as it should be recorded.
            </p>
            <div>
              <Label htmlFor="signer-name">Signer name</Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="e.g. John Doe"
                autoFocus
                data-testid="signer-name-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestRole(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRequest}
              disabled={!signerName.trim() || submittingRequest}
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="send-to-pad-button"
            >
              {submittingRequest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send to pad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
