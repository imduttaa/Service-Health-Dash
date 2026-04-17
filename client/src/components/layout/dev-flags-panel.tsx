import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FeatureFlagKey, FeatureFlags } from '@healthdash/shared';
import { api } from '../../lib/api';
import { useFlags } from '../../context/flag-context';
import { cn } from '../../lib/cn';

/**
 * In-app developer settings panel for toggling feature flags at runtime.
 *
 * Each toggle immediately PATCHes /api/flags and writes the server response
 * directly into the TanStack Query cache. Because FeatureFlagProvider reads
 * from that same cache entry, all useFlag() and <Feature> consumers across
 * the app re-evaluate on the next render — no page reload, no 5-minute wait.
 */

/** 'enable-metrics-panel' → 'Metrics Panel' */
function formatFlagName(key: FeatureFlagKey): string {
  return key
    .replace(/^enable-/, '')
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full',
        'transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600',
      )}
    >
      <span
        className={cn(
          'pointer-events-none mt-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-200 ease-in-out',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function DevFlagsPanel() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const flags = useFlags();
  const queryClient = useQueryClient();

  // Close the panel when the user clicks outside of it
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const mutation = useMutation({
    mutationFn: (overrides: Partial<FeatureFlags>) => api.flags.patch(overrides),
    onSuccess: (updated) => {
      // Write the server-confirmed state directly into the TQ cache.
      // FeatureFlagProvider reads from ['feature-flags'] — all useFlag()
      // consumers across the app see the change on the next render.
      queryClient.setQueryData(['feature-flags'], updated);
    },
  });

  const flagKeys = Object.keys(flags) as FeatureFlagKey[];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Feature flags"
        aria-expanded={open}
        title="Feature flags"
        className={cn(
          'p-1.5 rounded-md transition-colors',
          'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          open && 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
        )}
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Feature flag settings"
          className={cn(
            'absolute right-0 top-full mt-2 w-72 z-50',
            'rounded-xl border border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-900 shadow-xl',
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Feature Flags
            </p>
          </div>

          {/* Flag list */}
          <ul className="p-3 space-y-0.5">
            {flagKeys.map((key) => (
              <li key={key}>
                <label
                  htmlFor={`flag-${key}`}
                  className="flex items-center justify-between gap-3 px-1 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
                    {formatFlagName(key)}
                  </span>
                  <Toggle
                    id={`flag-${key}`}
                    checked={flags[key]}
                    onChange={(v) => mutation.mutate({ [key]: v })}
                    disabled={mutation.isPending}
                  />
                </label>
              </li>
            ))}
          </ul>

          {/* Error state */}
          {mutation.isError && (
            <p className="px-4 pb-3 text-xs text-red-500 dark:text-red-400">
              Failed to update flag — server may be unreachable.
            </p>
          )}

        </div>
      )}
    </div>
  );
}
