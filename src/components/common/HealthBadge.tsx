import { DeviceHealth, HealthLevel, getHealthLabel } from '../../lib/healthStatus';
import styles from './HealthBadge.module.css';

interface HealthBadgeProps {
  health: DeviceHealth;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function HealthBadge({ health, showLabel = false, size = 'md' }: HealthBadgeProps) {
  const levelClass = getLevelClass(health.level);
  const sizeClass = size === 'sm' ? styles.sm : styles.md;

  return (
    <div
      className={`${styles.badge} ${levelClass} ${sizeClass}`}
      title={health.issues.length > 0 ? health.issues.join('\n') : getHealthLabel(health.level)}
    >
      <span className={styles.dot}></span>
      {showLabel && (
        <span className={styles.label}>{getHealthLabel(health.level)}</span>
      )}
    </div>
  );
}

function getLevelClass(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return styles.healthy;
    case 'warning':
      return styles.warning;
    case 'degraded':
      return styles.degraded;
    case 'unknown':
    default:
      return styles.unknown;
  }
}
