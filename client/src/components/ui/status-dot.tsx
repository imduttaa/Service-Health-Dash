import { ServiceStatus } from '@healthdash/shared';
import { cn } from '../../lib/cn';

const colorMap: Record<ServiceStatus, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
};

const pulseMap: Record<ServiceStatus, string> = {
  healthy: '',
  degraded: 'animate-pulse',
  down: 'animate-pulse',
};

interface StatusDotProps {
  status: ServiceStatus;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'h-2 w-2', md: 'h-2.5 w-2.5', lg: 'h-3 w-3' };

export function StatusDot({ status, size = 'md' }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        sizes[size],
        colorMap[status],
        pulseMap[status],
      )}
      aria-label={status}
      role="img"
    />
  );
}
