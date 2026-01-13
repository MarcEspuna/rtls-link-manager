import { useState, useEffect, useMemo } from 'react';
import { Device, isAnchorRole, isTagRole } from '@shared/types';
import { AppShell } from './components/Layout';
import { AnchorsPanel } from './components/Anchors';
import { TagsPanel } from './components/Tags';
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel';
import { PresetsPanel } from './components/Presets';
import { getDevices, clearDevices, onDevicesUpdated } from './lib/tauri-api';
import { useSettings } from './hooks/useSettings';
import './App.css';

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedAnchorIps, setSelectedAnchorIps] = useState<Set<string>>(new Set());
  const [selectedTagIps, setSelectedTagIps] = useState<Set<string>>(new Set());

  const { isExpertMode, activeTab, setIsExpertMode, setActiveTab } = useSettings();

  // Separate devices into anchors and tags
  const { anchors, tags } = useMemo(() => {
    const anchors: Device[] = [];
    const tags: Device[] = [];

    for (const device of devices) {
      if (isAnchorRole(device.role)) {
        anchors.push(device);
      } else if (isTagRole(device.role)) {
        tags.push(device);
      }
      // calibration and unknown roles are not shown in either tab
    }

    return { anchors, tags };
  }, [devices]);

  // Get all selected devices (for presets panel)
  const allSelectedDevices = useMemo(() => {
    const selected: Device[] = [];
    for (const device of devices) {
      if (selectedAnchorIps.has(device.ip) || selectedTagIps.has(device.ip)) {
        selected.push(device);
      }
    }
    return selected;
  }, [devices, selectedAnchorIps, selectedTagIps]);

  const handleClearDevices = async () => {
    try {
      await clearDevices();
      setDevices([]);
      setSelectedAnchorIps(new Set());
      setSelectedTagIps(new Set());
    } catch (e) {
      console.error('Failed to clear devices', e);
    }
  };

  // Prune stale IPs when devices change (e.g., device goes offline)
  useEffect(() => {
    const deviceIps = new Set(devices.map(d => d.ip));

    setSelectedAnchorIps(prev => {
      const pruned = new Set([...prev].filter(ip => deviceIps.has(ip)));
      return pruned.size !== prev.size ? pruned : prev;
    });

    setSelectedTagIps(prev => {
      const pruned = new Set([...prev].filter(ip => deviceIps.has(ip)));
      return pruned.size !== prev.size ? pruned : prev;
    });
  }, [devices]);

  // Event-driven device updates instead of polling
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        // Initial fetch
        const initialDevices = await getDevices();
        if (isMounted) setDevices(initialDevices);

        // Setup listener - properly await to avoid race condition
        unlisten = await onDevicesUpdated((updatedDevices) => {
          if (isMounted) setDevices(updatedDevices);
        });
      } catch (e) {
        console.error('Failed to setup device listener', e);
      }
    };

    setup();

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'anchors':
        return (
          <AnchorsPanel
            anchors={anchors}
            selectedIps={selectedAnchorIps}
            onSelectionChange={setSelectedAnchorIps}
            onConfigure={setSelectedDevice}
            onClear={handleClearDevices}
          />
        );
      case 'tags':
        return (
          <TagsPanel
            tags={tags}
            selectedIps={selectedTagIps}
            onSelectionChange={setSelectedTagIps}
            onConfigure={setSelectedDevice}
            onClear={handleClearDevices}
          />
        );
      case 'presets':
        return (
          <PresetsPanel
            selectedDevices={allSelectedDevices}
            allDevices={devices}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        anchorCount={anchors.length}
        tagCount={tags.length}
        isExpertMode={isExpertMode}
        onExpertModeChange={setIsExpertMode}
      >
        {renderContent()}
      </AppShell>

      {selectedDevice && (
        <ConfigPanel
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          isExpertMode={isExpertMode}
        />
      )}
    </>
  );
}

export default App;
