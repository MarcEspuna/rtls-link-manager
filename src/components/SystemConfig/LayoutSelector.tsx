import { AnchorLayout } from '@shared/types';
import { LayoutVisualization } from './LayoutVisualization';
import styles from './SystemConfig.module.css';

interface LayoutSelectorProps {
  value: AnchorLayout;
  onChange: (layout: AnchorLayout) => void;
  disabled?: boolean;
}

interface LayoutOption {
  value: AnchorLayout;
  label: string;
  description: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    value: AnchorLayout.RECTANGULAR_A1X_A3Y,
    label: '+X=A1, +Y=A3',
    description: 'A0 at origin, A1 along +X, A3 along +Y',
  },
  {
    value: AnchorLayout.RECTANGULAR_A1X_A2Y,
    label: '+X=A1, +Y=A2',
    description: 'A0 at origin, A1 along +X, A2 along +Y',
  },
  {
    value: AnchorLayout.RECTANGULAR_A3X_A1Y,
    label: '+X=A3, +Y=A1',
    description: 'A0 at origin, A3 along +X, A1 along +Y',
  },
  {
    value: AnchorLayout.RECTANGULAR_A2X_A3Y,
    label: '+X=A2, +Y=A3',
    description: 'A0 at origin, A2 along +X, A3 along +Y',
  },
];

export function LayoutSelector({ value, onChange, disabled = false }: LayoutSelectorProps) {
  return (
    <div className={styles.layoutSelector}>
      <div className={styles.layoutGrid}>
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.layoutOption} ${value === option.value ? styles.selected : ''}`}
            onClick={() => !disabled && onChange(option.value)}
            disabled={disabled}
            title={option.description}
          >
            <LayoutVisualization
              layout={option.value}
              size="small"
              showLabels={true}
              showAxes={false}
              highlightOrigin={true}
            />
            <span className={styles.layoutLabel}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
