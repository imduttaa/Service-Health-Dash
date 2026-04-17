import { format, formatDistanceToNow } from 'date-fns';

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatRate(rps: number): string {
  if (rps >= 1000) return `${(rps / 1000).toFixed(1)}k/s`;
  return `${rps.toFixed(1)}/s`;
}

export function formatTimestamp(iso: string): string {
  return format(new Date(iso), 'MMM d, HH:mm:ss');
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function formatTimeLabel(iso: string): string {
  return format(new Date(iso), 'HH:mm:ss');
}
