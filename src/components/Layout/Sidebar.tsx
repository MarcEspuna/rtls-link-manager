import styles from './Layout.module.css';

export type TabType = 'anchors' | 'tags' | 'presets';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  anchorCount: number;
  tagCount: number;
}

export function Sidebar({ activeTab, onTabChange, anchorCount, tagCount }: SidebarProps) {
  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: 'anchors', label: 'Anchors', count: anchorCount },
    { id: 'tags', label: 'Tags', count: tagCount },
    { id: 'presets', label: 'Presets' },
  ];

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.navButton} ${activeTab === tab.id ? styles.navButtonActive : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className={styles.navLabel}>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={styles.navBadge}>{tab.count}</span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
