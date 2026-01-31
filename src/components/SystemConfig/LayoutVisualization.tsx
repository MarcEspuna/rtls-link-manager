import { AnchorLayout } from '@shared/types';
import styles from './SystemConfig.module.css';

interface LayoutVisualizationProps {
  layout: AnchorLayout;
  size?: 'small' | 'medium' | 'large';
  showLabels?: boolean;
  showAxes?: boolean;
  highlightOrigin?: boolean;
}

interface AnchorPosition {
  x: number;
  y: number;
  label: string;
  role: 'origin' | 'xAxis' | 'yAxis' | 'corner';
}

// A0 is always at origin (bottom-left in SVG).
// Layout determines which anchors are on the +X and +Y axes.
const getAnchorPositions = (layout: AnchorLayout): AnchorPosition[] => {
  // Layout -> [xAnchorId, yAnchorId]
  const axisMap: Record<number, [number, number]> = {
    [AnchorLayout.RECTANGULAR_A1X_A3Y]: [1, 3],
    [AnchorLayout.RECTANGULAR_A1X_A2Y]: [1, 2],
    [AnchorLayout.RECTANGULAR_A3X_A1Y]: [3, 1],
    [AnchorLayout.RECTANGULAR_A2X_A3Y]: [2, 3],
  };

  const [xAnchorId, yAnchorId] = axisMap[layout] ?? [1, 3];

  // Determine roles for anchors 1-3
  const getRole = (id: number): 'xAxis' | 'yAxis' | 'corner' => {
    if (id === xAnchorId) return 'xAxis';
    if (id === yAnchorId) return 'yAxis';
    return 'corner';
  };

  // Fixed positions in a 100x100 grid (NED right-hand rule):
  // +X = North (up on screen), +Y = East (right on screen)
  // A0 = origin (bottom-left), +X anchor (top-left), +Y anchor (bottom-right), corner (top-right)
  const posMap: Record<string, { x: number; y: number }> = {
    origin: { x: 20, y: 80 },
    xAxis:  { x: 20, y: 20 },   // +X = North = up
    yAxis:  { x: 80, y: 80 },   // +Y = East = right
    corner: { x: 80, y: 20 },   // NE corner
  };

  const anchors: AnchorPosition[] = [
    { ...posMap.origin, label: 'A0', role: 'origin' },
  ];

  for (let id = 1; id <= 3; id++) {
    const role = getRole(id);
    anchors.push({ ...posMap[role], label: `A${id}`, role });
  }

  return anchors;
};

const getSizeConfig = (size: 'small' | 'medium' | 'large') => {
  switch (size) {
    case 'small':
      return { width: 80, height: 80, anchorRadius: 6, fontSize: 8 };
    case 'medium':
      return { width: 150, height: 150, anchorRadius: 10, fontSize: 11 };
    case 'large':
      return { width: 250, height: 250, anchorRadius: 14, fontSize: 14 };
  }
};

const getRoleColor = (role: AnchorPosition['role'], highlight: boolean) => {
  if (!highlight) return 'var(--text-secondary)';
  switch (role) {
    case 'origin': return 'var(--accent-primary)';
    case 'xAxis':  return '#ef4444'; // Red (+X / North)
    case 'yAxis':  return '#22c55e'; // Green (+Y / East)
    case 'corner': return 'var(--text-secondary)';
  }
};

export function LayoutVisualization({
  layout,
  size = 'medium',
  showLabels = true,
  showAxes = true,
  highlightOrigin = true,
}: LayoutVisualizationProps) {
  const anchors = getAnchorPositions(layout);
  const config = getSizeConfig(size);
  const padding = 10;

  // Scale positions to actual SVG dimensions
  const scale = (val: number) => padding + (val / 100) * (config.width - padding * 2);

  // Origin is always A0
  const originAnchor = anchors[0];

  return (
    <svg
      width={config.width}
      height={config.height}
      viewBox={`0 0 ${config.width} ${config.height}`}
      className={styles.layoutVisualization}
    >
      {/* Background */}
      <rect
        x={0}
        y={0}
        width={config.width}
        height={config.height}
        fill="var(--bg-tertiary)"
        rx={4}
      />

      {/* Grid lines */}
      <g stroke="var(--border-color)" strokeWidth={0.5} opacity={0.3}>
        {[25, 50, 75].map(pos => (
          <g key={pos}>
            <line x1={scale(pos)} y1={padding} x2={scale(pos)} y2={config.height - padding} />
            <line x1={padding} y1={scale(pos)} x2={config.width - padding} y2={scale(pos)} />
          </g>
        ))}
      </g>

      {/* Connection lines between anchors (rectangle edges) */}
      <g stroke="var(--text-secondary)" strokeWidth={1} opacity={0.5}>
        {anchors.map((anchor, i) => {
          const next = anchors[(i + 1) % anchors.length];
          const isAxisEdge = anchor.role === 'origin' || next.role === 'origin';
          return (
            <line
              key={`line-${i}`}
              x1={scale(anchor.x)}
              y1={scale(anchor.y)}
              x2={scale(next.x)}
              y2={scale(next.y)}
              strokeDasharray={isAxisEdge ? 'none' : '4,2'}
            />
          );
        })}
      </g>

      {/* NED Axes from origin (right-hand rule: +X=North=up, +Y=East=right) */}
      {showAxes && (
        <g>
          {/* +X axis / North (Red) — points UP */}
          <line
            x1={scale(originAnchor.x)}
            y1={scale(originAnchor.y)}
            x2={scale(originAnchor.x)}
            y2={scale(originAnchor.y) - 25}
            stroke="#ef4444"
            strokeWidth={2}
            markerEnd="url(#arrowhead-red)"
          />
          {size !== 'small' && (
            <text
              x={scale(originAnchor.x) + 6}
              y={scale(originAnchor.y) - 22}
              fill="#ef4444"
              fontSize={config.fontSize - 2}
            >
              +X (N)
            </text>
          )}

          {/* +Y axis / East (Green) — points RIGHT */}
          <line
            x1={scale(originAnchor.x)}
            y1={scale(originAnchor.y)}
            x2={scale(originAnchor.x) + 25}
            y2={scale(originAnchor.y)}
            stroke="#22c55e"
            strokeWidth={2}
            markerEnd="url(#arrowhead-green)"
          />
          {size !== 'small' && (
            <text
              x={scale(originAnchor.x) + 30}
              y={scale(originAnchor.y) + 4}
              fill="#22c55e"
              fontSize={config.fontSize - 2}
            >
              +Y (E)
            </text>
          )}

          {/* Arrowhead markers */}
          <defs>
            <marker id="arrowhead-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
            </marker>
            <marker id="arrowhead-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#22c55e" />
            </marker>
          </defs>
        </g>
      )}

      {/* Anchor circles */}
      {anchors.map((anchor, i) => {
        const color = getRoleColor(anchor.role, highlightOrigin);
        const isHighlighted = highlightOrigin && anchor.role !== 'corner';
        return (
          <g key={`anchor-${i}`}>
            <circle
              cx={scale(anchor.x)}
              cy={scale(anchor.y)}
              r={config.anchorRadius}
              fill={color}
              stroke={isHighlighted ? color : 'var(--border-color)'}
              strokeWidth={isHighlighted ? 2 : 1}
              opacity={anchor.role === 'corner' ? 0.6 : 1}
            />
            {showLabels && (
              <text
                x={scale(anchor.x)}
                y={scale(anchor.y) + config.anchorRadius + config.fontSize + 2}
                fill="var(--text-primary)"
                fontSize={config.fontSize}
                textAnchor="middle"
                fontWeight={isHighlighted ? 'bold' : 'normal'}
              >
                {anchor.label}
              </text>
            )}
            {highlightOrigin && anchor.role === 'origin' && (
              <text
                x={scale(anchor.x)}
                y={scale(anchor.y) - config.anchorRadius - 4}
                fill="var(--accent-primary)"
                fontSize={config.fontSize - 2}
                textAnchor="middle"
              >
                Origin
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
