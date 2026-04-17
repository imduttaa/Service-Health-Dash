import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FeatureFlags, FeatureFlagKey } from '@healthdash/shared';
import { api } from '../lib/api';

/**
 * Feature flag architecture:
 *
 *  1. Flags are fetched once at app startup from GET /api/flags.
 *  2. The entire flag map is stored in a React context — no prop drilling.
 *  3. Components consume flags via `useFlag(key)` — a single hook call.
 *  4. The <Feature> component provides a declarative gate for rendering.
 *
 * This pattern scales to 20+ flags because:
 *  - There are zero scattered `if` checks in component code
 *  - Adding a new flag only requires one FeatureFlagKey type addition
 *  - Flag evaluation logic lives exclusively in this file
 *  - A/B variant support, rollout percentages, or targeting rules can be
 *    added here without touching consuming components
 */

const DEFAULT_FLAGS: FeatureFlags = {
  'enable-metrics-panel': true,
  'enable-dependency-map': false,
  'enable-alert-actions': true,
};

interface FlagContextValue {
  flags: FeatureFlags;
  isLoading: boolean;
}

const FlagContext = createContext<FlagContextValue>({
  flags: DEFAULT_FLAGS,
  isLoading: false,
});

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: api.flags.getAll,
    staleTime: 5 * 60 * 1000, // re-fetch every 5 min
    // Fall back to defaults if the flags endpoint fails
    placeholderData: DEFAULT_FLAGS,
  });

  return (
    <FlagContext.Provider value={{ flags: flags ?? DEFAULT_FLAGS, isLoading }}>
      {children}
    </FlagContext.Provider>
  );
}

/** Returns true if the given feature flag is enabled. */
export function useFlag(key: FeatureFlagKey): boolean {
  const { flags } = useContext(FlagContext);
  return flags[key] ?? false;
}

/** Returns the full flags map — use this when you need all values at once. */
export function useFlags(): FeatureFlags {
  return useContext(FlagContext).flags;
}

/** Declarative feature gate — renders children only when flag is on. */
export function Feature({
  flag,
  children,
  fallback = null,
}: {
  flag: FeatureFlagKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const enabled = useFlag(flag);
  return <>{enabled ? children : fallback}</>;
}
