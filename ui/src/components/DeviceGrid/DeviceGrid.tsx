import { useState } from 'react';
import { Device } from '@shared/types';
import { DeviceCard } from './DeviceCard';
import { BulkActions } from '../Controls/BulkActions';
import styles from './DeviceGrid.module.css';

interface DeviceGridProps {
  devices: Device[];
  onClear: () => void;
  onConfigure: (device: Device) => void;
}

export function DeviceGrid({ devices, onClear, onConfigure }: DeviceGridProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSelectAll = () => {
    if (selected.size === devices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(devices.map(d => d.ip)));
    }
  };

  const handleSelect = (ip: string, isSelected: boolean) => {
    const newSelected = new Set(selected);
    if (isSelected) {
      newSelected.add(ip);
    } else {
      newSelected.delete(ip);
    }
    setSelected(newSelected);
  };

  const selectedDevices = devices.filter(d => selected.has(d.ip));

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.listening}>Listening for devices...</span>
        <button className={styles.btnSecondary} onClick={onClear}>Clear List</button>
        <button className={styles.btnSecondary} onClick={handleSelectAll}>
          {selected.size === devices.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className={styles.count}>{selected.size} of {devices.length} selected</span>
      </div>

      {selected.size > 0 && (
        <BulkActions devices={selectedDevices} />
      )}

      <div className={styles.grid}>
        {devices.map(device => (
          <DeviceCard
            key={device.ip}
            device={device}
            selected={selected.has(device.ip)}
            onSelect={(sel) => handleSelect(device.ip, sel)}
            onConfigure={() => onConfigure(device)}
          />
        ))}
      </div>
    </div>
  );
}
