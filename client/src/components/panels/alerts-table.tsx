import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertSeverity, AlertStatus } from '@healthdash/shared';
import { api } from '../../lib/api';
import { useAlertsStreamStore } from '../../store/alerts-store';
import { useServicesStore } from '../../store/services-store';
import { SeverityBadge, AlertStatusBadge } from '../ui/badge';
import { PanelWrapper } from '../layout/panel-wrapper';
import { Button } from '../ui/button';
import { TableRowSkeleton } from '../ui/skeleton';
import { formatTimestamp, formatRelative } from '../../lib/format';
import { cn } from '../../lib/cn';
import { ChevronLeft, ChevronRight, Search, Filter, Download } from 'lucide-react';
import { UrlState } from '../../hooks/use-url-state';
import { useFlag } from '../../context/flag-context';
import { exportAlertsAsCsv } from '../../lib/export';

const PAGE_SIZE = 25;

interface AlertsTableProps {
  urlState: UrlState;
  onUrlUpdate: (patch: Partial<UrlState>) => void;
}

/**
 * Panel 3 — Alerts Table.
 *
 * Pagination strategy — server-side at 25 rows/page:
 *  We choose server-side pagination over virtual scrolling because:
 *  a) We never render more than 25 DOM rows — already optimal
 *  b) Filtering, sorting happen on the server where 10k rows is trivial
 *  c) Virtual scrolling adds complexity and requires fixed row heights
 *  The trade-off: page navigation requires a network round-trip, but with
 *  TanStack Query prefetching the next page this is imperceptible.
 *
 * Optimistic updates:
 *  When acknowledging or resolving an alert we immediately update the
 *  TanStack Query cache to reflect the new status, then reconcile on
 *  the server response.
 */
export function AlertsTable({ urlState, onUrlUpdate }: AlertsTableProps) {
  const queryClient = useQueryClient();
  const alertActionsEnabled = useFlag('enable-alert-actions');
  const [isExporting, setIsExporting] = useState(false);

  const { alertStatus, alertSeverity, alertService, alertSearch, alertPage } = urlState;

  // Live alerts from WebSocket stream (newest at top)
  const liveAlerts = useAlertsStreamStore((s) => s.liveAlerts);
  const newAlertIds = useAlertsStreamStore((s) => s.newAlertIds);
  const updateLiveAlert = useAlertsStreamStore((s) => s.updateLiveAlert);

  // REST-paginated alerts
  const queryKey = ['alerts', alertStatus, alertSeverity, alertService, alertSearch, alertPage];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      api.alerts.list({
        status: alertStatus ?? undefined,
        severity: alertSeverity ?? undefined,
        serviceId: alertService ?? undefined,
        search: alertSearch || undefined,
        page: alertPage,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  // Mutation: update alert status
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'acknowledged' | 'resolved' }) =>
      api.alerts.update(id, status),
    // Optimistic update
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status,
                  acknowledgedAt: status === 'acknowledged' ? new Date().toISOString() : a.acknowledgedAt,
                  resolvedAt: status === 'resolved' ? new Date().toISOString() : a.resolvedAt,
                }
              : a,
          ),
        };
      });
      return { prev };
    },
    onSuccess: (updated) => {
      // Also update the Zustand live-alerts store so alerts that arrived via
      // WebSocket (not yet in TQ REST data) reflect the new status immediately.
      updateLiveAlert(updated);
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  // Collect all services for the service filter dropdown
  const allServices = useServicesStore((s) => [...s.services.values()]);

  // De-duplicate live alerts that are also on the current page
  const pageIds = useMemo(() => new Set(data?.data.map((a) => a.id) ?? []), [data]);
  const uniqueLiveAlerts = useMemo(
    () =>
      alertPage === 1
        ? liveAlerts.filter(
            (a) =>
              !pageIds.has(a.id) &&
              (!alertStatus || a.status === alertStatus) &&
              (!alertSeverity || a.severity === alertSeverity) &&
              (!alertService || a.serviceId === alertService),
          )
        : [],
    [liveAlerts, pageIds, alertPage, alertStatus, alertSeverity, alertService],
  );

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const result = await api.alerts.list({
        status: alertStatus ?? undefined,
        severity: alertSeverity ?? undefined,
        serviceId: alertService ?? undefined,
        search: alertSearch || undefined,
        page: 1,
        pageSize: 10_000,
      });
      const date = new Date().toISOString().slice(0, 10);
      exportAlertsAsCsv(result.data, `alerts-${date}.csv`);
    } catch (e) {
      console.error('CSV export failed:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (value: string) => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => onUrlUpdate({ alertSearch: value, alertPage: 1 }), 300);
  };

  const filterHeader = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
        <input
          type="search"
          defaultValue={alertSearch}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search alerts…"
          className={cn(
            'pl-7 pr-3 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
            'placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40',
          )}
          aria-label="Search alert messages"
        />
      </div>

      <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden />

      {/* Severity filter */}
      <FilterSelect
        value={alertSeverity ?? ''}
        onChange={(v) => onUrlUpdate({ alertSeverity: (v as AlertSeverity) || null, alertPage: 1 })}
        options={[
          { label: 'All severity', value: '' },
          { label: 'Critical', value: 'critical' },
          { label: 'Warning', value: 'warning' },
          { label: 'Info', value: 'info' },
        ]}
        aria-label="Filter by severity"
      />

      {/* Status filter */}
      <FilterSelect
        value={alertStatus ?? ''}
        onChange={(v) => onUrlUpdate({ alertStatus: (v as AlertStatus) || null, alertPage: 1 })}
        options={[
          { label: 'All status', value: '' },
          { label: 'Open', value: 'open' },
          { label: 'Acknowledged', value: 'acknowledged' },
          { label: 'Resolved', value: 'resolved' },
        ]}
        aria-label="Filter by status"
      />

      {/* Service filter */}
      <FilterSelect
        value={alertService ?? ''}
        onChange={(v) => onUrlUpdate({ alertService: v || null, alertPage: 1 })}
        options={[
          { label: 'All services', value: '' },
          ...allServices.map((s) => ({ label: s.name, value: s.id })),
        ]}
        aria-label="Filter by service"
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={handleExportCsv}
        loading={isExporting}
        disabled={isExporting}
        title="Download alerts as CSV"
      >
        <Download className="h-3.5 w-3.5" />
        <span>CSV</span>
      </Button>
    </div>
  );

  const allRows: Alert[] = [...uniqueLiveAlerts, ...(data?.data ?? [])];

  return (
    <PanelWrapper title="Alerts" panelName="AlertsTable" headerRight={filterHeader}>
      <div className="overflow-auto">
        {/* Table header */}
        <table className="w-full text-sm" role="grid" aria-label="Alerts table">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              {['Severity', 'Service', 'Message', 'Triggered', 'Status', ...(alertActionsEnabled ? ['Actions'] : [])].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && allRows.length === 0
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={alertActionsEnabled ? 6 : 5} className="p-0">
                      <TableRowSkeleton />
                    </td>
                  </tr>
                ))
              : null}

            {error && (
              <tr>
                <td
                  colSpan={alertActionsEnabled ? 6 : 5}
                  className="px-4 py-8 text-center text-sm text-red-500"
                >
                  Failed to load alerts
                </td>
              </tr>
            )}

            {!isLoading && !error && allRows.length === 0 && (
              <tr>
                <td
                  colSpan={alertActionsEnabled ? 6 : 5}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  <div className="text-2xl mb-2">🎉</div>
                  <div className="text-sm">No alerts match these filters</div>
                </td>
              </tr>
            )}

            {allRows.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                isNew={newAlertIds.has(alert.id)}
                actionsEnabled={alertActionsEnabled}
                onAcknowledge={() => mutation.mutate({ id: alert.id, status: 'acknowledged' })}
                onResolve={() => mutation.mutate({ id: alert.id, status: 'resolved' })}
                isUpdating={mutation.isPending && mutation.variables?.id === alert.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {data.total} alerts · page {data.page} of {data.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={alertPage <= 1}
              onClick={() => onUrlUpdate({ alertPage: alertPage - 1 })}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={alertPage >= data.totalPages}
              onClick={() => onUrlUpdate({ alertPage: alertPage + 1 })}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PanelWrapper>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  isNew,
  actionsEnabled,
  onAcknowledge,
  onResolve,
  isUpdating,
}: {
  alert: Alert;
  isNew: boolean;
  actionsEnabled: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  isUpdating: boolean;
}) {
  return (
    <tr
      className={cn(
        'border-b border-gray-50 dark:border-gray-800/60',
        'hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors',
        isNew && 'animate-highlight-new',
      )}
      aria-live={isNew ? 'polite' : undefined}
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <SeverityBadge severity={alert.severity} />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300 font-medium">
        {alert.serviceName}
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate">
        {alert.message}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-500">
        <span title={formatTimestamp(alert.triggeredAt)}>{formatRelative(alert.triggeredAt)}</span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <AlertStatusBadge status={alert.status} />
      </td>
      {actionsEnabled && (
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {alert.status === 'open' && (
              <Button
                variant="warning"
                size="sm"
                onClick={onAcknowledge}
                loading={isUpdating}
                aria-label={`Acknowledge alert: ${alert.message}`}
              >
                Ack
              </Button>
            )}
            {alert.status !== 'resolved' && (
              <Button
                variant="success"
                size="sm"
                onClick={onResolve}
                loading={isUpdating}
                aria-label={`Resolve alert: ${alert.message}`}
              >
                Resolve
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
  'aria-label'?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn(
        'px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700',
        'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200',
        'focus:outline-none focus:ring-1 focus:ring-blue-500',
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
