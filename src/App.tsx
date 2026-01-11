import { useState, useEffect } from 'react';
import { Device } from '@shared/types';
import { DeviceGrid } from './components/DeviceGrid/DeviceGrid';
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel';
import { LocalConfigPanel } from './components/LocalConfigs/LocalConfigPanel';
import { getDevices, clearDevices, onDevicesUpdated } from './lib/tauri-api';
import './App.css';

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedDeviceIps, setSelectedDeviceIps] = useState<Set<string>>(new Set());

  const handleClearDevices = async () => {
    try {
      await clearDevices();
      setDevices([]);
      setSelectedDeviceIps(new Set());
    } catch (e) {
      console.error('Failed to clear devices', e);
    }
  };

  // Prune stale IPs when devices change (e.g., device goes offline)
  useEffect(() => {
    const deviceIps = new Set(devices.map(d => d.ip));
    setSelectedDeviceIps(prev => {
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

  return (
    <div className="app-container">
      <header>
        <h1>RTLS-Link Manager</h1>
      </header>
      <main>
        <DeviceGrid
          devices={devices}
          selectedDeviceIps={selectedDeviceIps}
          onSelectionChange={setSelectedDeviceIps}
          onClear={handleClearDevices}
          onConfigure={setSelectedDevice}
        />
        <LocalConfigPanel
          selectedDevices={devices.filter(d => selectedDeviceIps.has(d.ip))}
          allDevices={devices}
        />
        {selectedDevice && (
          <ConfigPanel
            device={selectedDevice}
            onClose={() => setSelectedDevice(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
