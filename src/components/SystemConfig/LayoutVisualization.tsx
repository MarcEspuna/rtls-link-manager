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
  isOrigin: boolean;
}

const getAnchorPositions = (layout: AnchorLayout): AnchorPosition[] => {
  // All layouts are rectangular with 4 anchors
  // Positions are normalized to a 100x100 grid
  const positions: Record<AnchorLayout, AnchorPosition[]> = {
    [AnchorLayout.RECTANGULAR_0_ORIGIN]: [
      { x: 20, y: 80, label: 'A0', isOrigin: true },
      { x: 80, y: 80, label: 'A1', isOrigin: false },
      { x: 80, y: 20, label: 'A2', isOrigin: false },
      { x: 20, y: 20, label: 'A3', isOrigin: false },
    ],
    [AnchorLayout.RECTANGULAR_1_ORIGIN]: [
      { x: 20, y: 80, label: 'A0', isOrigin: false },
      { x: 80, y: 80, label: 'A1', isOrigin: true },
      { x: 80, y: 20, label: 'A2', isOrigin: false },
      { x: 20, y: 20, label: 'A3', isOrigin: false },
    ],
    [AnchorLayout.RECTANGULAR_2_ORIGIN]: [
      { x: 20, y: 80, label: 'A0', isOrigin: false },
      { x: 80, y: 80, label: 'A1', isOrigin: false },
      { x: 80, y: 20, label: 'A2', isOrigin: true },
      { x: 20, y: 20, label: 'A3', isOrigin: false },
    ],
    [AnchorLayout.RECTANGULAR_3_ORIGIN]: [
      { x: 20, y: 80, label: 'A0', isOrigin: false },
      { x: 80, y: 80, label: 'A1', isOrigin: false },
      { x: 80, y: 20, label: 'A2', isOrigin: false },
      { x: 20, y: 20, label: 'A3', isOrigin: true },
    ],
    [AnchorLayout.CUSTOM]: [
      { x: 20, y: 80, label: 'A0', isOrigin: false },
      { x: 80, y: 80, label: 'A1', isOrigin: false },
      { x: 80, y: 20, label: 'A2', isOrigin: false },
      { x: 20, y: 20, label: 'A3', isOrigin: false },
    ],
  };

  return positions[layout] || positions[AnchorLayout.RECTANGULAR_0_ORIGIN];
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

  // Find origin anchor for axis drawing
  const originAnchor = anchors.find(a => a.isOrigin) || anchors[0];

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

      {/* Connection lines between anchors */}
      <g stroke="var(--text-secondary)" strokeWidth={1} opacity={0.5}>
        {anchors.map((anchor, i) => {
          const next = anchors[(i + 1) % anchors.length];
          return (
            <line
              key={`line-${i}`}
              x1={scale(anchor.x)}
              y1={scale(anchor.y)}
              x2={scale(next.x)}
              y2={scale(next.y)}
              strokeDasharray={anchor.isOrigin || next.isOrigin ? 'none' : '4,2'}
            />
          );
        })}
      </g>

      {/* NED Axes (if showing) */}
      {showAxes && (
        <g>
          {/* North (+X) - Red */}
          <line
            x1={scale(originAnchor.x)}
            y1={scale(originAnchor.y)}
            x2={scale(originAnchor.x) + 25}
            y2={scale(originAnchor.y)}
            stroke="#ef4444"
            strokeWidth={2}
            markerEnd="url(#arrowhead-red)"
          />
          {size !== 'small' && (
            <text
              x={scale(originAnchor.x) + 30}
              y={scale(originAnchor.y) + 4}
              fill="#ef4444"
              fontSize={config.fontSize - 2}
            >
              N
            </text>
          )}

          {/* East (+Y) - Green */}
          <line
            x1={scale(originAnchor.x)}
            y1={scale(originAnchor.y)}
            x2={scale(originAnchor.x)}
            y2={scale(originAnchor.y) - 25}
            stroke="#22c55e"
            strokeWidth={2}
            markerEnd="url(#arrowhead-green)"
          />
          {size !== 'small' && (
            <text
              x={scale(originAnchor.x) - 4}
              y={scale(originAnchor.y) - 30}
              fill="#22c55e"
              fontSize={config.fontSize - 2}
            >
              E
            </text>
          )}

          {/* Arrowhead markers */}
          <defs>
            <marker id="arrowhead-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
            </marker>
            <marker id="arrowhead-green" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto-start-reverse">
              <path d="M0,0 L0,6 L6,3 z" fill="#22c55e" transform="rotate(-90 3 3)" />
            </marker>
          </defs>
        </g>
      )}

      {/* Anchor circles */}
      {anchors.map((anchor, i) => (
        <g key={`anchor-${i}`}>
          <circle
            cx={scale(anchor.x)}
            cy={scale(anchor.y)}
            r={config.anchorRadius}
            fill={highlightOrigin && anchor.isOrigin ? 'var(--accent-color)' : 'var(--text-secondary)'}
            stroke={highlightOrigin && anchor.isOrigin ? 'var(--accent-hover)' : 'var(--border-color)'}
            strokeWidth={anchor.isOrigin ? 2 : 1}
          />
          {showLabels && (
            <text
              x={scale(anchor.x)}
              y={scale(anchor.y) + config.anchorRadius + config.fontSize + 2}
              fill="var(--text-primary)"
              fontSize={config.fontSize}
              textAnchor="middle"
              fontWeight={anchor.isOrigin ? 'bold' : 'normal'}
            >
              {anchor.label}
            </text>
          )}
          {highlightOrigin && anchor.isOrigin && (
            <text
              x={scale(anchor.x)}
              y={scale(anchor.y) - config.anchorRadius - 4}
              fill="var(--accent-color)"
              fontSize={config.fontSize - 2}
              textAnchor="middle"
            >
              Origin
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
