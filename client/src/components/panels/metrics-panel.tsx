import { useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useServicesStore } from '../../store/services-store';
import { useMetrics } from '../../hooks/use-metrics';
import { PanelWrapper } from '../layout/panel-wrapper';
import { ChartSkeleton } from '../ui/skeleton';
import { formatMs, formatPercent, formatRate, formatTimeLabel } from '../../lib/format';
import { UrlState } from '../../hooks/use-url-state';
import { cn } from '../../lib/cn';
import { exportChartsAsPng } from '../../lib/export';
import { Download } from 'lucide-react';
import { Button } from '../ui/button';

type TimeRange = UrlState['timeRange'];
const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
];

// Down-sample to avoid sending 10k points to SVG paths
function downsample<T>(arr: T[], targetPoints = 120): T[] {
  if (arr.length <= targetPoints) return arr;
  const step = Math.ceil(arr.length / targetPoints);
  return arr.filter((_, i) => i % step === 0);
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-700 dark:text-gray-300">{p.name}:</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface MetricChartProps {
  data: Array<Record<string, number | string>>;
  lines: Array<{ key: string; label: string; color: string }>;
  yFormatter: (v: number) => string;
  title: string;
  height?: number;
}

function MetricChart({ data, lines, yFormatter, title, height = 180 }: MetricChartProps) {
  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-gray-100 dark:text-gray-800"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: 'currentColor' }}
            className="text-gray-400"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={yFormatter}
            tick={{ fontSize: 10, fill: 'currentColor' }}
            className="text-gray-400"
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="circle"
            iconSize={8}
          />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              dot={false}
              strokeWidth={1.5}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface MetricsPanelProps {
  serviceId: string | null;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
}

/**
 * Panel 2 — Metrics Time-Series Charts.
 *
 * Data flow:
 *  1. On mount (or serviceId change) → fetch historical data via useMetrics
 *  2. useMetrics seeds the Zustand store buffer with the REST response
 *  3. WebSocket events append new points to the same buffer
 *  4. This component reads directly from the store — no re-fetch on new points
 *
 * Performance:
 *  - isAnimationActive=false on Line prevents jank on frequent appends
 *  - downsample() caps SVG path nodes at 120 per series
 *  - useMemo gates dataset transformation
 */
export function MetricsPanel({ serviceId, timeRange, onTimeRangeChange }: MetricsPanelProps) {
  const chartsRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { isLoading, error } = useMetrics(serviceId, timeRange);
  const rawMetrics = useServicesStore((s) =>
    serviceId ? (s.metrics.get(serviceId) ?? []) : [],
  );
  const services = useServicesStore((s) => s.services);
  const serviceName = serviceId ? (services.get(serviceId)?.name ?? serviceId) : null;

  const chartData = useMemo(() => {
    const sampled = downsample(rawMetrics, 120);
    return sampled.map((m) => ({
      time: formatTimeLabel(m.timestamp),
      p50: m.responseTime.p50,
      p95: m.responseTime.p95,
      p99: m.responseTime.p99,
      errorRate: m.errorRate,
      requestRate: m.requestRate,
    }));
  }, [rawMetrics]);

  const handleExportPng = async () => {
    if (!chartsRef.current) return;
    setIsExporting(true);
    try {
      const name = serviceName ?? 'metrics';
      const date = new Date().toISOString().slice(0, 10);
      await exportChartsAsPng(chartsRef.current, `${name}-${date}.png`);
    } finally {
      setIsExporting(false);
    }
  };

  const headerRight = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => onTimeRangeChange(r.value)}
            className={cn(
              'px-2 py-0.5 text-xs rounded font-medium transition-colors',
              timeRange === r.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
            aria-pressed={timeRange === r.value}
            aria-label={`Last ${r.label}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {serviceId && chartData.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportPng}
          loading={isExporting}
          disabled={isExporting}
          title="Download charts as PNG"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <PanelWrapper
      title={serviceName ? `Metrics — ${serviceName}` : 'Metrics'}
      panelName="MetricsPanel"
      headerRight={headerRight}
    >
      {!serviceId ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
          <span className="text-3xl">📈</span>
          <span className="text-sm">Select a service to view metrics</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full text-sm text-red-500">
          Failed to load metrics
        </div>
      ) : isLoading ? (
        <div className="space-y-1 p-2">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : (
        <div ref={chartsRef} className="overflow-y-auto" style={{ maxHeight: '540px' }}>
          <MetricChart
            title="Response Time"
            data={chartData}
            lines={[
              { key: 'p50', label: 'p50', color: '#22c55e' },
              { key: 'p95', label: 'p95', color: '#f59e0b' },
              { key: 'p99', label: 'p99', color: '#ef4444' },
            ]}
            yFormatter={formatMs}
          />
          <MetricChart
            title="Error Rate"
            data={chartData}
            lines={[{ key: 'errorRate', label: 'Error %', color: '#ef4444' }]}
            yFormatter={formatPercent}
          />
          <MetricChart
            title="Request Rate"
            data={chartData}
            lines={[{ key: 'requestRate', label: 'req/s', color: '#3b82f6' }]}
            yFormatter={formatRate}
          />
        </div>
      )}
    </PanelWrapper>
  );
}
