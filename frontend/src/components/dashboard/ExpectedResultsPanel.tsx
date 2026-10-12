"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ChevronRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  addDaysISO,
  formatExpectedDate,
  isAwaitingVerbal,
  todayISO,
  type ExpectedVerbal,
} from '@/lib/expectedVerbal';

export interface ExpectedPanelJob {
  id: string;
  job_number: number;
  client_name?: string;
  service_type: string;
  status: string;
  total_stones: number;
  expected_verbal?: ExpectedVerbal | null;
}

interface Props<J extends ExpectedPanelJob> {
  jobs: J[];
  onOpenJob: (job: J) => void;
}

function JobLine<J extends ExpectedPanelJob>({ job, onOpen }: { job: J; onOpen: (j: J) => void }) {
  const ev = job.expected_verbal!;
  return (
    <button
      type="button"
      onClick={() => onOpen(job)}
      className="w-full grid grid-cols-[56px,1fr,auto] sm:grid-cols-[56px,1fr,80px,60px,70px,96px] gap-2 items-center px-3 py-1.5 text-left text-sm hover:bg-navy-50 rounded transition-colors"
      data-testid={`expected-panel-job-${job.job_number}`}
    >
      <span className="font-semibold text-navy-900">#{job.job_number}</span>
      <span className="truncate text-navy-700">{job.client_name || 'N/A'}</span>
      <span className="hidden sm:block text-navy-600 truncate">{job.service_type}</span>
      <span className="hidden sm:block text-navy-600">{job.total_stones} st.</span>
      <span className="hidden sm:block text-navy-500 text-xs">{ev.shipment_number ? `Shp #${ev.shipment_number}` : '—'}</span>
      <span className="text-xs text-navy-600 text-right tabular-nums">
        {formatExpectedDate(ev.date)}
        {ev.overridden && <span className="ml-1 text-navy-400" title={`Automatic date: ${formatExpectedDate(ev.auto_date)}`}>*</span>}
      </span>
    </button>
  );
}

export function ExpectedResultsPanel<J extends ExpectedPanelJob>({ jobs, onOpenJob }: Props<J>) {
  const router = useRouter();
  const today = todayISO();
  const { overdue, dueToday, upcoming } = useMemo(() => {
    const pending = jobs.filter(isAwaitingVerbal).sort((a, b) => a.expected_verbal!.date!.localeCompare(b.expected_verbal!.date!));
    const weekEnd = addDaysISO(today, 7);
    const byDate = new Map<string, number>();
    pending.forEach((j) => {
      const d = j.expected_verbal!.date!;
      if (d > today && d <= weekEnd) byDate.set(d, (byDate.get(d) || 0) + 1);
    });
    return {
      overdue: pending.filter((j) => j.expected_verbal!.date! < today),
      dueToday: pending.filter((j) => j.expected_verbal!.date === today),
      upcoming: Array.from(byDate.entries()),
    };
  }, [jobs, today]);

  const goTo = (value: string) => router.push(`/dashboard/jobs/?expected=${value}`);
  const nothing = !overdue.length && !dueToday.length && !upcoming.length;

  return (
    <Card className="border-navy-200" data-testid="expected-results-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-navy-800 flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Expected Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {nothing && <p className="text-sm text-navy-400" data-testid="expected-panel-empty">Nothing due in the next 7 days.</p>}
        {overdue.length > 0 && (
          <section data-testid="expected-panel-overdue">
            <button type="button" onClick={() => goTo('overdue')} className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-1 hover:underline">
              Overdue ({overdue.length})
            </button>
            <div className="border-l-2 border-red-500">
              {overdue.map((j) => <JobLine key={j.id} job={j} onOpen={onOpenJob} />)}
            </div>
          </section>
        )}
        {dueToday.length > 0 && (
          <section data-testid="expected-panel-today">
            <button type="button" onClick={() => goTo('today')} className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1 hover:underline">
              Today ({dueToday.length})
            </button>
            <div className="border-l-2 border-amber-500">
              {dueToday.map((j) => <JobLine key={j.id} job={j} onOpen={onOpenJob} />)}
            </div>
          </section>
        )}
        {upcoming.length > 0 && (
          <section data-testid="expected-panel-week">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500 mb-1">Next 7 days</p>
            <div className="divide-y divide-navy-100">
              {upcoming.map(([date, count]) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => goTo(date)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-navy-50 rounded transition-colors"
                  data-testid={`expected-panel-date-${date}`}
                >
                  <span className="text-navy-800">{formatExpectedDate(date)}</span>
                  <span className="flex items-center gap-1 text-navy-600">
                    {count} job{count === 1 ? '' : 's'} <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
