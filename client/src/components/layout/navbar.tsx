import { Activity, Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../../context/theme-context';
import { useStreamStore } from '../../store/stream-store';
import { DevFlagsPanel } from './dev-flags-panel';
import { cn } from '../../lib/cn';

const themeIcons = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

const streamStatusColors = {
  connected: 'bg-green-500',
  connecting: 'bg-blue-500 animate-pulse',
  reconnecting: 'bg-amber-500 animate-pulse',
  disconnected: 'bg-red-500',
};

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const streamStatus = useStreamStore((s) => s.status);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Service Health Dashboard
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Stream status indicator */}
        <div className="flex items-center gap-1.5" title={`Stream: ${streamStatus}`}>
          <span
            className={cn('h-2 w-2 rounded-full', streamStatusColors[streamStatus])}
            aria-label={`Stream ${streamStatus}`}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize hidden sm:block">
            {streamStatus}
          </span>
        </div>

        {/* Feature flags panel */}
        <DevFlagsPanel />

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={`Current theme: ${theme}. Click to change.`}
          title={`Theme: ${theme}`}
        >
          {themeIcons[theme]}
        </button>
      </div>
    </header>
  );
}
