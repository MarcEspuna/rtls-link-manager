import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: 'online' | 'offline';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <span className={styles.dot} />
      {status}
    </span>
  );
}
