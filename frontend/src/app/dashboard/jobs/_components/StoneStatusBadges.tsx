import React from 'react';
import type { Stone } from '../_types';
import { isStoneVerbalComplete, isStoneCertComplete } from '@/lib/stoneCompleteness';
import { CompletenessBadges } from '@/components/jobs/CompletenessBadges';

type ExtStone = Stone & {
  stone_status?: string;
  cert_status?: string;
  kind?: string;
  stone_count?: number;
};

/**
 * Compact per-stone status pills used in the View Job dialog.
 * Only renders when the stone carries the new `stone_status` / `cert_status`
 * fields (legacy stones show nothing, preserving the old UI). Parcels also
 * surface a "Parcel of N" amber pill so admins can spot them at a glance.
 *
 * Feb 25 2026 — also surfaces the two completeness checks (Verbal / Cert)
 * inline via <CompletenessBadges> so admins can scan a job and instantly
 * see which stones still need work.
 */
export const StoneStatusBadges: React.FC<{ stone: ExtStone }> = ({ stone }) => {
  const isParcel = stone.kind === 'parcel';
  const parcelCount = isParcel ? (stone.stone_count ?? 1) : 0;
  const verbalComplete = isStoneVerbalComplete(stone);
  const certComplete = isStoneCertComplete(stone);
  const hasTracking = stone.stone_status || stone.cert_status || isParcel || verbalComplete || certComplete;
  if (!hasTracking) return null;

  const stoneLabel: Record<string, { text: string; cls: string }> = {
    at_office: { text: 'At office', cls: 'bg-navy-100 text-navy-700 border-navy-200' },
    at_lab: { text: 'At lab', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    returned: { text: 'Returned', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  };
  const certLabel: Record<string, { text: string; cls: string }> = {
    pending: { text: 'Cert pending', cls: 'bg-navy-50 text-navy-600 border-navy-200' },
    delivered: { text: 'Cert delivered', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  };

  const s = stone.stone_status ? stoneLabel[stone.stone_status] : null;
  const c = stone.cert_status ? certLabel[stone.cert_status] : null;

  return (
    <span
      className="inline-flex flex-wrap gap-1 ml-2"
      data-testid={`stone-status-${stone.id}`}
    >
      {isParcel && (
        <span
          className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-amber-100 text-amber-900 border-amber-300"
          data-testid={`stone-parcel-badge-${stone.id}`}
        >
          Parcel of {parcelCount}
        </span>
      )}
      {s && (
        <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${s.cls}`}>
          {s.text}
        </span>
      )}
      {c && (
        <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${c.cls}`}>
          {c.text}
        </span>
      )}
      <CompletenessBadges
        verbalComplete={verbalComplete}
        certComplete={certComplete}
        size="sm"
        testIdSuffix={`stone-${stone.id}`}
      />
    </span>
  );
};
