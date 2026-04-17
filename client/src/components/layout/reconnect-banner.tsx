import { useStreamStore } from '../../store/stream-store';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

/**
 * Sticky banner shown when the WebSocket connection is degraded.
 * Does not render at all when connected — zero DOM overhead in the happy path.
 */
export function ReconnectBanner() {
  const status = useStreamStore((s) => s.status);

  if (status === 'connected') return null;

  const config = {
    connecting: {
      bg: 'bg-blue-500',
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      text: 'Connecting to live stream…',
    },
    reconnecting: {
      bg: 'bg-amber-500',
      icon: <WifiOff className="h-4 w-4" />,
      text: 'Stream disconnected — reconnecting…',
    },
    disconnected: {
      bg: 'bg-red-600',
      icon: <WifiOff className="h-4 w-4" />,
      text: 'Live stream unavailable — data may be stale',
    },
  } as const;

  const c = config[status];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-center gap-2 px-4 py-2 text-sm text-white font-medium ${c.bg} animate-slide-in-top`}
    >
      {c.icon}
      <span>{c.text}</span>
      {status !== 'disconnected' && (
        <span className="ml-auto flex items-center gap-1 text-xs opacity-80">
          <Wifi className="h-3.5 w-3.5" />
          Auto-reconnecting
        </span>
      )}
    </div>
  );
}
