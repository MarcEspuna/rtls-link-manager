import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (current / total) * 100));
  return (
    <div className={styles.container}>
      <div className={styles.bar} style={{ width: `${percent}%` }} />
    </div>
  );
}
