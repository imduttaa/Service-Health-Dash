import { useMemo } from 'react';
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
 */
export function DependencyMap() {
  const services = useServicesStore((s) => [...s.services.values()]);

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
      const x = 80 + idx * (720 / Math.max(total, 1));
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

  return (
    <PanelWrapper title="Dependency Map" panelName="DependencyMap">
      <div className="overflow-auto">
        <svg
          width="800"
          height="620"
          viewBox="0 0 800 620"
          className="min-w-full"
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
            <g key={n.id} transform={`translate(${n.x},${n.y})`} role="listitem" aria-label={`${n.name} — ${n.status}`}>
              <circle
                r={22}
                fill={STATUS_COLORS[n.status] ?? '#6b7280'}
                opacity={0.15}
              />
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
        </svg>
      </div>
    </PanelWrapper>
  );
}
