import {
  Service,
  MetricDataPoint,
  Alert,
  AlertsQuery,
  MetricsQuery,
  DashboardSummary,
  PaginatedResponse,
  FeatureFlags,
} from '@healthdash/shared';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${res.status}] ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Services ──────────────────────────────────────────────────────────────

export const api = {
  services: {
    list: () => request<Service[]>('/services'),
    metrics: (id: string, query: MetricsQuery = {}) => {
      const params = new URLSearchParams();
      if (query.from) params.set('from', query.from);
      if (query.to) params.set('to', query.to);
      if (query.resolution) params.set('resolution', query.resolution);
      const qs = params.toString();
      return request<MetricDataPoint[]>(`/services/${id}/metrics${qs ? `?${qs}` : ''}`);
    },
  },

  alerts: {
    list: (query: AlertsQuery = {}) => {
      const params = new URLSearchParams();
      if (query.status) params.set('status', query.status);
      if (query.severity) params.set('severity', query.severity);
      if (query.serviceId) params.set('serviceId', query.serviceId);
      if (query.search) params.set('search', query.search);
      if (query.page) params.set('page', String(query.page));
      if (query.pageSize) params.set('pageSize', String(query.pageSize));
      return request<PaginatedResponse<Alert>>(`/alerts?${params.toString()}`);
    },
    update: (id: string, status: 'acknowledged' | 'resolved') =>
      request<Alert>(`/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },

  dashboard: {
    summary: () => request<DashboardSummary>('/dashboard/summary'),
  },

  flags: {
    getAll: () => request<FeatureFlags>('/flags'),
    patch: (overrides: Partial<FeatureFlags>) =>
      request<FeatureFlags>('/flags', {
        method: 'PATCH',
        body: JSON.stringify(overrides),
      }),
  },
};
