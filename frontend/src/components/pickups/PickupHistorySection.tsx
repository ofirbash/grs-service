"use client";

/**
 * <PickupHistorySection> — admin-only timeline of every Memo Return / Cert
 * Collection event for a job. Shows status (awaiting signature / signed),
 * a "View signed PDF" link when finalized, and an "Undo entire pickup"
 * button (super_admin only) that reverts stone_status for memo_return.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, PackageCheck, Undo2, Hourglass } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { pickupsApi, type PickupEvent } from '@/lib/api';

interface Props {
  jobId: string;
  /** Lets the parent show the section conditionally — super_admin gets
   *  the Undo button, branch_admin sees the history only. */
  isSuperAdmin: boolean;
}

const TYPE_LABEL = {
  memo_return: 'Memo Return',
  cert_collection: 'Cert Collection',
} as const;

export function PickupHistorySection({ jobId, isSuperAdmin }: Props) {
  const [rows, setRows] = useState<PickupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await pickupsApi.listForJob(jobId);
      setRows(data);
    } catch (e) {
      // Surface fetch failures in the console — silent failure here used to
      // hide auth/baseURL bugs (Feb 26, 2026 iter-40 regression).
      console.error('[PickupHistorySection] listForJob failed', e);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetch();
    // Poll every 4s so "Awaiting signature → Signed" transitions surface
    // automatically once the client signs on the pad.
    const t = setInterval(fetch, 4000);
    return () => clearInterval(t);
  }, [fetch]);

  const handleUndo = async (row: PickupEvent) => {
    if (!window.confirm(
      `Undo this ${TYPE_LABEL[row.type]}? Stones will be marked back as "at office" and you can redo the pickup with the correct selection.`,
    )) return;
    setUndoing(row.id);
    try {
      await pickupsApi.delete(row.id);
      await fetch();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } }; message?: string };
      window.alert(ax?.response?.data?.detail || ax?.message || 'Undo failed');
    } finally {
      setUndoing(null);
    }
  };

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="border border-navy-200 rounded-lg bg-white" data-testid="pickup-history-section">
      <div className="px-4 py-2.5 border-b border-navy-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-navy-600" />
          Pickup history
        </h3>
        <span className="text-xs text-navy-500">{rows.length} event{rows.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="divide-y divide-navy-100">
        {rows.map((row) => {
          const signed = !!row.signed_pdf_url;
          return (
            <li
              key={row.id}
              className="px-4 py-2 flex items-center gap-3 text-sm"
              data-testid={`pickup-row-${row.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-navy-900">
                  {TYPE_LABEL[row.type]}
                  <span className="text-xs text-navy-500 ml-2 font-normal">
                    · {row.stone_ids.length} stone{row.stone_ids.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="text-xs text-navy-500 truncate">
                  {new Date(row.printed_at).toLocaleString()} · {row.printed_by_name || 'unknown'}
                </div>
              </div>

              {signed ? (
                <a
                  href={row.signed_pdf_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  data-testid={`view-signed-pdf-${row.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  View signed PDF
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800"
                  data-testid={`awaiting-signature-${row.id}`}
                >
                  <Hourglass className="h-3.5 w-3.5" />
                  Awaiting signature
                </span>
              )}

              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUndo(row)}
                  disabled={undoing === row.id}
                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  data-testid={`undo-pickup-${row.id}`}
                  title="Undo entire pickup"
                >
                  {undoing === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
