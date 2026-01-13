import { useState, useEffect, useCallback } from 'react';
import { TabType } from '../components/Layout';

interface AppSettings {
  isExpertMode: boolean;
  activeTab: TabType;
}

const STORAGE_KEY = 'rtls-link-manager-settings';

const DEFAULT_SETTINGS: AppSettings = {
  isExpertMode: false,
  activeTab: 'anchors',
};

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to load settings from localStorage:', e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings to localStorage:', e);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setIsExpertMode = useCallback((isExpertMode: boolean) => {
    setSettings((prev) => ({ ...prev, isExpertMode }));
  }, []);

  const setActiveTab = useCallback((activeTab: TabType) => {
    setSettings((prev) => ({ ...prev, activeTab }));
  }, []);

  return {
    isExpertMode: settings.isExpertMode,
    activeTab: settings.activeTab,
    setIsExpertMode,
    setActiveTab,
  };
}
