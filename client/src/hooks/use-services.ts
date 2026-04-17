import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useServicesStore } from '../store/services-store';

/**
 * Fetches the service list from REST and seeds the Zustand store.
 * After the initial load, the store is kept up-to-date by the WebSocket
 * stream (status_change events) — we don't need polling.
 */
export function useServices() {
  const setServices = useServicesStore((s) => s.setServices);
  const setError = useServicesStore((s) => s.setError);

  const query = useQuery({
    queryKey: ['services'],
    queryFn: api.services.list,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) setServices(query.data);
  }, [query.data, setServices]);

  useEffect(() => {
    if (query.error) setError((query.error as Error).message);
  }, [query.error, setError]);

  return query;
}
