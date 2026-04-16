// ─── Core domain types ────────────────────────────────────────────────────────

export type ServiceStatus = 'healthy' | 'degraded' | 'down';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type ServiceTier = 'critical' | 'standard' | 'best-effort';

export interface ServiceMetadata {
  owner: string;
  tier: ServiceTier;
  /** IDs of other services this one depends on */
  dependencies: string[];
}

export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  /** Logical grouping: "core" | "payments" | "infra" | "analytics" */
  group: string;
  lastCheckedAt: string; // ISO 8601
  metadata: ServiceMetadata;
}

export interface ResponseTimePercentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricDataPoint {
  timestamp: string; // ISO 8601
  responseTime: ResponseTimePercentiles;
  /** requests per second */
  requestRate: number;
  /** percentage 0–100 */
  errorRate: number;
  /** percentage 0–100 */
  cpu: number;
  /** percentage 0–100 */
  memory: number;
}

export interface Alert {
  id: string;
  serviceId: string;
  serviceName: string;
  severity: AlertSeverity;
  message: string;
  /** Which metric triggered the alert */
  metric: string;
  threshold: number;
  currentValue: number;
  status: AlertStatus;
  triggeredAt: string; // ISO 8601
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface DashboardSummary {
  totalServices: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  activeAlerts: {
    critical: number;
    warning: number;
    info: number;
  };
  avgResponseTime: number;
}

// ─── WebSocket / SSE stream event types (discriminated union) ─────────────────

export type StreamEvent =
  | { type: 'metric_update'; serviceId: string; data: MetricDataPoint }
  | { type: 'alert_created'; data: Alert }
  | { type: 'status_change'; serviceId: string; from: ServiceStatus; to: ServiceStatus };

// ─── API response envelopes ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AlertsQuery {
  status?: AlertStatus;
  severity?: AlertSeverity;
  serviceId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MetricsQuery {
  from?: string;
  to?: string;
  /** 'raw' | '1m' | '5m' | '15m' */
  resolution?: string;
}

// ─── Feature flags ────────────────────────────────────────────────────────────

export type FeatureFlagKey =
  | 'enable-metrics-panel'
  | 'enable-dependency-map'
  | 'enable-alert-actions';

export type FeatureFlags = Record<FeatureFlagKey, boolean>;
