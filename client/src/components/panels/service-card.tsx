import { memo } from 'react';
import { Service, MetricDataPoint } from '@healthdash/shared';
import { cn } from '../../lib/cn';
import { StatusDot } from '../ui/status-dot';
import { StatusBadge } from '../ui/badge';
import { formatMs, formatPercent, formatRate } from '../../lib/format';

interface ServiceCardProps {
  service: Service;
  latestMetric?: MetricDataPoint;
  isSelected: boolean;
  onClick: () => void;
}

const statusBorderMap = {
  healthy: 'border-green-200 dark:border-green-900/50',
  degraded: 'border-amber-300 dark:border-amber-800/50',
  down: 'border-red-300 dark:border-red-800/50',
};

const groupColors: Record<string, string> = {
  core: 'text-violet-600 dark:text-violet-400',
  payments: 'text-emerald-600 dark:text-emerald-400',
  infra: 'text-sky-600 dark:text-sky-400',
  analytics: 'text-orange-600 dark:text-orange-400',
};

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center bg-gray-50 dark:bg-gray-800 rounded-md px-2 py-1.5">
      <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none">
        {label}
      </span>
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-0.5 tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * Memoised service card — only re-renders when service status or latest metric
 * changes.  Since we render 20 of these simultaneously, preventing needless
 * re-renders matters.
 */
export const ServiceCard = memo(function ServiceCard({
  service,
  latestMetric,
  isSelected,
  onClick,
}: ServiceCardProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`${service.name} — ${service.status}`}
      className={cn(
        'w-full text-left rounded-lg border-2 p-3 transition-all cursor-pointer',
        'hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500',
        statusBorderMap[service.status],
        isSelected
          ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-50/60 dark:bg-blue-950/30'
          : 'bg-white dark:bg-gray-900',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={service.status} />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {service.name}
          </span>
        </div>
        <StatusBadge status={service.status} />
      </div>

      {/* Group tag */}
      <div
        className={cn(
          'text-[10px] uppercase font-semibold tracking-widest mb-2',
          groupColors[service.group] ?? 'text-gray-400',
        )}
      >
        {service.group}
      </div>

      {/* Metric chips */}
      {latestMetric ? (
        <div className="grid grid-cols-3 gap-1.5">
          <MetricChip label="p99" value={formatMs(latestMetric.responseTime.p99)} />
          <MetricChip label="err%" value={formatPercent(latestMetric.errorRate)} />
          <MetricChip label="req/s" value={formatRate(latestMetric.requestRate)} />
        </div>
      ) : (
        <div className="h-10 flex items-center justify-center text-xs text-gray-400">
          awaiting data…
        </div>
      )}

      {/* Tier badge */}
      <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 text-right">
        {service.metadata.tier}
      </div>
    </button>
  );
});
