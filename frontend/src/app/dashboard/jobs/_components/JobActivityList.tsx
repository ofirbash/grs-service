"use client";

/**
 * JobActivityList — admin-only per-job audit timeline.
 *
 * Renders a compact one-line-per-event list (action + actor + relative time)
 * with a short summary suffix. No JSON diffs (per product decision Feb 25 2026):
 * the timeline is meant to be scannable; details live in the underlying record.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Briefcase,
  CheckCircle2,
  CircleDot,
  CreditCard,
  FileCheck2,
  FileText,
  LogIn,
  Mail,
  Package,
  Pencil,
  Send,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';

import { activityApi, type ActivityRow } from '@/lib/api';

interface Props {
  jobId: string;
}

// Map action codes → (label, icon) so the timeline renders the same way
// regardless of how the backend phrased the `summary` string. Anything not
// in the table falls back to the raw action code (which keeps the UI
// resilient if a new action is added on the backend before the frontend
// learns about it).
const ACTION_META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  job_created: { label: 'Job created', Icon: Briefcase },
  job_updated: { label: 'Job updated', Icon: Pencil },
  job_status_changed: { label: 'Status changed', Icon: ArrowLeftRight },
  job_notification_sent: { label: 'Notification sent', Icon: Send },

  stone_verbal_entered: { label: 'Verbal findings saved', Icon: FileText },
  stone_fees_updated: { label: 'Stone fees updated', Icon: CircleDot },
  stone_cert_uploaded: { label: 'Certificate uploaded', Icon: FileCheck2 },
  stone_cancelled: { label: 'Stone removed', Icon: Trash2 },

  shipment_created: { label: 'Shipment created', Icon: Package },
  shipment_status_changed: { label: 'Shipment status', Icon: ArrowLeftRight },

  payment_recorded: { label: 'Payment recorded', Icon: CreditCard },

  client_created: { label: 'Client created', Icon: UserIcon },
  client_updated: { label: 'Client updated', Icon: UserIcon },

  login_success: { label: 'Admin login', Icon: LogIn },
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
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
          {items.map((row) => {
            const meta = ACTION_META[row.action] ?? { label: row.action, Icon: Mail };
            const Icon = meta.Icon;
            return (
              <li
                key={row.id}
                className="px-4 py-2 flex items-center gap-3 text-sm"
                data-testid={`activity-row-${row.action}`}
              >
                <Icon className="h-4 w-4 text-navy-500 flex-shrink-0" />
                <span className="font-medium text-navy-900 flex-shrink-0">
                  {meta.label}
                </span>
                {row.summary && (
                  <span className="text-navy-600 truncate flex-1 min-w-0">
                    · {row.summary}
                  </span>
                )}
                <span className="text-xs text-navy-500 flex-shrink-0">
                  {row.actor_name}
                </span>
                <span
                  className="text-xs text-navy-400 flex-shrink-0 tabular-nums"
                  title={new Date(row.created_at).toLocaleString()}
                >
                  {formatRelative(row.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
