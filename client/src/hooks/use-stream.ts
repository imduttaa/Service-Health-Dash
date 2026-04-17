import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { wsManager } from '../lib/ws-manager';
import { useServicesStore } from '../store/services-store';
import { useAlertsStreamStore } from '../store/alerts-store';
import { useStreamStore } from '../store/stream-store';

/**
 * Bootstraps the WebSocket connection and wires stream events into Zustand
 * stores + TanStack Query cache.
 *
 * Call once at the app root — it is safe to re-mount because wsManager is
 * a singleton and connect() is idempotent.
 *
 * Stream event routing:
 *  metric_update  → ServicesStore.appendMetric (live chart buffer)
 *  status_change  → ServicesStore.updateStatus + invalidates /api/services
 *  alert_created  → AlertsStreamStore.addLiveAlert + invalidates /api/alerts
 */
export function useStream(): void {
  const queryClient = useQueryClient();
  const appendMetric = useServicesStore((s) => s.appendMetric);
  const updateStatus = useServicesStore((s) => s.updateStatus);
  const addLiveAlert = useAlertsStreamStore((s) => s.addLiveAlert);
  const clearHighlight = useAlertsStreamStore((s) => s.clearHighlight);
  const setStreamStatus = useStreamStore((s) => s.setStatus);

  // Ref-based batch buffer so rapid metric_updates don't cause 20 setState
  // calls per tick (one per service) — we flush on the next animation frame.
  const pendingMetrics = useRef<Array<{ id: string; point: Parameters<typeof appendMetric>[1] }>>([]);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const flushMetrics = () => {
      const batch = pendingMetrics.current.splice(0);
      for (const { id, point } of batch) {
        appendMetric(id, point);
      }
    };

    const unsubEvent = wsManager.onEvent((event) => {
      switch (event.type) {
        case 'metric_update':
          pendingMetrics.current.push({ id: event.serviceId, point: event.data });
          // Coalesce multiple updates into one render frame
          cancelAnimationFrame(rafId.current);
          rafId.current = requestAnimationFrame(flushMetrics);
          break;

        case 'status_change':
          updateStatus(event.serviceId, event.to);
          // Also refresh the REST list so summaries stay consistent
          void queryClient.invalidateQueries({ queryKey: ['services'] });
          void queryClient.invalidateQueries({ queryKey: ['summary'] });
          break;

        case 'alert_created':
          addLiveAlert(event.data);
          // Remove highlight after 3 seconds
          setTimeout(() => clearHighlight(event.data.id), 3000);
          // Invalidate paginated alerts so the next page fetch reflects the new row
          void queryClient.invalidateQueries({ queryKey: ['alerts'] });
          void queryClient.invalidateQueries({ queryKey: ['summary'] });
          break;
      }
    });

    const unsubStatus = wsManager.onStatusChange(setStreamStatus);

    wsManager.connect();

    return () => {
      unsubEvent();
      unsubStatus();
      cancelAnimationFrame(rafId.current);
    };
  }, [appendMetric, updateStatus, addLiveAlert, clearHighlight, setStreamStatus, queryClient]);
}
