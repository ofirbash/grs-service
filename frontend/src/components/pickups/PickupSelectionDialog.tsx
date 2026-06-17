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
  memo_return: 'Print Memo Return',
  cert_collection: 'Print Certificate Collection',
};
const DESCRIPTIONS: Record<Props['type'], string> = {
  memo_return: 'Select the stones the client is collecting. Already-collected stones are pre-disabled.',
  cert_collection: 'Select the certificates the client is collecting. Stones that share a cert are picked together.',
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

        // Pre-check every stone NOT already picked.
        const fresh = new Set<string>();
        activeStones.forEach((s) => {
          if (!picked.has(s.id)) fresh.add(s.id);
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
    if (alreadyPicked.has(id)) return;
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
    const allSelected = bucket.every((s) => selected.has(s.id) || alreadyPicked.has(s.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of bucket) {
        if (alreadyPicked.has(s.id)) continue;
        if (allSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const next = new Set<string>();
    activeStones.forEach((s) => {
      if (!alreadyPicked.has(s.id)) next.add(s.id);
    });
    setSelected(next);
  };
  const handleDeselectAll = () => setSelected(new Set());

  const handlePrint = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const event = await pickupsApi.create(
        job.id,
        type,
        Array.from(selected),
        signature?.id,
      );
      const html = buildPickupMemoHtml({
        job,
        client,
        branch,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        type,
        pickedStoneIds: event.stone_ids,
        signature,
      });
      const win = openPrintWindow(html);
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
                    Signature attached: {signature.signer_name}
                  </div>
                  <div className="text-xs text-emerald-700">
                    {signature.signed_at && new Date(signature.signed_at).toLocaleString()} ·
                    will be embedded in the printed memo
                  </div>
                </div>
              </div>
            )}
            {!signature && (
              <div className="text-xs text-navy-500 p-2 rounded bg-navy-50">
                💡 Tip: capture the client&apos;s signature first (Capture signature →{' '}
                {type === 'memo_return' ? 'Client collection' : 'Certificate collection'}) so it
                embeds on the printed memo.
              </div>
            )}

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
            Print ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
