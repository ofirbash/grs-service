"use client";

/**
 * Shared activity-row presentation. Used by both:
 *   - the per-job timeline inside the Job Detail dialog (JobActivityList)
 *   - the global activity feed (/dashboard/activity)
 *
 * Keeps both surfaces visually consistent — one place to add a new action
 * icon/label, one place to tweak typography. The action-code → (label, icon)
 * map deliberately lives here, not on the row itself, so unknown codes
 * fail gracefully into a sensible default rather than crashing the list.
 */

import {
  ArrowLeftRight,
  Briefcase,
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
} from 'lucide-react';

import type { ActivityRow } from '@/lib/api';

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

export function actionLabel(code: string): string {
  return ACTION_META[code]?.label ?? code;
}

export function formatRelative(iso: string): string {
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

interface Props {
  row: ActivityRow;
  /** Whether to show the job_id badge after the summary. Off for the
   *  per-job list (redundant); on for the global feed. */
  showJobBadge?: boolean;
}

export function ActivityRowItem({ row, showJobBadge = false }: Props) {
  const meta = ACTION_META[row.action] ?? { label: row.action, Icon: Mail };
  const Icon = meta.Icon;
  return (
    <li
      className="px-4 py-2 flex items-center gap-3 text-sm hover:bg-navy-50/40 transition-colors"
      data-testid={`activity-row-${row.action}`}
    >
      <Icon className="h-4 w-4 text-navy-500 flex-shrink-0" />
      <span className="font-medium text-navy-900 flex-shrink-0">{meta.label}</span>
      {row.summary && (
        <span className="text-navy-600 truncate flex-1 min-w-0">· {row.summary}</span>
      )}
      {showJobBadge && row.job_id && (
        <span
          className="text-[11px] text-navy-500 bg-navy-50 px-1.5 py-0.5 rounded font-mono flex-shrink-0"
          title={`Job ${row.job_id}`}
        >
          {row.job_id.slice(-6)}
        </span>
      )}
      <span className="text-xs text-navy-500 flex-shrink-0">{row.actor_name}</span>
      <span
        className="text-xs text-navy-400 flex-shrink-0 tabular-nums"
        title={new Date(row.created_at).toLocaleString()}
      >
        {formatRelative(row.created_at)}
      </span>
    </li>
  );
}
