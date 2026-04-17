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
  /** service ID → rolling time-series buffer */
  metrics: Map<string, MetricDataPoint[]>;
  /**
   * service ID → sliding window duration in ms.
   * Set when metric history is seeded so appendMetric trims by time
   * rather than by a fixed point count — keeps the correct range visible
   * even as live WebSocket points arrive.
   */
  metricsWindowMs: Map<string, number>;
  isLoading: boolean;
  error: string | null;

  setServices: (services: Service[]) => void;
  updateStatus: (serviceId: string, to: ServiceStatus) => void;
  appendMetric: (serviceId: string, point: MetricDataPoint) => void;
  /** Pass windowMs (the selected time range in ms) so appendMetric can maintain the correct window. */
  setMetricHistory: (serviceId: string, history: MetricDataPoint[], windowMs?: number) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

/** Maximum data points kept per service in the live buffer (~8 min at 3s) */
const MAX_POINTS = 200;

export const useServicesStore = create<ServicesState>((set) => ({
  services: new Map(),
  metrics: new Map(),
  metricsWindowMs: new Map(),
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
      const next = new Map(state.metrics);
      const windowMs = state.metricsWindowMs.get(serviceId);
      if (windowMs !== undefined) {
        // Time-based sliding window: drop points older than windowMs from the
        // latest point's timestamp — preserves the full selected time range
        // as live data arrives instead of collapsing to MAX_POINTS (~10 min).
        const cutoff = new Date(point.timestamp).getTime() - windowMs;
        next.set(serviceId, updated.filter((p) => new Date(p.timestamp).getTime() >= cutoff));
      } else {
        // Service not yet selected — cap by count to avoid unbounded growth
        if (updated.length > MAX_POINTS) updated.splice(0, updated.length - MAX_POINTS);
        next.set(serviceId, updated);
      }
      return { metrics: next };
    }),

  setMetricHistory: (serviceId, history, windowMs) =>
    set((state) => {
      const nextMetrics = new Map(state.metrics);
      nextMetrics.set(serviceId, history);
      if (windowMs !== undefined) {
        const nextWindow = new Map(state.metricsWindowMs);
        nextWindow.set(serviceId, windowMs);
        return { metrics: nextMetrics, metricsWindowMs: nextWindow };
      }
      return { metrics: nextMetrics };
    }),

  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
}));
