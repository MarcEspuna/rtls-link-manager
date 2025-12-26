import { useState, useEffect } from 'react';
import { Device } from '@shared/types';
import { DeviceGrid } from './components/DeviceGrid/DeviceGrid';
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel';
import './App.css';

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

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
    } catch (e) {
      console.error('Failed to clear devices', e);
    }
  };

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
          onClear={handleClearDevices}
          onConfigure={setSelectedDevice}
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
