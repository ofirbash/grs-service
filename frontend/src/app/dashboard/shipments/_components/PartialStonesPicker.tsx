import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';
import type { Job, Stone } from '../_types';

type ExtendedStone = Stone & {
  stone_status?: string;
  cert_status?: string;
};

interface PartialStonesPickerProps {
  jobs: Job[];
  shipmentType: string;
  selectedStoneIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Per-certificate-group stone picker for a partial return shipment.
 *
 * Only renders when the shipment type is a return flow (`stones_from_lab`
 * or `certificates_from_lab`). For each included job it groups stones by
 * `certificate_group` (ungrouped stones become singleton groups) and
 * shows one checkbox per group — picking a group selects/deselects all of
 * its stones together. Legacy jobs (whose stones lack `stone_status`) are
 * skipped because they never acquired the fine-grained tracking.
 */
export const PartialStonesPicker: React.FC<PartialStonesPickerProps> = ({
  jobs, shipmentType, selectedStoneIds, onChange,
}) => {
  const isReturn = shipmentType === 'stones_from_lab' || shipmentType === 'certificates_from_lab';
  if (!isReturn || jobs.length === 0) return null;

  const isStoneEligible = (s: ExtendedStone): boolean => {
    if (shipmentType === 'stones_from_lab') return s.stone_status === 'at_lab';
    if (shipmentType === 'certificates_from_lab') {
      // Cert still not delivered AND the stone itself has been returned
      return s.cert_status !== 'delivered';
    }
    return false;
  };

  // Organise eligible stones per job → per certificate group
  const perJob = jobs.map((job) => {
    const stones = (job.stones || []) as ExtendedStone[];
    // Skip legacy jobs (no stone_status on any stone)
    const isTracked = stones.some((s) => s.stone_status || s.cert_status);
    const eligible = isTracked ? stones.filter(isStoneEligible) : [];

    const groupsMap = new Map<string, { label: string; stones: ExtendedStone[] }>();
    eligible.forEach((s) => {
      const key = s.certificate_group != null ? `cert-${s.certificate_group}` : `solo-${s.id}`;
      const label = s.certificate_group != null
        ? `Cert. Group ${s.certificate_group}`
        : `Ungrouped · ${s.sku}`;
      if (!groupsMap.has(key)) groupsMap.set(key, { label, stones: [] });
      groupsMap.get(key)!.stones.push(s);
    });

    return {
      job,
      isTracked,
      totalEligible: eligible.length,
      totalStones: stones.length,
      groups: Array.from(groupsMap.entries()).map(([key, g]) => ({ key, ...g })),
    };
  });

  const toggleGroup = (stones: ExtendedStone[]) => {
    const ids = stones.map((s) => s.id);
    const allSelected = ids.every((id) => selectedStoneIds.includes(id));
    if (allSelected) {
      onChange(selectedStoneIds.filter((id) => !ids.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedStoneIds, ...ids]));
      onChange(merged);
    }
  };

  const selectAll = () => {
    const all = perJob.flatMap((p) => p.groups.flatMap((g) => g.stones.map((s) => s.id)));
    onChange(Array.from(new Set(all)));
  };
  const clearAll = () => onChange([]);

  const headline =
    shipmentType === 'stones_from_lab'
      ? 'Select stones to return'
      : 'Select certificates to deliver';
  const emptyNote =
    shipmentType === 'stones_from_lab'
      ? 'No stones currently at the lab in the selected jobs.'
      : 'No certificates pending delivery in the selected jobs.';

  const anyEligible = perJob.some((p) => p.totalEligible > 0);

  return (
    <div
      className="space-y-3 border border-navy-200 rounded-lg p-3 bg-navy-50/30"
      data-testid="partial-stones-picker"
    >
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold text-navy-900">{headline}</Label>
        {anyEligible && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-navy-700 hover:underline"
              data-testid="select-all-stones"
            >
              Select all
            </button>
            <span className="text-navy-300">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-navy-700 hover:underline"
              data-testid="clear-all-stones"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {!anyEligible ? (
        <p className="text-xs text-navy-500 italic">{emptyNote}</p>
      ) : (
        perJob.map(({ job, isTracked, totalEligible, totalStones, groups }) => (
          <div
            key={job.id}
            className="rounded-md border border-navy-100 bg-white p-3 space-y-2"
            data-testid={`picker-job-${job.job_number}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-navy-900">
                Job #{job.job_number}{' '}
                <span className="text-navy-500 font-normal">· {job.client_name || 'N/A'}</span>
              </span>
              {!isTracked ? (
                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-200">
                  Legacy job — whole job ships
                </Badge>
              ) : (
                <span className="text-[10px] text-navy-500">
                  {totalEligible} of {totalStones} eligible
                </span>
              )}
            </div>
            {isTracked && groups.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {groups.map(({ key, label, stones }) => {
                  const allSelected = stones.every((s) => selectedStoneIds.includes(s.id));
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => toggleGroup(stones)}
                      className={`flex items-center gap-2 rounded border text-left px-2 py-1.5 text-xs transition-colors ${
                        allSelected
                          ? 'border-navy-800 bg-navy-100 text-navy-900'
                          : 'border-navy-200 hover:bg-navy-50 text-navy-700'
                      }`}
                      data-testid={`picker-group-${job.job_number}-${key}`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center ${
                          allSelected ? 'bg-navy-800 border-navy-800' : 'border-navy-300'
                        }`}
                      >
                        {allSelected && <CheckCircle className="h-3 w-3 text-white" />}
                      </span>
                      <span className="flex-1 truncate">
                        {label}
                        <span className="text-navy-400 ml-1">({stones.length})</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}

      {selectedStoneIds.length > 0 && (
        <p className="text-xs text-navy-700" data-testid="picker-selection-count">
          <strong>{selectedStoneIds.length}</strong> stone(s) selected for this shipment.
        </p>
      )}
    </div>
  );
};
