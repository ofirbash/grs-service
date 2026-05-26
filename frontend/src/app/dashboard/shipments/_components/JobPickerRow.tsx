"use client";

import React from 'react';
import { CheckCircle } from 'lucide-react';
import type { Job } from '../_types';

/** Concise summary line for a job row inside the
 *  Create-Shipment and Add-Jobs-to-Shipment pickers.
 *  Returned as discrete tokens so the row layout can decide how to render them. */
export const summariseJob = (job: Job) => {
  const stones = job.stones || [];
  const activeStones = stones.filter((s) => !s.cancelled);
  // Parcels: weight is already a roll-up total → just sum.
  const totalWeight = activeStones.reduce((sum, s) => sum + (s.weight || 0), 0);
  // Stone-type summary — unique, order-preserving.
  const types = Array.from(
    new Set(activeStones.map((s) => s.stone_type).filter(Boolean)),
  ) as string[];
  return {
    service: job.service_type || '',
    stones: job.total_stones,
    certificates: job.total_certificates ?? activeStones.length,
    weightCt: totalWeight,
    stoneTypes: types,
    fee: job.total_fee,
    value: job.total_value,
  };
};

interface Props {
  job: Job;
  selected: boolean;
  onToggle: () => void;
  testid: string;
}

/** Single selectable row inside the Create-Shipment + Add-Jobs pickers.
 *  Surfaces enough detail (service type, stones/certs, weight, stone types,
 *  fee, value) so the operator can pick the right job without leaving the
 *  modal — the older one-liner forced them to cross-reference the Jobs page. */
export const JobPickerRow: React.FC<Props> = ({ job, selected, onToggle, testid }) => {
  const s = summariseJob(job);
  return (
    <div
      className={`flex items-start justify-between gap-3 p-3 hover:bg-navy-50 cursor-pointer border-b last:border-b-0 ${
        selected ? 'bg-navy-100' : ''
      }`}
      onClick={onToggle}
      data-testid={testid}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div
          className={`shrink-0 mt-1 w-5 h-5 rounded border-2 flex items-center justify-center ${
            selected ? 'bg-navy-800 border-navy-800' : 'border-navy-300'
          }`}
        >
          {selected && <CheckCircle className="h-4 w-4 text-white" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-navy-900">Job #{job.job_number}</p>
            {s.service && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-navy-100 text-navy-700">
                {s.service}
              </span>
            )}
          </div>
          <p className="text-sm text-navy-600 truncate">{job.client_name || 'N/A'}</p>
          {s.stoneTypes.length > 0 && (
            <p className="text-xs text-navy-500 truncate">{s.stoneTypes.join(', ')}</p>
          )}
        </div>
      </div>
      <div className="text-right text-xs text-navy-600 shrink-0 space-y-0.5">
        <p>
          <span className="font-medium text-navy-800">{s.stones}</span> stones
          {' · '}
          <span className="font-medium text-navy-800">{s.certificates}</span> cert
        </p>
        <p>
          <span className="font-medium text-navy-800">{s.weightCt.toFixed(2)}</span> ct
        </p>
        <p>
          Fee <span className="font-medium text-navy-900">${s.fee.toLocaleString()}</span>
        </p>
        <p className="text-navy-500">
          Value ${s.value.toLocaleString()}
        </p>
      </div>
    </div>
  );
};
