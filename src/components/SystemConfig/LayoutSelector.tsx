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
    value: AnchorLayout.RECTANGULAR_0_ORIGIN,
    label: 'A0 at Origin',
    description: 'Southwest corner',
  },
  {
    value: AnchorLayout.RECTANGULAR_1_ORIGIN,
    label: 'A1 at Origin',
    description: 'Southeast corner',
  },
  {
    value: AnchorLayout.RECTANGULAR_2_ORIGIN,
    label: 'A2 at Origin',
    description: 'Northeast corner',
  },
  {
    value: AnchorLayout.RECTANGULAR_3_ORIGIN,
    label: 'A3 at Origin',
    description: 'Northwest corner',
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
