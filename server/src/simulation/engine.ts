import { v4 as uuidv4 } from 'uuid';
import {
  Service,
  ServiceStatus,
  MetricDataPoint,
  Alert,
  AlertSeverity,
  StreamEvent,
} from '@healthdash/shared';

// ─── Simulation state per service ────────────────────────────────────────────

interface SimState {
  /** Sine-wave phase (advances each tick) */
  phase: number;
  /** Slow-moving random walk component (−1 … +1) */
  drift: number;
  /** Base values seeded once at startup */
  base: {
    errorRate: number;  // %
    p50: number;        // ms
    requestRate: number; // req/s
    cpu: number;        // %
    memory: number;     // %
  };
  /** Cooldown tracker — prevents alert spam (metricKey → lastAlertAt ms) */
  alertCooldown: Map<string, number>;
}

/** Clamp a value between lo and hi */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Gaussian-ish noise using Box-Muller (range ≈ −3…+3, mostly −1…+1) */
function gaussianNoise(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Alert threshold definitions ─────────────────────────────────────────────

interface ThresholdRule {
  metric: string;
  getValue: (dp: MetricDataPoint) => number;
  critical: number;
  warning: number;
  unit: string;
}

const THRESHOLD_RULES: ThresholdRule[] = [
  {
    metric: 'errorRate',
    getValue: (dp) => dp.errorRate,
    critical: 10,
    warning: 5,
    unit: '%',
  },
  {
    metric: 'p99',
    getValue: (dp) => dp.responseTime.p99,
    critical: 3000,
    warning: 2000,
    unit: 'ms',
  },
  {
    metric: 'cpu',
    getValue: (dp) => dp.cpu,
    critical: 85,
    warning: 70,
    unit: '%',
  },
  {
    metric: 'memory',
    getValue: (dp) => dp.memory,
    critical: 90,
    warning: 80,
    unit: '%',
  },
];

// ─── Main simulation engine ───────────────────────────────────────────────────

export type BroadcastFn = (event: StreamEvent) => void;

export class SimulationEngine {
  private services: Map<string, Service>;
  private simStates: Map<string, SimState>;
  /**
   * Rolling metric history per service.
   * We keep 24 h worth at 3-second intervals = 28,800 points max.
   * In practice we cap at MAX_HISTORY_POINTS to bound memory.
   */
  private metricHistory: Map<string, MetricDataPoint[]>;
  private alerts: Alert[];
  private broadcast: BroadcastFn;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Maximum data points kept per service (~8 hours at 3s cadence) */
  private static readonly MAX_HISTORY_POINTS = 10_000;
  /** Minimum ms between repeat alerts for the same service+metric */
  private static readonly ALERT_COOLDOWN_MS = 60_000;

  constructor(services: Service[], broadcast: BroadcastFn) {
    this.broadcast = broadcast;
    this.services = new Map(services.map((s) => [s.id, { ...s }]));
    this.alerts = [];
    this.metricHistory = new Map();
    this.simStates = new Map();

    for (const svc of services) {
      this.simStates.set(svc.id, this.initSimState(svc));
      // Pre-fill 5 minutes of history so charts aren't empty on first load
      this.metricHistory.set(svc.id, this.generateHistory(svc.id, 5 * 60));
    }
  }

  // ── Initialisation helpers ──────────────────────────────────────────────

  private initSimState(svc: Service): SimState {
    const rng = Math.random;
    // "down" services start with terrible metrics; "degraded" with mediocre ones
    const statusMult = svc.status === 'down' ? 4 : svc.status === 'degraded' ? 2 : 1;
    return {
      phase: rng() * Math.PI * 2,
      drift: (rng() - 0.5) * 0.4,
      base: {
        errorRate: rng() * 2 * statusMult,
        p50: 80 + rng() * 300 * statusMult,
        requestRate: 20 + rng() * 500,
        cpu: 15 + rng() * 40 * statusMult,
        memory: 25 + rng() * 35,
      },
      alertCooldown: new Map(),
    };
  }

  /**
   * Synthetic history — generates `seconds` worth of data going backwards
   * from now at a 3-second cadence without the broadcast path.
   */
  private generateHistory(serviceId: string, seconds: number): MetricDataPoint[] {
    const state = this.simStates.get(serviceId)!;
    const points: MetricDataPoint[] = [];
    const count = Math.floor(seconds / 3);
    const now = Date.now();

    // Clone state locally so we don't mutate the live state
    let phase = state.phase - count * 0.08;
    let drift = state.drift;

    for (let i = 0; i < count; i++) {
      const timestamp = new Date(now - (count - i) * 3000).toISOString();
      phase += 0.08;
      drift += (Math.random() - 0.5) * 0.02;
      drift = clamp(drift, -1, 1);
      points.push(this.computeDataPoint(state.base, phase, drift, timestamp));
    }
    return points;
  }

  // ── Per-tick computation ────────────────────────────────────────────────

  /**
   * Pure function: compute a MetricDataPoint from base values + oscillation.
   *
   * The formula mixes three components:
   *   1. A slow sine wave  → periodic day/night-style load patterns
   *   2. A Gaussian noise  → realistic second-to-second jitter
   *   3. Rare spike events → simulates traffic bursts / incidents
   */
  private computeDataPoint(
    base: SimState['base'],
    phase: number,
    drift: number,
    timestamp: string,
  ): MetricDataPoint {
    const noise = gaussianNoise() * 0.3;
    const spike = Math.random() < 0.03 ? Math.random() * 5 : 0; // 3 % chance

    const errorRate = clamp(
      base.errorRate + Math.sin(phase * 0.7) * 1.5 + drift * 2 + noise + spike * 8,
      0,
      100,
    );

    const p50 = clamp(
      base.p50 * (1 + Math.sin(phase * 0.5) * 0.25 + noise * 0.15 + spike * 0.8),
      1,
      10_000,
    );
    const p95 = clamp(p50 * (1.6 + Math.abs(noise) * 0.3), p50, 15_000);
    const p99 = clamp(p95 * (1.8 + Math.abs(noise) * 0.5), p95, 20_000);

    const requestRate = clamp(
      base.requestRate * (1 + Math.sin(phase * 0.3) * 0.35 + noise * 0.1),
      0,
      10_000,
    );

    const cpu = clamp(
      base.cpu + Math.sin(phase * 0.8) * 12 + drift * 5 + noise * 3 + spike * 15,
      0,
      100,
    );

    const memory = clamp(
      base.memory + Math.sin(phase * 0.2) * 4 + drift * 2 + noise,
      0,
      100,
    );

    return {
      timestamp,
      responseTime: {
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
      },
      requestRate: Math.round(requestRate * 10) / 10,
      errorRate: Math.round(errorRate * 100) / 100,
      cpu: Math.round(cpu * 10) / 10,
      memory: Math.round(memory * 10) / 10,
    };
  }

  /** Derive a ServiceStatus from current metrics */
  private deriveStatus(dp: MetricDataPoint): ServiceStatus {
    if (dp.errorRate > 15 || dp.responseTime.p99 > 5000 || dp.cpu > 92) return 'down';
    if (dp.errorRate > 5 || dp.responseTime.p99 > 2000 || dp.cpu > 75) return 'degraded';
    return 'healthy';
  }

  /** Check thresholds and emit alert if needed */
  private maybeEmitAlert(svc: Service, dp: MetricDataPoint, state: SimState): void {
    const now = Date.now();

    for (const rule of THRESHOLD_RULES) {
      const value = rule.getValue(dp);
      let severity: AlertSeverity | null = null;
      let threshold = 0;

      if (value >= rule.critical) {
        severity = 'critical';
        threshold = rule.critical;
      } else if (value >= rule.warning) {
        severity = 'warning';
        threshold = rule.warning;
      }

      if (!severity) continue;

      const cooldownKey = `${svc.id}:${rule.metric}:${severity}`;
      const lastAt = state.alertCooldown.get(cooldownKey) ?? 0;
      if (now - lastAt < SimulationEngine.ALERT_COOLDOWN_MS) continue;

      state.alertCooldown.set(cooldownKey, now);

      const alert: Alert = {
        id: uuidv4(),
        serviceId: svc.id,
        serviceName: svc.name,
        severity,
        message: `${svc.name}: ${rule.metric} is ${value.toFixed(1)}${rule.unit} (threshold ${threshold}${rule.unit})`,
        metric: rule.metric,
        threshold,
        currentValue: Math.round(value * 100) / 100,
        status: 'open',
        triggeredAt: dp.timestamp,
      };

      this.alerts.unshift(alert);
      // Keep alert list bounded
      if (this.alerts.length > 10_000) this.alerts.pop();

      this.broadcast({ type: 'alert_created', data: alert });
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  start(): void {
    if (this.intervalId) return;

    const tick = () => {
      for (const [id, svc] of this.services) {
        const state = this.simStates.get(id)!;
        state.phase += 0.06 + Math.random() * 0.04; // slight jitter in frequency
        state.drift += (Math.random() - 0.5) * 0.015;
        state.drift = clamp(state.drift, -1, 1);

        const dp = this.computeDataPoint(state.base, state.phase, state.drift, new Date().toISOString());

        // Append to history and prune if needed
        const history = this.metricHistory.get(id)!;
        history.push(dp);
        if (history.length > SimulationEngine.MAX_HISTORY_POINTS) {
          history.splice(0, history.length - SimulationEngine.MAX_HISTORY_POINTS);
        }

        // Status transition
        const newStatus = this.deriveStatus(dp);
        const oldStatus = svc.status;
        if (newStatus !== oldStatus) {
          svc.status = newStatus;
          svc.lastCheckedAt = dp.timestamp;
          this.broadcast({ type: 'status_change', serviceId: id, from: oldStatus, to: newStatus });
        }

        // Check alert thresholds
        this.maybeEmitAlert(svc, dp, state);

        // Broadcast metric update
        this.broadcast({ type: 'metric_update', serviceId: id, data: dp });
      }
    };

    // Randomise initial delay so services don't all tick simultaneously
    this.intervalId = setInterval(tick, 3000);
    // First tick right away
    setTimeout(tick, 200);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ── Data accessors ──────────────────────────────────────────────────────

  getServices(): Service[] {
    return [...this.services.values()];
  }

  getService(id: string): Service | undefined {
    return this.services.get(id);
  }

  getMetrics(
    serviceId: string,
    from: Date,
    to: Date,
    resolution: string,
  ): MetricDataPoint[] {
    const history = this.metricHistory.get(serviceId) ?? [];
    const filtered = history.filter((dp) => {
      const t = new Date(dp.timestamp).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });

    // Down-sample based on resolution
    const step = resolutionToStep(resolution, filtered.length);
    if (step <= 1) return filtered;
    return filtered.filter((_, i) => i % step === 0);
  }

  getAlerts(opts: {
    status?: string;
    severity?: string;
    serviceId?: string;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    let filtered = this.alerts;

    if (opts.status) filtered = filtered.filter((a) => a.status === opts.status);
    if (opts.severity) filtered = filtered.filter((a) => a.severity === opts.severity);
    if (opts.serviceId) filtered = filtered.filter((a) => a.serviceId === opts.serviceId);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      filtered = filtered.filter((a) => a.message.toLowerCase().includes(q));
    }

    const total = filtered.length;
    const start = (opts.page - 1) * opts.pageSize;
    const data = filtered.slice(start, start + opts.pageSize);

    return {
      data,
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: Math.ceil(total / opts.pageSize),
    };
  }

  updateAlert(id: string, status: 'acknowledged' | 'resolved'): Alert | null {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return null;
    alert.status = status;
    if (status === 'acknowledged') alert.acknowledgedAt = new Date().toISOString();
    if (status === 'resolved') alert.resolvedAt = new Date().toISOString();
    return alert;
  }

  getSummary() {
    const services = this.getServices();
    const healthy = services.filter((s) => s.status === 'healthy').length;
    const degraded = services.filter((s) => s.status === 'degraded').length;
    const down = services.filter((s) => s.status === 'down').length;

    const openAlerts = this.alerts.filter((a) => a.status === 'open');
    const critical = openAlerts.filter((a) => a.severity === 'critical').length;
    const warning = openAlerts.filter((a) => a.severity === 'warning').length;
    const info = openAlerts.filter((a) => a.severity === 'info').length;

    // Compute average p99 across all services from latest data point
    let totalP99 = 0;
    let count = 0;
    for (const [id] of this.services) {
      const history = this.metricHistory.get(id);
      if (history?.length) {
        totalP99 += history[history.length - 1].responseTime.p99;
        count++;
      }
    }

    return {
      totalServices: services.length,
      healthyCount: healthy,
      degradedCount: degraded,
      downCount: down,
      activeAlerts: { critical, warning, info },
      avgResponseTime: count ? Math.round(totalP99 / count) : 0,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolutionToStep(resolution: string, totalPoints: number): number {
  const targets: Record<string, number> = {
    raw: 1,
    '1m': 20,  // 3s × 20 = 60s
    '5m': 100,
    '15m': 300,
  };
  const target = targets[resolution] ?? 1;
  return Math.max(1, Math.floor(totalPoints / Math.max(1, totalPoints / target)));
}
