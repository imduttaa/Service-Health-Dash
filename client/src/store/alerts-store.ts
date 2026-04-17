import { create } from 'zustand';
import { Alert } from '@healthdash/shared';

/**
 * Stores "live" alerts that arrive via WebSocket — these supplement the
 * server-paginated list in TanStack Query.
 *
 * Why two separate stores for alerts?
 *  - The paginated list from TanStack Query is the canonical source of truth
 *    for all historical alerts (filtering, sorting, pagination).
 *  - This store holds only the newest alerts from the live stream so the
 *    table can flash the "new row" highlight without invalidating the full page.
 */

interface AlertsStreamState {
  /** New alerts received since last page refresh — prepended to the table */
  liveAlerts: Alert[];
  /** IDs of alerts that just arrived (cleared after 3s to remove highlight) */
  newAlertIds: Set<string>;

  addLiveAlert: (alert: Alert) => void;
  /** Update the status of a live alert in-place (after Ack/Resolve mutation) */
  updateLiveAlert: (updated: Alert) => void;
  clearHighlight: (id: string) => void;
  clearLiveAlerts: () => void;
}

export const useAlertsStreamStore = create<AlertsStreamState>((set) => ({
  liveAlerts: [],
  newAlertIds: new Set(),

  addLiveAlert: (alert) =>
    set((state) => ({
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 100), // keep last 100
      newAlertIds: new Set([...state.newAlertIds, alert.id]),
    })),

  updateLiveAlert: (updated) =>
    set((state) => ({
      liveAlerts: state.liveAlerts.map((a) => (a.id === updated.id ? updated : a)),
    })),

  clearHighlight: (id) =>
    set((state) => {
      const next = new Set(state.newAlertIds);
      next.delete(id);
      return { newAlertIds: next };
    }),

  clearLiveAlerts: () => set({ liveAlerts: [], newAlertIds: new Set() }),
}));
