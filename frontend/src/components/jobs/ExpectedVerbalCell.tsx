"use client";

import React from 'react';

import { expectedUrgency, formatExpectedDate, type ExpectedJobLike } from '@/lib/expectedVerbal';

interface Props {
  job: ExpectedJobLike & { job_number: number };
}

/** Compact "Expected Results" cell: date + Overdue / Today / Adjusted tags. */
export const ExpectedVerbalCell: React.FC<Props> = ({ job }) => {
  const ev = job.expected_verbal;
  const tid = `expected-verbal-${job.job_number}`;
  if (job.status === 'cancelled') return <span className="text-navy-300" data-testid={tid}>-</span>;
  if (!ev?.sent_date && !ev?.date) {
    return <span className="text-[11px] text-navy-400" data-testid={tid}>Not shipped yet</span>;
  }
  if (!ev.date) {
    return (
      <span className="text-[11px] text-navy-400" title="No turnaround set for this service type" data-testid={tid}>
        —
      </span>
    );
  }
  const urgency = expectedUrgency(job);
  return (
    <div className="leading-tight" data-testid={tid}>
      <div className={ev.received ? 'text-navy-400' : 'font-medium text-navy-900'}>{formatExpectedDate(ev.date)}</div>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {urgency === 'overdue' && (
          <span className="text-[10px] font-semibold uppercase px-1 rounded bg-red-100 text-red-700 border border-red-300" data-testid={`${tid}-overdue`}>
            Overdue
          </span>
        )}
        {urgency === 'today' && (
          <span className="text-[10px] font-semibold uppercase px-1 rounded bg-amber-100 text-amber-800 border border-amber-300" data-testid={`${tid}-today`}>
            Today
          </span>
        )}
        {ev.overridden && (
          <span
            className="text-[10px] font-medium px-1 rounded border border-navy-300 text-navy-600"
            title={`Automatic date: ${formatExpectedDate(ev.auto_date)}`}
            data-testid={`${tid}-adjusted`}
          >
            Adjusted
          </span>
        )}
      </div>
    </div>
  );
};
