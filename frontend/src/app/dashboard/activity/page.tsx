"use client";

/**
 * Global activity feed at /dashboard/activity.
 *
 * Admin-only. Sticky filter bar at the top (Action multi-select pills,
 * Actor dropdown, From/To date inputs, Clear button) with a scrolling
 * results list below. Default range = last 7 days; cursor pagination
 * via "Load more" (passes the `created_at` of the oldest row as `before`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';

import { activityApi, type ActivityRow } from '@/lib/api';
import { ActivityRowItem } from '@/components/activity/ActivityRowItem';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/lib/store';

interface ActionOption {
  code: string;
  label: string;
}
interface ActorOption {
  actor_id: string;
  name: string;
  role: string | null;
  last_seen: string | null;
}

const PAGE_SIZE = 200;
const DEFAULT_LOOKBACK_DAYS = 7;
const ALL_ACTORS = '__all__';

function isoDayStart(iso: string | ''): string | undefined {
  // Native <input type="date"> emits "YYYY-MM-DD"; append the time part so
  // the backend's `fromisoformat` interprets it consistently.
  return iso ? `${iso}T00:00:00` : undefined;
}
function isoDayEnd(iso: string | ''): string | undefined {
  // Upper bound is exclusive on the backend (`$lt`), so add a full day
  // so the user's "to=2026-06-13" includes events from 2026-06-13 23:59.
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10) + 'T00:00:00';
}
function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ActivityFeedPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';

  const [actions, setActions] = useState<ActionOption[]>([]);
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [selectedActor, setSelectedActor] = useState<string>(ALL_ACTORS);
  const [fromDate, setFromDate] = useState<string>(defaultFrom());
  const [toDate, setToDate] = useState<string>(todayStr());

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load action + actor options once. Failures here are non-fatal — we'd
  // rather show an empty dropdown than block the whole page on a 502.
  useEffect(() => {
    if (!isAdmin) return;
    activityApi.listActions().then(setActions).catch(() => setActions([]));
    activityApi.listActors().then(setActors).catch(() => setActors([]));
  }, [isAdmin]);

  const baseParams = useMemo(() => {
    const params: Parameters<typeof activityApi.listGlobal>[0] = {
      limit: PAGE_SIZE,
    };
    if (selectedActions.size > 0) params.action = Array.from(selectedActions);
    if (selectedActor !== ALL_ACTORS) params.actor_id = selectedActor;
    const f = isoDayStart(fromDate);
    const t = isoDayEnd(toDate);
    if (f) params.from_date = f;
    if (t) params.to_date = t;
    return params;
  }, [selectedActions, selectedActor, fromDate, toDate]);

  const fetchFirstPage = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await activityApi.listGlobal(baseParams);
      setRows(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load activity';
      setError(msg);
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, baseParams]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  const handleLoadMore = async () => {
    if (rows.length === 0) return;
    const oldest = rows[rows.length - 1];
    setLoadingMore(true);
    try {
      const data = await activityApi.listGlobal({
        ...baseParams,
        before: oldest.created_at,
      });
      setRows((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load more';
      setError(msg);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleAction = (code: string) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleClear = () => {
    setSelectedActions(new Set());
    setSelectedActor(ALL_ACTORS);
    setFromDate(defaultFrom());
    setToDate(todayStr());
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-navy-500" data-testid="activity-not-authorised">
        You don&apos;t have access to the activity log.
      </div>
    );
  }

  const hasAnyFilter =
    selectedActions.size > 0 ||
    selectedActor !== ALL_ACTORS ||
    fromDate !== defaultFrom() ||
    toDate !== todayStr();

  return (
    <div className="space-y-4" data-testid="activity-feed-page">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-navy-700" />
        <h1 className="text-2xl font-semibold text-navy-900">Activity</h1>
        <span className="text-sm text-navy-500">
          {loading ? 'Loading…' : `${rows.length} event${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Sticky filter bar */}
      <div
        className="sticky top-0 z-10 bg-white border border-navy-200 rounded-lg p-4 space-y-3 shadow-sm"
        data-testid="activity-filter-bar"
      >
        {/* Action multi-select as toggleable pills */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-600">
              Action
            </span>
            {selectedActions.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedActions(new Set())}
                className="text-xs text-navy-500 hover:text-navy-900"
                data-testid="clear-actions-button"
              >
                Clear ({selectedActions.size})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => {
              const active = selectedActions.has(a.code);
              return (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => toggleAction(a.code)}
                  data-testid={`action-pill-${a.code}`}
                  className={
                    'text-xs px-2.5 py-1 rounded-full border transition-colors ' +
                    (active
                      ? 'bg-navy-900 text-white border-navy-900'
                      : 'bg-white text-navy-700 border-navy-200 hover:border-navy-400')
                  }
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actor + date row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-navy-600 block mb-1">
              Actor
            </label>
            <Select value={selectedActor} onValueChange={setSelectedActor}>
              <SelectTrigger className="h-9" data-testid="actor-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACTORS}>All actors</SelectItem>
                {actors.map((a) => (
                  <SelectItem key={a.actor_id} value={a.actor_id}>
                    {a.name}
                    {a.role ? ` · ${a.role.replace('_', ' ')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-navy-600 block mb-1">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="from-date-input"
              className="h-9 w-full px-3 rounded-md border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-navy-600 block mb-1">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="to-date-input"
              className="h-9 w-full px-3 rounded-md border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-9 flex-1"
              disabled={!hasAnyFilter}
              data-testid="clear-filters-button"
            >
              Clear filters
            </Button>
            <Button
              size="sm"
              onClick={fetchFirstPage}
              className="h-9 flex-1 bg-navy-900 hover:bg-navy-800"
              data-testid="refresh-button"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="border border-navy-200 rounded-lg bg-white" data-testid="activity-results">
        {error && (
          <div
            className="px-4 py-3 text-sm text-red-600 flex items-center gap-2"
            data-testid="activity-error"
          >
            <X className="h-4 w-4" />
            {error}
          </div>
        )}

        {loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-navy-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity…
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div
            className="px-4 py-12 text-center text-navy-500"
            data-testid="activity-empty"
          >
            No activity matches these filters.
          </div>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-navy-100">
            {rows.map((row) => (
              <ActivityRowItem key={row.id} row={row} showJobBadge />
            ))}
          </ul>
        )}

        {hasMore && rows.length > 0 && (
          <div className="border-t border-navy-100 px-4 py-3 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
              data-testid="load-more-button"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Loading…
                </>
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
