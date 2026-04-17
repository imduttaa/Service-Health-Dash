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
      setMetricHistory(serviceId, query.data);
    }
  }, [query.data, serviceId, setMetricHistory]);

  return { ...query, liveMetrics };
}
