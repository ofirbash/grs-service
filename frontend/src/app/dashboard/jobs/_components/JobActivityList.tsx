"use client";

/**
 * JobActivityList — admin-only per-job audit timeline.
 *
 * Compact one-line-per-event list (action + actor + absolute timestamp + short summary).
 * Row presentation lives in the shared `<ActivityRowItem>` component so this
 * list and the global activity feed (/dashboard/activity) stay visually
 * identical.
 *
 * Feb 26 2026: collapsed by default. The job dialog has a lot competing for
 * vertical space (stones, signatures, pickups, notifications) and the audit
 * log is rarely the *first* thing an admin needs. Clicking the header
 * toggles the list open and keeps it open for the rest of the dialog
 * session.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react';

import { activityApi, type ActivityRow } from '@/lib/api';
import { ActivityRowItem } from '@/components/activity/ActivityRowItem';

interface Props {
  jobId: string;
}

export function JobActivityList({ jobId }: Props) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Collapsed by default — admins expand when they actually need the log.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    activityApi
      .listForJob(jobId)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load activity';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const items = useMemo(() => rows ?? [], [rows]);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className="border border-navy-200 rounded-lg bg-white"
      data-testid="job-activity-list"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 border-b border-navy-100 flex items-center justify-between hover:bg-navy-50/60 transition-colors text-left"
        data-testid="job-activity-toggle"
        aria-expanded={expanded}
      >
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
          <Chevron className="h-4 w-4 text-navy-500" />
          <CheckCircle2 className="h-4 w-4 text-navy-600" />
          Activity
        </h3>
        <span className="text-xs text-navy-500">
          {loading ? 'Loading…' : `${items.length} event${items.length === 1 ? '' : 's'}`}
        </span>
      </button>

      {expanded && (
        <>
          {error && (
            <div
              className="px-4 py-3 text-sm text-red-600 flex items-center gap-2"
              data-testid="job-activity-error"
            >
              <X className="h-4 w-4" />
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div
              className="px-4 py-6 text-sm text-navy-500 text-center"
              data-testid="job-activity-empty"
            >
              No activity recorded yet.
            </div>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-navy-100 max-h-72 overflow-y-auto">
              {items.map((row) => (
                <ActivityRowItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
