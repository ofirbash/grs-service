"use client";

/**
 * <CompletenessBadges> — small green-check pills indicating "Verbal complete"
 * and/or "Cert complete". Used on both stone rows (Job Detail dialog) and
 * job rows (Jobs list). Only renders the checks that are TRUE — incomplete
 * states render nothing so the UI stays clean.
 *
 * Two visual sizes via `size`:
 *   - 'sm' (default): tight pill with icon + label, used on table rows
 *   - 'xs'          : icon-only round, used inside the stone-status badge
 *                     strip where space is at a premium
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  verbalComplete: boolean;
  certComplete: boolean;
  /** Job-level only: 'partial' or 'all' triggers a Returned chip; 'none' (default) hides it. */
  returnedSummary?: 'none' | 'partial' | 'all';
  size?: 'sm' | 'xs';
  /** Test-id suffix so callers (stone row vs job row) can identify their
   *  own instance without collisions. */
  testIdSuffix?: string;
}

export const CompletenessBadges: React.FC<Props> = ({
  verbalComplete,
  certComplete,
  returnedSummary = 'none',
  size = 'sm',
  testIdSuffix,
}) => {
  const showReturned = returnedSummary !== 'none';
  if (!verbalComplete && !certComplete && !showReturned) return null;

  const returnedLabel = returnedSummary === 'all' ? 'All returned' : 'Partial pickup';
  const returnedCls = returnedSummary === 'all'
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';

  if (size === 'xs') {
    return (
      <span className="inline-flex items-center gap-1 ml-2" data-testid={testIdSuffix ? `completeness-${testIdSuffix}` : undefined}>
        {verbalComplete && (
          <span
            className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-50 border border-emerald-200"
            title="Verbal findings complete"
            data-testid={testIdSuffix ? `verbal-complete-${testIdSuffix}` : 'verbal-complete'}
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          </span>
        )}
        {certComplete && (
          <span
            className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-50 border border-blue-200"
            title="Certificate uploaded"
            data-testid={testIdSuffix ? `cert-complete-${testIdSuffix}` : 'cert-complete'}
          >
            <CheckCircle2 className="h-3 w-3 text-blue-600" />
          </span>
        )}
        {showReturned && (
          <span
            className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${returnedCls}`}
            title={returnedSummary === 'all' ? 'All stones returned to client' : 'Some stones returned to client'}
            data-testid={testIdSuffix ? `returned-${returnedSummary}-${testIdSuffix}` : `returned-${returnedSummary}`}
          >
            {returnedLabel}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap gap-1 ml-2" data-testid={testIdSuffix ? `completeness-${testIdSuffix}` : undefined}>
      {verbalComplete && (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-emerald-50 text-emerald-800 border-emerald-200"
          title="Verbal findings complete"
          data-testid={testIdSuffix ? `verbal-complete-${testIdSuffix}` : 'verbal-complete'}
        >
          <CheckCircle2 className="h-3 w-3" />
          Verbal
        </span>
      )}
      {certComplete && (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-blue-50 text-blue-800 border-blue-200"
          title="Certificate uploaded"
          data-testid={testIdSuffix ? `cert-complete-${testIdSuffix}` : 'cert-complete'}
        >
          <CheckCircle2 className="h-3 w-3" />
          Cert
        </span>
      )}
      {showReturned && (
        <span
          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${returnedCls}`}
          title={returnedSummary === 'all' ? 'All stones returned to client' : 'Some stones returned to client'}
          data-testid={testIdSuffix ? `returned-${returnedSummary}-${testIdSuffix}` : `returned-${returnedSummary}`}
        >
          <CheckCircle2 className="h-3 w-3" />
          {returnedLabel}
        </span>
      )}
    </span>
  );
};
