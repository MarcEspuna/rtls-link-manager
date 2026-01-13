import styles from './Layout.module.css';

interface HeaderProps {
  isExpertMode: boolean;
  onExpertModeChange: (enabled: boolean) => void;
}

export function Header({ isExpertMode, onExpertModeChange }: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>RTLS-Link Manager</h1>
      <div className={styles.headerActions}>
        <label className={styles.expertToggle}>
          <input
            type="checkbox"
            checked={isExpertMode}
            onChange={(e) => onExpertModeChange(e.target.checked)}
          />
          <span className={styles.toggleSlider}></span>
          <span className={styles.toggleLabel}>Expert Mode</span>
        </label>
      </div>
    </header>
  );
}
