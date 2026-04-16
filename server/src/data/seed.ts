import { Service, ServiceStatus } from '@healthdash/shared';

/**
 * 20 realistic microservices across four logical groups.
 * Dependencies form a realistic DAG — api-gateway fans out to core services,
 * core services depend on infra, analytics depends on core.
 */
export const SERVICES: Service[] = [
  // ── Core ─────────────────────────────────────────────────────────────────
  {
    id: 'api-gateway',
    name: 'API Gateway',
    status: 'healthy',
    group: 'core',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'platform-team',
      tier: 'critical',
      dependencies: [],
    },
  },
  {
    id: 'auth-service',
    name: 'Auth Service',
    status: 'healthy',
    group: 'core',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'identity-team',
      tier: 'critical',
      dependencies: ['cache-service', 'user-service'],
    },
  },
  {
    id: 'user-service',
    name: 'User Service',
    status: 'healthy',
    group: 'core',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'identity-team',
      tier: 'critical',
      dependencies: ['postgres-primary'],
    },
  },
  {
    id: 'product-catalog',
    name: 'Product Catalog',
    status: 'healthy',
    group: 'core',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'catalog-team',
      tier: 'critical',
      dependencies: ['search-service', 'cache-service'],
    },
  },
  {
    id: 'search-service',
    name: 'Search Service',
    status: 'healthy',
    group: 'core',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'discovery-team',
      tier: 'standard',
      dependencies: ['elasticsearch'],
    },
  },
  // ── Payments ─────────────────────────────────────────────────────────────
  {
    id: 'payment-service',
    name: 'Payment Service',
    status: 'healthy',
    group: 'payments',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'fintech-team',
      tier: 'critical',
      dependencies: ['fraud-detection', 'notification-service'],
    },
  },
  {
    id: 'order-service',
    name: 'Order Service',
    status: 'healthy',
    group: 'payments',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'commerce-team',
      tier: 'critical',
      dependencies: ['payment-service', 'inventory-service', 'shipping-service'],
    },
  },
  {
    id: 'inventory-service',
    name: 'Inventory Service',
    status: 'healthy',
    group: 'payments',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'commerce-team',
      tier: 'critical',
      dependencies: ['postgres-primary', 'message-queue'],
    },
  },
  {
    id: 'fraud-detection',
    name: 'Fraud Detection',
    status: 'healthy',
    group: 'payments',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'risk-team',
      tier: 'critical',
      dependencies: ['user-service'],
    },
  },
  {
    id: 'shipping-service',
    name: 'Shipping Service',
    status: 'healthy',
    group: 'payments',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'logistics-team',
      tier: 'standard',
      dependencies: ['notification-service'],
    },
  },
  // ── Infra ─────────────────────────────────────────────────────────────────
  {
    id: 'cache-service',
    name: 'Cache (Redis)',
    status: 'healthy',
    group: 'infra',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'infra-team',
      tier: 'critical',
      dependencies: [],
    },
  },
  {
    id: 'message-queue',
    name: 'Message Queue (Kafka)',
    status: 'healthy',
    group: 'infra',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'infra-team',
      tier: 'critical',
      dependencies: [],
    },
  },
  {
    id: 'postgres-primary',
    name: 'Postgres Primary',
    status: 'healthy',
    group: 'infra',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'dba-team',
      tier: 'critical',
      dependencies: [],
    },
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    status: 'healthy',
    group: 'infra',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'infra-team',
      tier: 'standard',
      dependencies: [],
    },
  },
  {
    id: 'cdn-service',
    name: 'CDN Service',
    status: 'healthy',
    group: 'infra',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'platform-team',
      tier: 'standard',
      dependencies: [],
    },
  },
  // ── Analytics ─────────────────────────────────────────────────────────────
  {
    id: 'analytics-service',
    name: 'Analytics Service',
    status: 'healthy',
    group: 'analytics',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'data-team',
      tier: 'standard',
      dependencies: ['message-queue', 'elasticsearch'],
    },
  },
  {
    id: 'recommendation-engine',
    name: 'Recommendation Engine',
    status: 'healthy',
    group: 'analytics',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'ml-team',
      tier: 'standard',
      dependencies: ['analytics-service', 'product-catalog'],
    },
  },
  {
    id: 'reporting-service',
    name: 'Reporting Service',
    status: 'healthy',
    group: 'analytics',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'data-team',
      tier: 'best-effort',
      dependencies: ['analytics-service', 'postgres-primary'],
    },
  },
  {
    id: 'notification-service',
    name: 'Notification Service',
    status: 'healthy',
    group: 'analytics',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'comms-team',
      tier: 'standard',
      dependencies: ['message-queue'],
    },
  },
  {
    id: 'email-service',
    name: 'Email Service',
    status: 'healthy',
    group: 'analytics',
    lastCheckedAt: new Date().toISOString(),
    metadata: {
      owner: 'comms-team',
      tier: 'best-effort',
      dependencies: ['notification-service'],
    },
  },
];

/** Derive a current status from initial randomisation so the dashboard looks
 *  alive from the very first render. */
export function seedServices(): Service[] {
  const rng = () => Math.random();
  return SERVICES.map((s) => {
    const roll = rng();
    let status: ServiceStatus = 'healthy';
    if (roll > 0.85) status = 'degraded';
    if (roll > 0.95) status = 'down';
    return { ...s, status };
  });
}
