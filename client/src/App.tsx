import { useStream } from './hooks/use-stream';
import { useUrlState } from './hooks/use-url-state';
import { SummaryBar } from './components/panels/summary-bar';
import { ServiceGrid } from './components/panels/service-grid';
import { MetricsPanel } from './components/panels/metrics-panel';
import { AlertsTable } from './components/panels/alerts-table';
import { DependencyMap } from './components/panels/dependency-map';
import { Navbar } from './components/layout/navbar';
import { ReconnectBanner } from './components/layout/reconnect-banner';
import { useFlag } from './context/flag-context';

/**
 * Root application shell.
 *
 * Layout decisions:
 *  - SummaryBar spans full width at the top — always visible, real-time
 *  - ServiceGrid spans full width — need to see all 20+ cards at once
 *  - MetricsPanel + DependencyMap sit side-by-side below the grid
 *  - AlertsTable spans full width at the bottom — widest panel for readable columns
 *
 * useStream() is called once here — it bootstraps the WS connection and
 * wires all stream events into stores.  All children read from stores;
 * none of them manage their own socket connections.
 */
export default function App() {
  useStream();
  const { state, update } = useUrlState();
  const metricsEnabled    = useFlag('enable-metrics-panel');
  const dependencyEnabled = useFlag('enable-dependency-map');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Navbar />
      <ReconnectBanner />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 space-y-4">
        {/* Panel 4 — Summary Bar (top) */}
        <SummaryBar />

        {/* Panel 1 — Service Health Grid */}
        <ServiceGrid
          selectedServiceId={state.selectedService}
          onSelectService={(id) => update({ selectedService: id, alertPage: 1 })}
        />

        {/* Panel 2 + Dependency Map — independently flag-gated.
            Both flags are read here so each panel lives or dies on its own.
            The grid collapses to single-column when only one panel is visible. */}
        {(metricsEnabled || dependencyEnabled) && (
          <div className={`grid grid-cols-1 gap-4${metricsEnabled && dependencyEnabled ? ' xl:grid-cols-2' : ''}`}>
            {metricsEnabled && (
              <MetricsPanel
                serviceId={state.selectedService}
                timeRange={state.timeRange}
                onTimeRangeChange={(r) => update({ timeRange: r })}
              />
            )}
            {dependencyEnabled && <DependencyMap />}
          </div>
        )}

        {/* Panel 3 — Alerts Table */}
        <AlertsTable urlState={state} onUrlUpdate={update} />
      </main>
    </div>
  );
}
