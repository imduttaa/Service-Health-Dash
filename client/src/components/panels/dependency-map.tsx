import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useServicesStore } from '../../store/services-store';
import { PanelWrapper } from '../layout/panel-wrapper';
import { cn } from '../../lib/cn';

interface Node {
  id: string;
  name: string;
  group: string;
  status: string;
  x: number;
  y: number;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
};

const GROUP_Y: Record<string, number> = {
  core: 80,
  payments: 220,
  infra: 360,
  analytics: 500,
};

/**
 * Bonus panel — simple SVG-based dependency graph.
 * Not using reactflow to keep the bundle lean; the layout is a
 * deterministic column-per-group approach (no force simulation).
 *
 * The SVG uses viewBox="0 0 800 620" with w-full so it always scales
 * to fit its container — no horizontal scrollbar, and fullscreen just
 * lets it fill the available height too.
 */
export function DependencyMap() {
  const [fullscreen, setFullscreen] = useState(false);
  const services = useServicesStore((s) => [...s.services.values()]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const { nodes, edges } = useMemo(() => {
    const groupCounts: Record<string, number> = {};
    const groupIndex: Record<string, number> = {};

    for (const s of services) {
      groupCounts[s.group] = (groupCounts[s.group] ?? 0) + 1;
      groupIndex[s.group] = 0;
    }

    const nodes: Node[] = services.map((s) => {
      const idx = groupIndex[s.group]++;
      const total = groupCounts[s.group];
      // Reserve x=0..120 for group labels; spread nodes x=130..750
      const x = total <= 1 ? 440 : 130 + idx * (620 / (total - 1));
      const y = GROUP_Y[s.group] ?? 300;
      return { id: s.id, name: s.name, group: s.group, status: s.status, x, y };
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const edges = services.flatMap((s) =>
      s.metadata.dependencies
        .map((depId) => {
          const from = nodeMap.get(s.id);
          const to = nodeMap.get(depId);
          if (!from || !to) return null;
          return { from, to, degraded: s.status !== 'healthy' || to.status !== 'healthy' };
        })
        .filter(Boolean),
    ) as Array<{ from: Node; to: Node; degraded: boolean }>;

    return { nodes, edges };
  }, [services]);

  const headerRight = (
    <button
      type="button"
      onClick={() => setFullscreen((f) => !f)}
      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );

  return (
    <PanelWrapper
      title="Dependency Map"
      panelName="DependencyMap"
      headerRight={headerRight}
      className={cn(fullscreen && 'fixed inset-0 z-50 rounded-none')}
    >
      {/*
        No overflow wrapper needed — the SVG scales via viewBox.
        In fullscreen the container fills the panel's flex-1 area so
        h-full + the SVG's h-full fill the screen properly.
      */}
      <div className={cn(fullscreen && 'h-full')}>
        <svg
          viewBox="0 0 800 620"
          className={cn('w-full', fullscreen ? 'h-full' : 'h-auto')}
          aria-label="Service dependency graph"
          role="img"
        >
          {/* Group labels */}
          {Object.entries(GROUP_Y).map(([group, y]) => (
            <text
              key={group}
              x={12}
              y={y + 5}
              fontSize={10}
              fontWeight={600}
              fill="currentColor"
              className="text-gray-400 dark:text-gray-500 uppercase"
            >
              {group}
            </text>
          ))}

          {/* Edges */}
          {edges.map(({ from, to, degraded }, i) => (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={degraded ? '#f59e0b' : '#d1d5db'}
              strokeWidth={degraded ? 2 : 1}
              strokeDasharray={degraded ? '4 2' : undefined}
              opacity={0.7}
            />
          ))}

          {/* Nodes */}
          {nodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              role="listitem"
              aria-label={`${n.name} — ${n.status}`}
            >
              <circle r={22} fill={STATUS_COLORS[n.status] ?? '#6b7280'} opacity={0.15} />
              <circle r={14} fill={STATUS_COLORS[n.status] ?? '#6b7280'} />
              <text
                y={32}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                className={cn('text-gray-600 dark:text-gray-300')}
              >
                {n.name.length > 14 ? n.name.slice(0, 12) + '…' : n.name}
              </text>
            </g>
          ))}

          {/* ── Legend ─────────────────────────────────────────────────────── */}
          {/* Full-width separator */}
          <line
            x1={12} y1={548} x2={788} y2={548}
            stroke="currentColor" strokeWidth={1}
            className="text-gray-200 dark:text-gray-700"
          />

          {/*
            Legend items are placed inside a <g> that is translated to
            horizontally center the ~480 px wide content within the 800 px viewBox.
            All coordinates below are relative to this group origin.
            cy=-3 aligns circle/line centres with the text cap-height at y=0.
          */}
          <g transform="translate(160, 568)">
            {/* Node: Healthy */}
            <circle cx={9}   cy={-3} r={9} fill="#22c55e" opacity={0.15} />
            <circle cx={9}   cy={-3} r={5} fill="#22c55e" />
            <text x={24} y={0} fontSize={10} fill="currentColor" className="text-gray-600 dark:text-gray-400">Healthy</text>

            {/* Node: Degraded */}
            <circle cx={90}  cy={-3} r={9} fill="#f59e0b" opacity={0.15} />
            <circle cx={90}  cy={-3} r={5} fill="#f59e0b" />
            <text x={105} y={0} fontSize={10} fill="currentColor" className="text-gray-600 dark:text-gray-400">Degraded</text>

            {/* Node: Down */}
            <circle cx={178} cy={-3} r={9} fill="#ef4444" opacity={0.15} />
            <circle cx={178} cy={-3} r={5} fill="#ef4444" />
            <text x={193} y={0} fontSize={10} fill="currentColor" className="text-gray-600 dark:text-gray-400">Down</text>

            {/* Vertical divider between node-status and edge-type sections */}
            <line
              x1={232} y1={-13} x2={232} y2={8}
              stroke="currentColor" strokeWidth={1}
              className="text-gray-200 dark:text-gray-700"
            />

            {/* Edge: Healthy link */}
            <line x1={248} y1={-3} x2={280} y2={-3} stroke="#d1d5db" strokeWidth={1.5} />
            <text x={286} y={0} fontSize={10} fill="currentColor" className="text-gray-600 dark:text-gray-400">Healthy link</text>

            {/* Edge: Degraded link */}
            <line x1={372} y1={-3} x2={404} y2={-3} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" />
            <text x={410} y={0} fontSize={10} fill="currentColor" className="text-gray-600 dark:text-gray-400">Degraded link</text>
          </g>
        </svg>
      </div>
    </PanelWrapper>
  );
}
