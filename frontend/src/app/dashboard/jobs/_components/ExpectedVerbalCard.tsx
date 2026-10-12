"use client";

import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jobsApi } from '@/lib/api';
import { formatExpectedDate } from '@/lib/expectedVerbal';
import { ExpectedVerbalCell } from '@/components/jobs/ExpectedVerbalCell';
import type { Job } from '../_types';

interface Props {
  job: Job;
  isAdmin: boolean;
  onUpdated: (job: Job) => void;
}

export const ExpectedVerbalCard: React.FC<Props> = ({ job, isAdmin, onUpdated }) => {
  const ev = job.expected_verbal;
  const [draft, setDraft] = useState(ev?.date || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(ev?.date || ''), [ev?.date]);

  const save = async (date: string | null) => {
    setSaving(true);
    try {
      onUpdated(await jobsApi.setExpectedVerbalDate(job.id, date));
    } catch (e) {
      console.error('Failed to update expected date:', e);
      alert('Failed to update expected date');
    } finally {
      setSaving(false);
    }
  };

  const source = ev?.sent_date
    ? `Shipment #${ev.shipment_number} sent ${formatExpectedDate(ev.sent_date)} · ${job.service_type}`
    : 'Not shipped to the lab yet';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-navy-200 bg-navy-50/50 px-3 py-2" data-testid="expected-verbal-card">
      <div className="flex items-center gap-2 text-sm text-navy-700">
        <CalendarClock className="h-4 w-4" />
        <span className="font-medium">Expected Results</span>
      </div>
      <ExpectedVerbalCell job={job} />
      <span className="text-xs text-navy-500" data-testid="expected-verbal-source">
        {source}
        {ev?.overridden && ` · automatic ${formatExpectedDate(ev.auto_date)}`}
      </span>
      {isAdmin && job.status !== 'cancelled' && (
        <div className="flex items-center gap-2 ml-auto">
          <Input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 w-40 text-sm border-navy-200 bg-white"
            data-testid="expected-verbal-override-input"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={saving || !draft || draft === ev?.date}
            onClick={() => save(draft)}
            data-testid="expected-verbal-override-save"
          >
            Set date
          </Button>
          {ev?.overridden && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-navy-600"
              disabled={saving}
              onClick={() => save(null)}
              data-testid="expected-verbal-override-clear"
            >
              Clear override
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
