import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar, TabType } from './Sidebar';
import styles from './Layout.module.css';

interface AppShellProps {
  children: ReactNode;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  anchorCount: number;
  tagCount: number;
  isExpertMode: boolean;
  onExpertModeChange: (enabled: boolean) => void;
}

export function AppShell({
  children,
  activeTab,
  onTabChange,
  anchorCount,
  tagCount,
  isExpertMode,
  onExpertModeChange,
}: AppShellProps) {
  return (
    <div className={styles.appShell}>
      <Header
        isExpertMode={isExpertMode}
        onExpertModeChange={onExpertModeChange}
      />
      <div className={styles.mainLayout}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          anchorCount={anchorCount}
          tagCount={tagCount}
        />
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
