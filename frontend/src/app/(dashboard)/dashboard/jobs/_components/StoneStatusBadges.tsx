import React from 'react';
import type { Stone } from '../_types';

type ExtStone = Stone & {
  stone_status?: string;
  cert_status?: string;
};

/**
 * Compact per-stone status pills used in the View Job dialog.
 * Only renders when the stone carries the new `stone_status` / `cert_status`
 * fields (legacy stones show nothing, preserving the old UI).
 */
export const StoneStatusBadges: React.FC<{ stone: ExtStone }> = ({ stone }) => {
  const hasTracking = stone.stone_status || stone.cert_status;
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
    </span>
  );
};
