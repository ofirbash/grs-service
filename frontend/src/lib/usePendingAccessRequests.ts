"use client";

import { create } from 'zustand';
import { accessRequestApi } from '@/lib/api';

/** Tiny store holding the number of *pending* access requests, used by the
 *  sidebar Clients link and the "Access Requests" tab to render a red
 *  notification badge.
 *
 *  Kept separate from the heavyweight access_requests list query — the
 *  badge updates on a polling interval (30 s) from anywhere in the app,
 *  and is also `refresh()`-able after approve/reject inside the tab.
 */
interface State {
  count: number;
  lastFetched: number; // epoch ms
  refresh: () => Promise<void>;
  reset: () => void;
}

export const usePendingAccessRequestsStore = create<State>((set, get) => ({
  count: 0,
  lastFetched: 0,
  refresh: async () => {
    try {
      const count = await accessRequestApi.pendingCount();
      set({ count, lastFetched: Date.now() });
    } catch {
      // Endpoint is admin-only; non-admins quietly drop the error and stay at 0.
      // Network failures also no-op — the stale count is better than blanking.
    }
  },
  reset: () => set({ count: 0, lastFetched: 0 }),
}));
