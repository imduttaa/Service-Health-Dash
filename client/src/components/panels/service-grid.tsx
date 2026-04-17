import { useMemo, useState } from 'react';
import { ServiceStatus } from '@healthdash/shared';
import { useServicesStore } from '../../store/services-store';
import { useServices } from '../../hooks/use-services';
import { ServiceCard } from './service-card';
import { ServiceCardSkeleton } from '../ui/skeleton';
import { PanelWrapper } from '../layout/panel-wrapper';
import { cn } from '../../lib/cn';
import { Search } from 'lucide-react';

type StatusFilter = 'all' | ServiceStatus;

const FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Down', value: 'down' },
];

const filterButtonStyle = (active: boolean) =>
  cn(
    'px-3 py-1 text-xs rounded-full font-medium transition-colors',
    active
      ? 'bg-blue-600 text-white'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
  );

interface ServiceGridProps {
  selectedServiceId: string | null;
  onSelectService: (id: string | null) => void;
}

/**
 * Panel 1 — Service Health Grid.
 *
 * Performance notes:
 *  - ServiceCard is memoised and only re-renders on prop change
 *  - Latest metric per service is read from the Zustand store with a selector
 *    that returns a derived value — preventing full map re-renders
 *  - Search is client-side (20 services is well within what's sensible)
 */
export function ServiceGrid({ selectedServiceId, onSelectService }: ServiceGridProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  // Use the separate hook to trigger initial REST fetch
  const { isLoading, error } = useServices();

  const services = useServicesStore((s) => [...s.services.values()]);
  const metricsMap = useServicesStore((s) => s.metrics);

  const filtered = useMemo(() => {
    return services.filter((svc) => {
      if (statusFilter !== 'all' && svc.status !== statusFilter) return false;
      if (search && !svc.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [services, statusFilter, search]);

  const headerRight = (
    <div className="flex items-center gap-2">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setStatusFilter(opt.value)}
          className={filterButtonStyle(statusFilter === opt.value)}
          aria-pressed={statusFilter === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <PanelWrapper title="Service Health" panelName="ServiceGrid" headerRight={headerRight}>
      <div>
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Filter services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full pl-8 pr-3 py-1.5 text-sm rounded-md',
                'border border-gray-200 dark:border-gray-700',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500',
              )}
              aria-label="Search services"
            />
          </div>
        </div>

        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: '420px' }}>
        {error && (
          <div className="flex items-center justify-center h-32 text-sm text-red-500">
            Failed to load services: {(error as Error)?.message ?? 'Unknown error'}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <ServiceCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
            <span className="text-2xl">🔍</span>
            <span className="text-sm">No services match this filter</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-1">
            {filtered.map((svc) => {
              const metrics = metricsMap.get(svc.id) ?? [];
              const latest = metrics.length > 0 ? metrics[metrics.length - 1] : undefined;
              return (
                <ServiceCard
                  key={svc.id}
                  service={svc}
                  latestMetric={latest}
                  isSelected={svc.id === selectedServiceId}
                  onClick={() =>
                    onSelectService(svc.id === selectedServiceId ? null : svc.id)
                  }
                />
              );
            })}
          </div>
        )}
        </div>
      </div>
    </PanelWrapper>
  );
}
