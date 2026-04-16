# Service Health Dashboard

A real-time observability platform for monitoring microservice health and performance.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| BFF | Fastify 4 + TypeScript | Schema-first, ~2× faster than Express, built-in WebSocket plugin |
| Real-time | WebSocket (`ws`) | Bidirectional, clean reconnect semantics, universal browser support |
| Client state | Zustand 4 | Zero-boilerplate, atomic selectors prevent cascade re-renders |
| Server state | TanStack Query 5 | Caching, pagination, optimistic mutations, deduplication |
| Charts | Recharts 2 | React-native composable API, no canvas imperative mess |
| Styling | Tailwind CSS 3 | Utility-first, zero-runtime, dark mode via `class` strategy |
| Routing/URL | React Router 6 | URL-driven state with `useSearchParams` |
| Monorepo | npm workspaces | Shared types between server and client without a build step |

## Prerequisites

- Node.js 18+
- npm 9+

## Getting Started

### 1. Install all dependencies

```bash
npm install
```

### 2. Start both server and client in development mode

```bash
npm run dev
```

This launches:
- **BFF server** → `http://localhost:3001`
- **Vite dev server** → `http://localhost:5173`

The Vite dev server proxies `/api` requests to the BFF, so you only need to open `http://localhost:5173`.

### 3. Open the dashboard

Navigate to **http://localhost:5173** in your browser.

## Running Server and Client Separately

```bash
# Terminal 1 — BFF
npm run dev --workspace=server

# Terminal 2 — Client
npm run dev --workspace=client
```

## Project Structure

```
service-health-dashboard/
├── package.json             # npm workspaces root
├── shared/
│   └── src/index.ts         # Shared TypeScript types (Service, Alert, MetricDataPoint…)
├── server/
│   ├── flags.json           # Feature flag defaults (single source of truth)
│   └── src/
│       ├── index.ts         # Fastify bootstrap
│       ├── data/
│       │   ├── seed.ts      # 20 mock microservices
│       │   └── flags.ts     # Flag loader (flags.json → env vars → runtime PATCH)
│       ├── simulation/
│       │   └── engine.ts    # Metric simulation + alert generation
│       ├── stream/
│       │   └── broadcaster.ts  # WebSocket broadcast manager
│       └── routes/          # services, alerts, dashboard, flags
├── client/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── panels/      # ServiceGrid, MetricsPanel, AlertsTable, SummaryBar, DependencyMap
│       │   ├── layout/      # Navbar, PanelWrapper, ErrorBoundary, ReconnectBanner, DevFlagsPanel
│       │   └── ui/          # Badge, Button, Skeleton, StatusDot
│       ├── context/         # ThemeContext, FeatureFlagContext
│       ├── hooks/           # useStream, useUrlState, useServices, useMetrics
│       ├── lib/             # api client, ws-manager, export, format utils, cn
│       └── store/           # Zustand stores (services, alerts-stream, stream)
```

## Key Features

### Real-time Stream
- WebSocket connection with automatic exponential-backoff reconnection
- RAF-batched metric updates — all 20 service updates per tick flushed in one animation frame
- Reconnect banner shows connection state; panels degrade gracefully with stale data

### URL-Driven State
All shareable state is encoded in the URL:
```
/?service=api-gateway&range=1h&status=open&severity=critical&page=2
```
Refreshing or sharing the URL restores the exact view.

### Feature Flags

Flags are controlled through three mechanisms (highest priority wins):

| Priority | Method | How |
|----------|--------|-----|
| 1 (highest) | Runtime — in-app panel or API | Gear icon in the Navbar, or `PATCH /api/flags` |
| 2 | Environment variables | `FEATURE_ENABLE_METRICS_PANEL=false` at process start |
| 3 (lowest) | `server/flags.json` | Edit and commit; loaded on startup |

Runtime `PATCH` changes persist to `flags.json` automatically, so toggled flags survive a server restart.

```bash
# Toggle a flag via curl
curl -X PATCH http://localhost:3001/api/flags \
  -H "Content-Type: application/json" \
  -d '{"enable-dependency-map": false}'
```

The `MetricsPanel` and `DependencyMap` flags are evaluated **independently** — disabling one does not affect the other. Each panel lives or dies on its own flag.

### Data Export

- **Charts → PNG** — download button in the MetricsPanel header captures all three charts (Response Time, Error Rate, Request Rate) at 2× resolution including legends
- **Alerts → CSV** — CSV button in the Alerts panel header exports all records matching the current filters (not just the current page), UTF-8 with BOM for direct Excel compatibility

### Error Isolation
Each panel is wrapped in a `PanelErrorBoundary`. A crash in the MetricsPanel doesn't affect the AlertsTable.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/services` | List all 20 services with current status |
| GET | `/api/services/:id/metrics?from=&to=&resolution=` | Historical time-series |
| GET | `/api/alerts?status=&severity=&serviceId=&search=&page=&pageSize=` | Paginated alerts |
| PATCH | `/api/alerts/:id` | `{ status: "acknowledged" \| "resolved" }` |
| GET | `/api/dashboard/summary` | Aggregated stats |
| GET | `/api/flags` | All feature flags |
| GET | `/api/flags/:key` | Single flag value |
| PATCH | `/api/flags` | Override flags at runtime |
| WS | `/api/stream` | Real-time event stream |
| GET | `/health` | Server health check — returns uptime |

## Notes

- All data is in-memory; restarting the server resets metrics and alerts
- The simulation pre-fills 5 minutes of metric history per service on startup
- Alert cooldown prevents spam: same service+metric pair won't fire more than once per minute
- Runtime flag changes (`PATCH /api/flags` or the in-app gear panel) are persisted to `flags.json` and survive a server restart
