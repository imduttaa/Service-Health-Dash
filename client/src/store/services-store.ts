import { create } from 'zustand';
import { Service, ServiceStatus, MetricDataPoint } from '@healthdash/shared';

/**
 * Stores live service data received via REST (initial) and WebSocket (updates).
 *
 * We separate services from their metric timeseries intentionally:
 *  - Service metadata (name, status) changes infrequently → small updates
 *  - MetricDataPoint arrays change every 3s per service → kept separately
 *    to avoid triggering re-renders in components that only care about status
 */

interface ServicesState {
  /** service ID → Service */
  services: Map<string, Service>;
  /** service ID → rolling time-series buffer (max MAX_POINTS) */
  metrics: Map<string, MetricDataPoint[]>;
  isLoading: boolean;
  error: string | null;

  setServices: (services: Service[]) => void;
  updateStatus: (serviceId: string, to: ServiceStatus) => void;
  appendMetric: (serviceId: string, point: MetricDataPoint) => void;
  setMetricHistory: (serviceId: string, history: MetricDataPoint[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

/** Maximum data points kept per service in the live buffer (~8 min at 3s) */
const MAX_POINTS = 200;

export const useServicesStore = create<ServicesState>((set) => ({
  services: new Map(),
  metrics: new Map(),
  isLoading: true,
  error: null,

  setServices: (services) =>
    set(() => ({
      services: new Map(services.map((s) => [s.id, s])),
      isLoading: false,
    })),

  updateStatus: (serviceId, to) =>
    set((state) => {
      const svc = state.services.get(serviceId);
      if (!svc || svc.status === to) return state;
      const next = new Map(state.services);
      next.set(serviceId, { ...svc, status: to, lastCheckedAt: new Date().toISOString() });
      return { services: next };
    }),

  appendMetric: (serviceId, point) =>
    set((state) => {
      const existing = state.metrics.get(serviceId) ?? [];
      const updated = [...existing, point];
      if (updated.length > MAX_POINTS) updated.splice(0, updated.length - MAX_POINTS);
      const next = new Map(state.metrics);
      next.set(serviceId, updated);
      return { metrics: next };
    }),

  setMetricHistory: (serviceId, history) =>
    set((state) => {
      const next = new Map(state.metrics);
      next.set(serviceId, history.slice(-MAX_POINTS));
      return { metrics: next };
    }),

  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
}));
