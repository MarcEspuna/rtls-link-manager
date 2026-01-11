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

    console.log('[App] useEffect triggered, setting up listener...');

    const setup = async () => {
      try {
        // Initial fetch
        console.log('[App] Fetching initial devices...');
        const initialDevices = await getDevices();
        console.log('[App] Initial devices fetched:', initialDevices.length);
        if (isMounted) {
          setDevices(initialDevices);
          console.log('[App] Initial devices set to state');
        } else {
          console.log('[App] Component unmounted before initial fetch completed');
        }

        // Setup listener - properly await to avoid race condition
        console.log('[App] Setting up event listener...');
        unlisten = await onDevicesUpdated((updatedDevices) => {
          console.log('[App] EVENT RECEIVED: devices-updated with', updatedDevices.length, 'devices');
          console.log('[App] Device IPs:', updatedDevices.map(d => d.ip));
          if (isMounted) {
            console.log('[App] Setting devices to state...');
            setDevices(updatedDevices);
          } else {
            console.log('[App] Component unmounted, skipping state update');
          }
        });
        console.log('[App] Event listener setup complete, unlisten:', typeof unlisten);
      } catch (e) {
        console.error('[App] Failed to setup device listener', e);
      }
    };

    setup();

    return () => {
      console.log('[App] Cleanup called, isMounted was:', isMounted);
      isMounted = false;
      if (unlisten) {
        console.log('[App] Calling unlisten()');
        unlisten();
      } else {
        console.log('[App] No unlisten function to call');
      }
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
