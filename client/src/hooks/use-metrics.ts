import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useServicesStore } from '../store/services-store';
import { timeRangeToFrom, UrlState } from './use-url-state';

/**
 * Fetches historical metrics for a service and seeds the live buffer in
 * the Zustand store.  After seeding, the WebSocket stream appends new
 * points via ServicesStore.appendMetric without re-fetching.
 *
 * TanStack Query handles:
 *  - Deduplication: if two panels somehow request the same service+range,
 *    only one network request is issued (queryKey-based cache)
 *  - Background revalidation when timeRange changes
 *  - Loading/error state surfacing
 */
/** Maps each time-range label to its duration in milliseconds. */
const RANGE_MS: Record<UrlState['timeRange'], number> = {
  '5m':  5  * 60_000,
  '15m': 15 * 60_000,
  '1h':  60 * 60_000,
  '6h':  6  * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

export function useMetrics(serviceId: string | null, timeRange: UrlState['timeRange']) {
  const setMetricHistory = useServicesStore((s) => s.setMetricHistory);
  const liveMetrics = useServicesStore((s) =>
    serviceId ? (s.metrics.get(serviceId) ?? []) : [],
  );

  const query = useQuery({
    queryKey: ['metrics', serviceId, timeRange],
    queryFn: () =>
      api.services.metrics(serviceId!, {
        from: timeRangeToFrom(timeRange),
        to: new Date().toISOString(),
        resolution: 'raw',
      }),
    enabled: serviceId !== null,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data && serviceId) {
      // Pass the window duration so appendMetric trims by time, not by a
      // fixed point count — prevents the chart collapsing to ~10 min when
      // a longer range (15m / 1h / 6h / 24h) is selected.
      setMetricHistory(serviceId, query.data, RANGE_MS[timeRange]);
    }
  }, [query.data, serviceId, setMetricHistory, timeRange]);

  return { ...query, liveMetrics };
}
