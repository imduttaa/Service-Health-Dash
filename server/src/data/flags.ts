import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FeatureFlags } from '@healthdash/shared';

/**
 * flags.json is the single source of truth for feature flag defaults.
 *
 * Resolution order (highest priority wins):
 *   1. Runtime PATCH /api/flags  — in-memory, AND written back to flags.json
 *   2. FEATURE_* env vars        — applied at startup, useful for CI/CD overrides
 *   3. flags.json                — the editable config file
 *
 * Because PATCH writes back to flags.json, changes made through the in-app
 * developer panel or via curl survive a server restart automatically.
 * There are no hardcoded defaults in TypeScript — the JSON file owns that.
 */

export const CONFIG_PATH = join(process.cwd(), 'flags.json');

/** Load flags.json. Returns an empty object if the file is missing or corrupt. */
function loadFromFile(): FeatureFlags {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as FeatureFlags;
  } catch {
    console.warn('[flags] flags.json not found or invalid — using built-in fallback');
    // Minimal fallback so the server still starts if the file is missing
    return {
      'enable-metrics-panel': true,
      'enable-dependency-map': true,
      'enable-alert-actions': true,
    };
  }
}

/**
 * Applies FEATURE_<KEY>=true/false env vars on top of the base object.
 * Env vars are useful for per-environment overrides in CI/CD without
 * touching the committed flags.json.
 *
 *   enable-metrics-panel  →  FEATURE_ENABLE_METRICS_PANEL=false
 */
function applyEnvOverrides(base: FeatureFlags): FeatureFlags {
  const result = { ...base };
  for (const key of Object.keys(result) as (keyof FeatureFlags)[]) {
    const envKey = `FEATURE_${key.toUpperCase().replace(/-/g, '_')}`;
    const val = process.env[envKey];
    if (val !== undefined) {
      result[key] = val === 'true' || val === '1';
    }
  }
  return result;
}

/**
 * Writes the current flag state back to flags.json.
 * Called by the PATCH /api/flags route so that any runtime change
 * made through the dev panel or API is automatically persisted.
 */
export function persistFlags(flags: FeatureFlags): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(flags, null, 2) + '\n', 'utf-8');
}

export const defaultFlags: FeatureFlags = applyEnvOverrides(loadFromFile());
