import { cn } from '../../lib/cn';
import { ServiceStatus, AlertSeverity, AlertStatus } from '@healthdash/shared';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Domain-specific badge helpers ─────────────────────────────────────────────

const statusVariant: Record<ServiceStatus, BadgeVariant> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
};

const severityVariant: Record<AlertSeverity, BadgeVariant> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

const alertStatusVariant: Record<AlertStatus, BadgeVariant> = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
};

export const StatusBadge = ({ status }: { status: ServiceStatus }) => (
  <Badge variant={statusVariant[status]}>{status}</Badge>
);

export const SeverityBadge = ({ severity }: { severity: AlertSeverity }) => (
  <Badge variant={severityVariant[severity]}>{severity}</Badge>
);

export const AlertStatusBadge = ({ status }: { status: AlertStatus }) => (
  <Badge variant={alertStatusVariant[status]}>{status}</Badge>
);
