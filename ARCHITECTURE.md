# Architecture Document — Service Health Dashboard

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BFF Server (Fastify)                         │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐  │
│  │ SimEngine    │──▶│ WebSocketBroad-  │   │ REST Routes       │  │
│  │ (3s interval)│   │ caster (ws.Set)  │   │ /api/services     │  │
│  └──────────────┘   └────────┬─────────┘   │ /api/alerts       │  │
│         │                    │             │ /api/dashboard    │  │
│  ┌──────┴──────────────┐     │             │ /api/flags        │  │
│  │ In-Memory Stores    │     │             └───────────────────┘  │
│  │ services: Map       │     │                                     │
│  │ metricHistory: Map  │     │                                     │
│  │ alerts: Alert[]     │     │                                     │
│  └─────────────────────┘     │                                     │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ WebSocket
              ┌────────────────┼──────────────────────┐
              │ ws://...       │ /api/stream           │
              │                ▼                       │
┌─────────────────────────────────────────────────────────────────────┐
│                     React Client                                    │
│                                                                     │
│  WsManager (singleton) ──────────▶ useStream() hook                │
│       ▲                                   │                        │
│  reconnect logic                   ┌──────┴──────────────┐        │
│  exp. backoff                      │ Zustand Stores       │        │
│                                    │ ServicesStore        │        │
│  TanStack Query                    │  ├ services Map       │        │
│  ├ ['services']                    │  └ metrics Map        │        │
│  ├ ['alerts', ...filters]          │ AlertsStreamStore    │        │
│  ├ ['metrics', id, range]          │  └ liveAlerts[]       │        │
│  ├ ['summary']                     │ StreamStore          │        │
│  └ ['feature-flags']               │  └ connectionStatus  │        │
│                                    └──────────────────────┘        │
│                                           │                        │
│               ┌───────────────────────────┘                        │
│               │                                                     │
│  ┌────────────▼──────────────────────────────────────────────────┐ │
│  │ URL State (useUrlState / useSearchParams)                      │ │
│  │ ?service=&range=&status=&severity=&alertService=&search=&page= │ │
│  └───────────────────────────────────────────────────────────────┘ │
│               │                                                     │
│  ┌────────────▼──────────────────────────────────────────────────┐ │
│  │ UI Panels (each wrapped in PanelErrorBoundary)                 │ │
│  │  ┌───────────────┐  ┌──────────────┐  ┌────────────────────┐ │ │
│  │  │ SummaryBar    │  │ ServiceGrid  │  │ MetricsPanel       │ │ │
│  │  │ (TQ poll 10s) │  │ (Zustand)    │  │ (Zustand + TQ)     │ │ │
│  │  └───────────────┘  └──────────────┘  └────────────────────┘ │ │
│  │  ┌─────────────────────────────────┐  ┌────────────────────────┐│ │
│  │  │ AlertsTable                     │  │ DependencyMap          ││ │
│  │  │ (TQ paginated + Zustand stream) │  │ (Zustand)              ││ │
│  │  └─────────────────────────────────┘  └────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. State Management Strategy

### Why two state layers?

| Layer | Library | Holds |
|-------|---------|-------|
| Server state | TanStack Query v5 | REST responses — services list, paginated alerts, metrics history, summary, flags |
| Client/stream state | Zustand v4 | Live WebSocket data, connection status |

The split follows where the data comes from. **TanStack Query** owns everything that comes over REST: it deduplicates requests across panels, caches responses so the same data isn't fetched twice, and handles background revalidation automatically. The `summary` panel polls every 10 seconds; the services list is considered fresh for 60 seconds and refetches in the background on the next mount after that. Alert mutations (acknowledge / resolve) go through TQ's optimistic update path — the UI reflects the change immediately and rolls back silently if the server returns an error.

**Zustand** owns everything that arrives over the WebSocket. Three stores divide the responsibility:

- `ServicesStore` — holds a `Map<id, Service>` for status and metadata, plus a separate `Map<id, MetricDataPoint[]>` for each service's rolling time-series buffer. Keeping these two maps apart is intentional: service cards only subscribe to the status map, so a metric point arriving every 3 seconds doesn't re-render all 20 cards.
- `AlertsStreamStore` — holds the most recent live alerts from the stream (capped at 100) and a `newAlertIds` set that drives the yellow highlight animation for newly arrived rows.
- `StreamStore` — tracks the WebSocket connection status, which the Navbar and `ReconnectBanner` read to show the user whether the live feed is active.

### How WebSocket events reach components

```
WebSocket message
  → JSON.parse in WsManager.onmessage
  → useStream() dispatches by event.type
      metric_update  → RAF-batched → ServicesStore.appendMetric
      status_change  → ServicesStore.updateStatus + TQ cache invalidation
      alert_created  → AlertsStreamStore.addLiveAlert + TQ invalidation
```

No component subscribes to the WebSocket directly — they all read from a Zustand store. This means any component is testable without a live connection, and multiple components reading the same store entry share a single subscription rather than each registering their own listener.

---

## 3. Real-Time Data Architecture

### High-frequency update handling

The server emits one event per service every 3 seconds — that's 20 services × 1 event = 20 WebSocket messages per tick. Without batching, each message would trigger 20 separate `setState` calls.

**Solution — RAF batching in `useStream`:**
```
WS message → push to pendingMetrics ref (synchronous, no render)
           → cancelAnimationFrame(current) + requestAnimationFrame(flush)
```
All metric_updates within a single animation frame are flushed in one `appendMetric` call per service per frame. This caps metric renders at 60fps regardless of server cadence.

### Chart buffer design

`ServicesStore.metrics` holds a per-service time-series buffer. The trimming strategy depends on whether a service is currently selected:

- **Selected service** — when `useMetrics` seeds the buffer via `setMetricHistory`, it also records the chosen time range as a duration in milliseconds (`metricsWindowMs`). Every subsequent `appendMetric` call trims the buffer by timestamp: points older than `latestTimestamp − windowMs` are dropped. This means the buffer always holds exactly the selected window (5m, 15m, 1h, etc.) and slides forward correctly as live data arrives.
- **Non-selected services** — no window is set, so `appendMetric` falls back to a fixed cap of `MAX_POINTS = 200` (~10 min at 3s cadence) to prevent unbounded memory growth for services nobody is currently viewing.

On service selection:
1. `useMetrics` fetches historical data via REST → `setMetricHistory` seeds the buffer and records `windowMs` in a single atomic store update
2. Subsequent WS events call `appendMetric` → new point appended, points outside the time window dropped

Charts down-sample the buffer to 120 SVG path nodes via `downsample()`. Recharts' `isAnimationActive={false}` prevents FLIP animation on every append.

### Reconnection and state reconciliation

`WsManager` implements exponential backoff: `delay = min(1000 × 2^attempt, 30s) + jitter`, where jitter is a random value between 0 and 500 ms. The cap applies to the base delay only, so the maximum wait is approximately 30.5 s.

On reconnect:
1. A `generation` counter is incremented each time a new socket opens. Every socket-level callback (`onopen`, `onmessage`, `onclose`) captures the generation at creation time and silently exits if it no longer matches — ensuring that events from a stale socket never reach the application. `useStream`'s application-level handlers stay registered throughout; they do not need to re-subscribe.
2. Every `status_change` event invalidates `['services']` and `['summary']` in the TanStack Query cache, triggering a background REST re-fetch. This naturally reconciles any status changes that occurred during the disconnected window, because the first `status_change` to arrive after reconnection will trigger the refresh.
3. The metric buffer just resumes appending — a gap in the time-series is visually obvious but harmless

---

## 4. Performance Decisions

### 20+ service cards

- `ServiceCard` is wrapped in `React.memo` — it only re-renders when its `service` prop or `latestMetric` prop changes
- The `metricsMap` selector in `ServiceGrid` returns the full Map reference; individual card metrics are extracted per-card via `metricsMap.get(svc.id)` — Zustand's selector equality check prevents cascade re-renders
- Service cards are never virtualized (20 items at 80px each = 1,600px DOM — trivial for the browser)

### 1,000+ alert rows

I chose **server-side pagination at 25 rows/page** over virtual scrolling:

**Why not virtual scroll?**
- Virtual scroll requires fixed row heights; alert messages have variable length
- Pagination gives the server a chance to filter at query time — 10k rows never touch the client
- TanStack Query's `placeholderData: prev` keeps the current page visible while the next loads, making pagination feel instant

**Why pagination is correct here:**
- With `pageSize=25`, we render exactly 25 DOM rows — better than virtual scroll's minimum overscan
- Server-side filtering (severity, status, service, search) means the total result set before pagination is already much smaller than 10k for typical use

### Bundle size and code splitting

Recharts is the largest dependency (~400kb minified). In production, the Vite build automatically code-splits dynamic imports. A follow-up improvement would be lazy-loading `MetricsPanel` since it's hidden until a service is selected.

---

## 5. Error Handling Strategy

### `PanelErrorBoundary`

Each of the five panels (ServiceGrid, MetricsPanel, AlertsTable, SummaryBar, and DependencyMap) is wrapped in a class-based `PanelErrorBoundary`. React requires class components for `componentDidCatch`. The boundary:
- Catches synchronous rendering errors, state update errors, and child lifecycle errors — the classic React error boundary scope
- Renders a standalone fallback with a "Try again" button that unmounts and remounts the panel tree
- Logs to console (production: ship to Sentry/Datadog)
- Does **not** catch async errors (network failures) — those are a separate path: WebSocket drops surface via `ReconnectBanner`, and REST failures surface via TanStack Query's `error` state per panel. In practice, stopping the BFF server shows the reconnect banner and per-panel "Failed to load" messages, not the error boundary fallback.

### Network failure states

Panels that fetch data via TanStack Query handle their states independently — there is no global spinner:

- **ServiceGrid** — skeleton cards while loading, inline error message on failure, and a "no results" empty state when the filter produces zero matches
- **MetricsPanel** — three chart skeletons while loading, inline error message on failure, and a "select a service" prompt when nothing is selected
- **AlertsTable** — skeleton rows while loading, inline error message on failure, and an empty-state prompt when no alerts match the active filters
- **SummaryBar** — skeleton stat cards while loading or if the request fails (error and loading share the same fallback UI since a partially populated summary bar would be misleading)
- **DependencyMap** — reads directly from the Zustand services store rather than making its own REST request, so it inherits whatever state the services fetch has already resolved; it has no independent loading or error UI of its own

### WebSocket degradation

`ReconnectBanner` subscribes to `StreamStore.status` and renders:
- Blue banner while connecting
- Amber banner + "auto-reconnecting" label while reconnecting
- Red banner when disconnected permanently

Data already in the Zustand store is still displayed — users see slightly stale metrics rather than a blank dashboard.

---

## 6. Feature Flag System

Three configuration layers are merged at server startup, with higher-priority sources winning:

| Priority | Source | Notes |
|----------|--------|-------|
| 3 (low) | `server/flags.json` | Team defaults; edit and commit |
| 2 | Environment variables | `FEATURE_ENABLE_METRICS_PANEL=false` |
| 1 (high) | Runtime `PATCH /api/flags` | Live, no restart needed |

`persistFlags()` writes runtime changes back to `flags.json`, so they survive a server restart. The three flags currently in use are `enable-metrics-panel`, `enable-dependency-map`, and `enable-alert-actions`.

### In-app developer panel

The gear icon in the Navbar opens `DevFlagsPanel`, which lists all flags as toggle switches. Flipping a toggle fires a `PATCH /api/flags` mutation, and on success the TanStack Query cache entry `['feature-flags']` is updated directly — no page reload required. Flag changes propagate to all `useFlag()` consumers in under 200 ms.

### Client-side evaluation

`FeatureFlagProvider` fetches all flags once on mount (staleTime 5 min) and exposes them via React Context. Components read a flag with a single call:

```ts
const enabled = useFlag('enable-metrics-panel'); // → boolean
```

`FeatureFlagKey` is a TypeScript union type in `shared/src/index.ts`, so passing an unknown key is a compile-time error.

---

### Flags in this implementation

| Flag | Default | Controls |
|------|---------|----------|
| `enable-metrics-panel` | `true` | Show/hide MetricsPanel + time-range selector |
| `enable-dependency-map` | `true` | Show/hide DependencyMap — independently flag-gated, not nested under MetricsPanel |
| `enable-alert-actions` | `true` | Show/hide Ack/Resolve action column in AlertsTable |

---

## 7. Scaling Considerations

### 500 services + 50,000 alerts

The server's in-memory `Map`/`Array` stores would need to be replaced with purpose-built persistence — a time-series database like InfluxDB or TimescaleDB for metrics and a relational database like Postgres for alerts. Broadcasting all 500 service updates to every connected client would also become a bottleneck; per-service WebSocket topic subscriptions (or a message broker like Kafka/Redis Streams for fan-out) would let each client receive only the services it cares about.

On the client, `useServicesStore` already uses a `Map` so lookups are O(1) regardless of service count. The main rendering concern is `ServiceGrid` — at 500 cards, virtual scrolling via `@tanstack/react-virtual` would be needed to keep the DOM lean.

Alerts at 50k rows are already handled correctly by server-side pagination — the client never holds more than 25 rows at a time. The bottleneck would be the filter queries; adding a composite index on `(status, severity, serviceId, triggeredAt)` and replacing the current `String.includes` search with a proper full-text solution (Postgres `tsvector` or Elasticsearch) would keep response times fast.

### Multiple concurrent users

The architecture handles this well today. Each WebSocket connection is isolated and carries its own state, REST endpoints are stateless, and TanStack Query caches are per-client in the browser. The only shared server state is the in-memory alert and metric stores — moving those to a database is the single change that makes the server horizontally scalable.

---

## 8. Trade-offs and What I'd Do Differently

### Corners cut given time constraints

1. **No authentication** — neither the REST endpoints nor the WebSocket stream validate any token. In production both would sit behind JWT middleware before any request reaches a route handler.

2. **No persistence** — all data lives in the `SimulationEngine`'s in-memory maps. Restarting the server wipes every alert and every metric data point. A real system would persist metrics to a time-series database (InfluxDB / TimescaleDB) and alerts to Postgres.

3. **No anomaly detection** — the charts display raw p50/p95/p99 and error-rate values with no highlighting when a metric spikes unusually. A rolling Z-score computed on the server (how many standard deviations from the recent mean) would let the client draw attention to genuine anomalies without the developer having to eyeball the charts.

4. **No tests** — none of the critical paths have automated coverage: the WebSocket reconnection and exponential-backoff logic, the optimistic-update mutation flow, and the URL state round-trip are all tested manually. These would be the first things to cover in a production codebase (Vitest for units, Playwright for E2E).

5. **Client-side chart down-sampling** — `MetricsPanel` caps each chart series at 120 points using a simple stride filter (`every Nth point`). This is fast but can silently drop short spikes that fall between sampled indices. The correct approach is to move down-sampling to the server and use the LTTB (Largest-Triangle-Three-Buckets) algorithm, which preserves visual peaks and valleys rather than discarding them.

6. **Metric deduplication has a theoretical gap** — TanStack Query deduplicates requests by `queryKey`, so two components asking for the same service and time range share one HTTP request. The gap is that a second panel requesting the same service but a *different* time range would fire a separate request, because the keys would differ. This is not a problem today since `MetricsPanel` is the only consumer of the metrics endpoint.

### What I'd prioritize with 2 more days

1. **E2E tests** — Playwright covering the reconnection flow, alert acknowledgement with optimistic rollback, and URL state restoration on page reload.
2. **Server persistence** — swap the in-memory stores for Postgres (alerts) and a time-series DB (metrics), so data survives restarts and can be queried efficiently at scale.
3. **Anomaly detection** — rolling Z-score computed per metric on the server tick, returned as an `anomaly: true` flag on `MetricDataPoint`, and rendered as a highlighted dot on the chart.
4. **Authentication** — JWT validation on both WebSocket and REST endpoints; per-user flag overrides surfaced in the dev panel.

---

## 9. AI Tool Usage

**Claude Code** was used to build this project. Here's how:
- **Scaffolding**: Initial file structure, `package.json` configurations, `tailwind.config.js`
- **Boilerplate**: TypeScript interface definitions, Fastify plugin registration patterns.
- **Complex logic**: The `SimulationEngine` metric generation algorithm (sine + random walk + spikes) was refined through iteration.
- **Verification**: All generated code was reviewed and architectural decisions were deliberate — the state management split between Zustand and TanStack Query, the RAF batching approach, the pagination-over-virtualization decision, and the feature flag pattern are my own architectural choices.

