"use client";

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const PAGE_SIZE = 50;

interface Props {
  page: number;
  total: number;
  pageSize?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  testId?: string;
}

/** "1–50 of 612" + Previous / Next controls under a paged list. */
export const Pager: React.FC<Props> = ({ page, total, pageSize = PAGE_SIZE, loading, onPageChange, testId = 'pager' }) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-navy-100 text-sm text-navy-600" data-testid={testId}>
      <span data-testid={`${testId}-range`}>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)} data-testid={`${testId}-prev`}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <Button variant="outline" size="sm" disabled={loading || page >= lastPage} onClick={() => onPageChange(page + 1)} data-testid={`${testId}-next`}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};

/** Debounce a fast-changing value (search boxes) before hitting the server. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Light placeholder overlay shown while a page of rows is loading. */
export const ListLoading: React.FC<{ show: boolean }> = ({ show }) =>
  show ? (
    <div className="h-0.5 w-full overflow-hidden bg-navy-100" data-testid="list-loading">
      <div className="h-full w-1/3 bg-navy-600 animate-pulse" />
    </div>
  ) : null;
