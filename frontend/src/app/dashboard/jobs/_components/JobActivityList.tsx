"use client";

/**
 * JobActivityList — admin-only per-job audit timeline.
 *
 * Compact one-line-per-event list (action + actor + relative time + short summary).
 * No JSON diffs (per product decision Feb 25 2026): the timeline is meant to be
 * scannable; details live in the underlying record.
 *
 * Row presentation lives in the shared `<ActivityRowItem>` component so this
 * list and the global activity feed (/dashboard/activity) stay visually
 * identical.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

import { activityApi, type ActivityRow } from '@/lib/api';
import { ActivityRowItem } from '@/components/activity/ActivityRowItem';

interface Props {
  jobId: string;
}

export function JobActivityList({ jobId }: Props) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div
      className="border border-navy-200 rounded-lg bg-white"
      data-testid="job-activity-list"
    >
      <div className="px-4 py-2.5 border-b border-navy-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-navy-600" />
          Activity
        </h3>
        <span className="text-xs text-navy-500">
          {loading ? 'Loading…' : `${items.length} event${items.length === 1 ? '' : 's'}`}
        </span>
      </div>

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
    </div>
  );
}
