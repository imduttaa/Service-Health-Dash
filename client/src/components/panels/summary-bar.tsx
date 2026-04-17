import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { formatMs } from '../../lib/format';
import { Skeleton } from '../ui/skeleton';

function StatCard({
  label,
  value,
  icon,
  color = 'text-gray-700 dark:text-gray-200',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className={`shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 self-center shrink-0" />;
}

/**
 * Panel 4 — Dashboard Summary Bar.
 * Uses TanStack Query with a 10-second refetch interval for steady polling.
 * The WebSocket stream also invalidates this query on status_change and
 * alert_created events, so the counts update instantly when something changes.
 */
export function SummaryBar() {
  const { data, isLoading } = useQuery({
    queryKey: ['summary'],
    queryFn: api.dashboard.summary,
    refetchInterval: 10_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-28 rounded-lg" />
        ))}
      </div>
    );
  }

  const healthyPct =
    data.totalServices > 0
      ? Math.round((data.healthyCount / data.totalServices) * 100)
      : 0;

  const totalAlerts =
    data.activeAlerts.critical + data.activeAlerts.warning + data.activeAlerts.info;

  return (
    <div
      className="flex items-center flex-wrap gap-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
      role="region"
      aria-label="Dashboard summary"
    >
      <StatCard
        label="Total Services"
        value={data.totalServices}
        icon={<Activity className="h-5 w-5" />}
      />
      <Divider />
      <StatCard
        label="Healthy"
        value={`${data.healthyCount} (${healthyPct}%)`}
        icon={<CheckCircle className="h-5 w-5" />}
        color="text-green-600 dark:text-green-400"
      />
      <Divider />
      <StatCard
        label="Degraded / Down"
        value={`${data.degradedCount} / ${data.downCount}`}
        icon={<XCircle className="h-5 w-5" />}
        color={
          data.downCount > 0
            ? 'text-red-600 dark:text-red-400'
            : data.degradedCount > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-700 dark:text-gray-200'
        }
      />
      <Divider />
      <StatCard
        label="Active Alerts"
        value={
          <span className="flex items-center gap-2">
            {totalAlerts}
            {data.activeAlerts.critical > 0 && (
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                {data.activeAlerts.critical}C
              </span>
            )}
            {data.activeAlerts.warning > 0 && (
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {data.activeAlerts.warning}W
              </span>
            )}
          </span>
        }
        icon={<AlertTriangle className="h-5 w-5" />}
        color={
          data.activeAlerts.critical > 0
            ? 'text-red-600 dark:text-red-400'
            : totalAlerts > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-700 dark:text-gray-200'
        }
      />
      <Divider />
      <StatCard
        label="Avg Response (p99)"
        value={formatMs(data.avgResponseTime)}
        icon={<Clock className="h-5 w-5" />}
        color={
          data.avgResponseTime > 3000
            ? 'text-red-600 dark:text-red-400'
            : data.avgResponseTime > 1500
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-700 dark:text-gray-200'
        }
      />
    </div>
  );
}
