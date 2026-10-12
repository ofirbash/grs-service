"use client";

import React from 'react';
import { CalendarClock } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  serviceTypes: string[];
  values: Record<string, number | null>;
  editing: boolean;
  onChange: (next: Record<string, number | null>) => void;
}

const slug = (t: string) => t.toLowerCase().replace(/\s+/g, '-');

export const ServiceTurnaroundEditor: React.FC<Props> = ({ serviceTypes, values, editing, onChange }) => (
  <div className="mt-4 pt-4 border-t border-navy-200" data-testid="service-turnaround-editor">
    <Label className="text-sm font-medium text-navy-900 flex items-center gap-1.5">
      <CalendarClock className="h-4 w-4" />
      Turnaround (calendar days)
    </Label>
    <p className="text-xs text-navy-500 mt-0.5">
      Expected verbal date = to-lab shipment &quot;Date sent&quot; + these days. Leave empty for no expected date.
    </p>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
      {serviceTypes.map((type) => {
        const v = values[type];
        return (
          <div key={type} className="space-y-1">
            <span className="text-xs font-medium text-navy-700">{type}</span>
            {editing ? (
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="—"
                value={v ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === '' ? null : Math.max(0, parseInt(raw, 10));
                  onChange({ ...values, [type]: Number.isNaN(n) ? null : n });
                }}
                className="h-8 text-sm border-navy-200 bg-white"
                data-testid={`turnaround-input-${slug(type)}`}
              />
            ) : (
              <div className="text-sm text-navy-900" data-testid={`turnaround-value-${slug(type)}`}>
                {v != null ? `${v} days` : '—'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
