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

  const handleDiscover = async () => {
    try {
      const res = await fetch('/api/devices/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 2000 })
      });
      const data = await res.json();
      if (data.devices) {
        setDevices(data.devices);
      }
    } catch (e) {
      console.error('Discovery failed', e);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <div className="app-container">
      <header>
        <h1>RTLS-Link Swarm Manager</h1>
      </header>
      <main>
        <DeviceGrid 
          devices={devices} 
          onRefresh={handleDiscover}
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