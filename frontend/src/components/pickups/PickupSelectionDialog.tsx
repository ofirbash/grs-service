"use client";

/**
 * <PickupSelectionDialog> — admin picks the subset of stones (or cert
 * groups) the client is collecting, then prints the pickup memo. The flow:
 *
 *   1. Dialog opens with all active stones pre-checked.
 *   2. Stones already in a prior pickup of the same type are visible but
 *      pre-disabled (greyed out + "Already collected" badge) so the
 *      admin can SEE history without re-clicking those rows.
 *   3. For cert_collection mode, rows are aggregated by certificate_group
 *      — the client picks up ONE cert covering many stones, so we pick
 *      groups, not individual stones.
 *   4. On "Print", we POST a pickup_event with the picked stone_ids,
 *      then open the print window with the generated HTML.
 *
 * Out of scope: digital signature is captured BEFORE clicking Print
 * (admin uses the existing SignatureSection for client_collection /
 * cert_collection role). The most recent matching signature is auto-
 * attached to the printed memo and the pickup event.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, X, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { pickupsApi, signaturesApi, type PickupEvent, type SignatureRow } from '@/lib/api';
import { buildPickupMemoHtml } from '@/app/dashboard/jobs/_lib/buildPickupMemoHtml';
import { openPrintWindow } from '@/lib/sanitize';
import type { Job, Stone, Client, Branch } from '@/app/dashboard/jobs/_types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'memo_return' | 'cert_collection';
  job: Job;
  client: Client | undefined;
  branch: Branch | undefined;
  /** Called after a successful print so the parent can refresh its
   *  pickup history view. */
  onPrinted?: (event: PickupEvent) => void;
}

const TITLES: Record<Props['type'], string> = {
  memo_return: 'Return Stones to Client',
  cert_collection: 'Return Certificates to Client',
};
const DESCRIPTIONS: Record<Props['type'], string> = {
  memo_return: 'Select the stones the client is collecting. A signed return memo is generated for the record. Already-collected stones are pre-disabled.',
  cert_collection: 'Select the certificates the client is collecting. Stones that share a cert are picked together. A signed return memo is generated for the record.',
};
const SIG_ROLE: Record<Props['type'], SignatureRow['role']> = {
  memo_return: 'client_collection',
  cert_collection: 'cert_collection',
};

export function PickupSelectionDialog({
  open,
  onOpenChange,
  type,
  job,
  client,
  branch,
  onPrinted,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alreadyPicked, setAlreadyPicked] = useState<Set<string>>(new Set());
  const [signature, setSignature] = useState<SignatureRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Print only" mode: bypass pickup_event creation + pad signature
  // request, just open the printed memo. Used for two real workflows
  // admins flagged Feb 28 2026:
  //   (a) Stones still at the office but the client wants a memo printed
  //       in advance (no state change).
  //   (b) Stones already fully returned — admin wants to re-print the
  //       receipt afterwards.
  // In print-only mode we also allow re-selecting stones that are
  // `alreadyPicked` (greyed out by default), so case (b) can produce a
  // doc covering all original items.
  const [printOnly, setPrintOnly] = useState(false);

  const activeStones = useMemo(
    () => (job.stones || []).filter((s) => !s.cancelled),
    [job.stones],
  );

  // Group stones by certificate_group for cert_collection mode. Ungrouped
  // stones each get their own "group" keyed by stone id.
  const certGroups = useMemo(() => {
    const map = new Map<string, Stone[]>();
    for (const s of activeStones) {
      const key = s.certificate_group != null ? `g:${s.certificate_group}` : `s:${s.id}`;
      const bucket = map.get(key) || [];
      bucket.push(s);
      map.set(key, bucket);
    }
    return Array.from(map.entries());
  }, [activeStones]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [pickups, signatures] = await Promise.all([
          pickupsApi.listForJob(job.id),
          signaturesApi.listForJob(job.id),
        ]);
        if (cancelled) return;
        const picked = new Set<string>();
        pickups
          .filter((p) => p.type === type)
          .forEach((p) => p.stone_ids.forEach((sid) => picked.add(sid)));
        setAlreadyPicked(picked);

        // Pre-check every stone NOT already picked. In print-only mode
        // we pre-check ALL active stones (admin usually wants a full
        // re-print covering everything).
        const fresh = new Set<string>();
        activeStones.forEach((s) => {
          if (printOnly || !picked.has(s.id)) fresh.add(s.id);
        });
        setSelected(fresh);

        // Attach the latest matching signature so it embeds in the printed memo.
        const sig = signatures
          .filter((s) => s.role === SIG_ROLE[type] && s.status === 'signed')
          .sort((a, b) => (b.signed_at || '').localeCompare(a.signed_at || ''))[0];
        setSignature(sig || null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load pickup state';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, job.id, type, activeStones]);

  const toggleStone = (id: string) => {
    // In print-only mode, even already-picked stones become selectable
    // (so admin can produce a receipt covering ALL items after a full
    // return). Outside print-only, picked stones stay locked to avoid
    // double-pickup mistakes.
    if (!printOnly && alreadyPicked.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (bucket: Stone[]) => {
    // For cert_collection: clicking the group row toggles ALL stones in
    // the group at once.
    const allSelected = bucket.every((s) => selected.has(s.id) || (!printOnly && alreadyPicked.has(s.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of bucket) {
        if (!printOnly && alreadyPicked.has(s.id)) continue;
        if (allSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const next = new Set<string>();
    activeStones.forEach((s) => {
      if (printOnly || !alreadyPicked.has(s.id)) next.add(s.id);
    });
    setSelected(next);
  };
  const handleDeselectAll = () => setSelected(new Set());

  const handlePrint = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const ctx = {
        job, client, branch,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        type,
        pickedStoneIds: Array.from(selected),
      };

      // PRINT-ONLY mode: no pickup_event, no pad request, no archive.
      // Just open the (signed-if-available, else blank) memo and exit.
      // Admins use this when they need the receipt for advance-print
      // (stones still at office) or for re-print after a completed
      // return.
      if (printOnly) {
        const html = buildPickupMemoHtml({ ...ctx, signature });
        const win = openPrintWindow(html);
        if (!win) window.alert('Please allow popups to print');
        onOpenChange(false);
        return;
      }

      // RECORD-AND-SIGN mode (the default flow):
      // Build TWO versions of the memo HTML:
      //   1. `printHtml` — the unsigned memo that opens in the print window
      //      (client inspects + keeps a physical copy).
      //   2. `templateHtml` — same memo with a `{{SIGNATURE_BLOCK}}`
      //      placeholder where the captured signature will go later. The
      //      backend stores this and uses it to render the frozen PDF
      //      archive once the client signs on the pad.
      const printHtml = buildPickupMemoHtml({ ...ctx, signature });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templateHtml = buildPickupMemoHtml({ ...ctx, signature: { __template: true } as any });

      // Default signer name = the client's name (admin can still override
      // via the standalone Signature menu, but this one-click flow auto-
      // populates it for the common case).
      const signerName = client?.name || job.client_name || 'Client';
      const sigRole = type === 'memo_return' ? 'client_collection' : 'cert_collection';

      const event = await pickupsApi.create(
        job.id, type, Array.from(selected),
        {
          signature_request_id: signature?.id,
          memo_html_template: templateHtml,
          // Skip auto-signature if a captured signature is ALREADY attached
          // (admin pre-captured one via the standalone menu — don't queue a
          // duplicate on the pad).
          ...(signature ? {} : {
            auto_create_signature_for: signerName,
            signature_role: sigRole,
          }),
        },
      );
      const win = openPrintWindow(printHtml);
      if (!win) {
        window.alert('Please allow popups to print');
      }
      onPrinted?.(event);
      onOpenChange(false);
    } catch (e: unknown) {
      // axios error shape
      const ax = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(ax?.response?.data?.detail || ax?.message || 'Failed to print');
    } finally {
      setSubmitting(false);
    }
  };

  const selectableCount = activeStones.filter((s) => !alreadyPicked.has(s.id)).length;
  const showCertView = type === 'cert_collection';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="pickup-selection-dialog">
        <DialogHeader>
          <DialogTitle>{TITLES[type]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[type]}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-navy-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-navy-600">
                {selected.size} of {selectableCount} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                  Deselect all
                </Button>
              </div>
            </div>

            {signature && (
              <div
                className="flex items-center gap-3 p-3 rounded-md border border-emerald-200 bg-emerald-50 text-sm"
                data-testid="pickup-signature-attached"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-emerald-900">
                    Signature already captured: {signature.signer_name}
                  </div>
                  <div className="text-xs text-emerald-700">
                    {signature.signed_at && new Date(signature.signed_at).toLocaleString()} ·
                    will be embedded in the printed memo and signed PDF archive
                  </div>
                </div>
              </div>
            )}
            {!signature && !printOnly && (
              <div className="text-xs text-navy-600 p-3 rounded-md bg-navy-50 border border-navy-200">
                <strong>Confirm &amp; Sign</strong> will:
                <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                  <li>Mark these items as returned to the client</li>
                  <li>Open the unsigned memo for the client to inspect</li>
                  <li>Light up the signing pad — the client signs there</li>
                  <li>Save the signed PDF to the cloud for proof</li>
                </ol>
              </div>
            )}
            {printOnly && (
              <div className="text-xs text-amber-800 p-3 rounded-md bg-amber-50 border border-amber-200" data-testid="print-only-hint">
                <strong>Print only</strong> — generates the document without
                changing any stone status, recording a pickup, or requesting
                a signature. Use this for advance-print (stones still at
                the office) or to re-print a receipt after the return is
                already complete.
              </div>
            )}

            {/* Print-only toggle. Renders BELOW the explanation block so
                the admin reads the default flow first, then sees the
                opt-out. */}
            <label
              className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer select-none"
              data-testid="print-only-toggle-wrapper"
            >
              <input
                type="checkbox"
                checked={printOnly}
                onChange={(e) => setPrintOnly(e.target.checked)}
                className="h-4 w-4 accent-navy-700"
                data-testid="print-only-toggle"
              />
              <span>Print only — don&apos;t record the return or request a signature</span>
            </label>

            <div className="flex-1 overflow-y-auto border border-navy-200 rounded-md">
              {showCertView ? (
                <ul className="divide-y divide-navy-100">
                  {certGroups.map(([key, bucket]) => {
                    const head = bucket[0];
                    const allDisabled = bucket.every((s) => alreadyPicked.has(s.id));
                    const isChecked = bucket.every(
                      (s) => selected.has(s.id) || alreadyPicked.has(s.id),
                    ) && bucket.some((s) => selected.has(s.id));
                    const label =
                      head.certificate_group != null
                        ? `Certificate ${head.certificate_group}`
                        : `${head.sku} (single)`;
                    const stoneSummary = bucket.map((s) => s.sku).join(', ');
                    return (
                      <li
                        key={key}
                        className={`flex items-center gap-3 px-3 py-2 hover:bg-navy-50 cursor-pointer ${allDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => !allDisabled && toggleGroup(bucket)}
                        data-testid={`cert-group-row-${key}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => !allDisabled && toggleGroup(bucket)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={allDisabled}
                          className="h-4 w-4 rounded border-navy-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-navy-900">{label}</div>
                          <div className="text-xs text-navy-500 truncate">{stoneSummary}</div>
                        </div>
                        {allDisabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
                            Already collected
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="divide-y divide-navy-100">
                  {activeStones.map((s) => {
                    const disabled = alreadyPicked.has(s.id);
                    return (
                      <li
                        key={s.id}
                        className={`flex items-center gap-3 px-3 py-2 hover:bg-navy-50 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => toggleStone(s.id)}
                        data-testid={`pickup-stone-row-${s.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleStone(s.id)}
                          disabled={disabled}
                          className="h-4 w-4 rounded border-navy-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-navy-900 font-mono">{s.sku}</div>
                          <div className="text-xs text-navy-500 truncate">
                            {s.stone_type} · {s.weight} ct · ${s.value.toLocaleString()}
                            {s.certificate_group != null && (
                              <span className="ml-2 text-navy-400">Cert {s.certificate_group}</span>
                            )}
                          </div>
                        </div>
                        {disabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
                            Already collected
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error && (
              <div
                className="text-sm text-red-600 flex items-start gap-2 p-2 rounded bg-red-50"
                data-testid="pickup-dialog-error"
              >
                <X className="h-4 w-4 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={submitting || selected.size === 0}
            className="bg-navy-900 hover:bg-navy-800"
            data-testid="pickup-print-button"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {printOnly
              ? `Print only (${selected.size})`
              : `Confirm & Sign (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
