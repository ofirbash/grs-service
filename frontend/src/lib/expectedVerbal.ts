// Expected Verbal Date helpers (dates are calendar-day ISO strings "YYYY-MM-DD").

export interface ExpectedVerbal {
  date: string | null;
  auto_date: string | null;
  overridden: boolean;
  sent_date: string | null;
  shipment_number: number | null;
  received: boolean;
}

export interface ExpectedJobLike {
  status: string;
  expected_verbal?: ExpectedVerbal | null;
}

export type ExpectedFilter = 'any' | 'overdue' | 'today' | 'week' | 'date';

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = (): string => toISODate(new Date());

export const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
};

export const formatExpectedDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Still awaiting verbal results and has a date to track. */
export const isAwaitingVerbal = (job: ExpectedJobLike): boolean =>
  !!job.expected_verbal?.date && !job.expected_verbal.received && job.status !== 'cancelled';

export type Urgency = 'overdue' | 'today' | null;

export const expectedUrgency = (job: ExpectedJobLike, today = todayISO()): Urgency => {
  if (!isAwaitingVerbal(job)) return null;
  const date = job.expected_verbal!.date!;
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return null;
};

export const matchesExpectedFilter = (
  job: ExpectedJobLike,
  filter: ExpectedFilter,
  pickedDate: string,
  today = todayISO(),
): boolean => {
  if (filter === 'any') return true;
  if (!isAwaitingVerbal(job)) return false;
  const date = job.expected_verbal!.date!;
  if (filter === 'overdue') return date < today;
  if (filter === 'today') return date === today;
  if (filter === 'week') return date >= today && date <= addDaysISO(today, 7);
  return !!pickedDate && date === pickedDate;
};
