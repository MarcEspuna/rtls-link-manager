import { useState, useEffect } from 'react';
import { Device } from '@shared/types';
import { DeviceGrid } from './components/DeviceGrid/DeviceGrid';
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel';
import { LocalConfigPanel } from './components/LocalConfigs/LocalConfigPanel';
import './App.css';

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedDeviceIps, setSelectedDeviceIps] = useState<Set<string>>(new Set());

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      if (data.devices) {
        setDevices(data.devices);
      }
    } catch (e) {
      console.error('Failed to fetch devices', e);
    }
  };

  const handleClearDevices = async () => {
    try {
      await fetch('/api/devices', { method: 'DELETE' });
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

  // Auto-refresh: fetch devices every 3 seconds
  useEffect(() => {
    fetchDevices(); // Initial fetch
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <header>
        <h1>RTLS-Link Swarm Manager</h1>
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
