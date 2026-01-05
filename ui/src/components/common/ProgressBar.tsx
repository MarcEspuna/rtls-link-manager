import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (current / total) * 100));
  return (
    <div className={styles.wrapper}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.container}>
        <div className={styles.bar} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.text}>{current} / {total}</div>
    </div>
  );
}
