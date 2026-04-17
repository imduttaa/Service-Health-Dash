import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertSeverity, AlertStatus } from '@healthdash/shared';

/**
 * URL state schema — every piece of shareable UI state lives here.
 *
 * Why URL state instead of only Zustand?
 *  - Sharing/bookmarking a filtered view works instantly
 *  - Browser back/forward navigation feels natural
 *  - No hydration mismatch — state is already in the URL on first render
 *
 * Why a custom hook instead of a library?
 *  - react-router-dom's useSearchParams is sufficient
 *  - Keeps the dependency tree lean
 *  - Full type safety without extra packages
 */

export interface UrlState {
  selectedService: string | null;
  timeRange: '5m' | '15m' | '1h' | '6h' | '24h';
  alertStatus: AlertStatus | null;
  alertSeverity: AlertSeverity | null;
  alertService: string | null;
  alertSearch: string;
  alertPage: number;
}

const DEFAULT: UrlState = {
  selectedService: null,
  timeRange: '15m',
  alertStatus: null,
  alertSeverity: null,
  alertService: null,
  alertSearch: '',
  alertPage: 1,
};

const TIME_RANGES = ['5m', '15m', '1h', '6h', '24h'] as const;
const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;

function parseTimeRange(v: string | null): UrlState['timeRange'] {
  return TIME_RANGES.includes(v as UrlState['timeRange'])
    ? (v as UrlState['timeRange'])
    : DEFAULT.timeRange;
}

export function useUrlState() {
  const [params, setParams] = useSearchParams();

  const state: UrlState = {
    selectedService: params.get('service'),
    timeRange: parseTimeRange(params.get('range')),
    alertStatus: ALERT_STATUSES.includes(params.get('status') as AlertStatus)
      ? (params.get('status') as AlertStatus)
      : null,
    alertSeverity: ALERT_SEVERITIES.includes(params.get('severity') as AlertSeverity)
      ? (params.get('severity') as AlertSeverity)
      : null,
    alertService: params.get('alertService'),
    alertSearch: params.get('search') ?? '',
    alertPage: Math.max(1, parseInt(params.get('page') ?? '1', 10)),
  };

  const update = useCallback(
    (patch: Partial<UrlState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const merged = { ...state, ...patch };

          // Only set non-default values to keep URLs clean
          if (merged.selectedService) next.set('service', merged.selectedService);
          else next.delete('service');

          if (merged.timeRange !== DEFAULT.timeRange) next.set('range', merged.timeRange);
          else next.delete('range');

          if (merged.alertStatus) next.set('status', merged.alertStatus);
          else next.delete('status');

          if (merged.alertSeverity) next.set('severity', merged.alertSeverity);
          else next.delete('severity');

          if (merged.alertService) next.set('alertService', merged.alertService);
          else next.delete('alertService');

          if (merged.alertSearch) next.set('search', merged.alertSearch);
          else next.delete('search');

          if (merged.alertPage > 1) next.set('page', String(merged.alertPage));
          else next.delete('page');

          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams, params.toString()],
  );

  return { state, update };
}

/** Converts a time-range label to a `from` ISO string relative to now. */
export function timeRangeToFrom(range: UrlState['timeRange']): string {
  const ms: Record<UrlState['timeRange'], number> = {
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '24h': 24 * 60 * 60_000,
  };
  return new Date(Date.now() - ms[range]).toISOString();
}
