import { Device } from '@shared/types';
import { DeviceCard } from './DeviceCard';
import { BulkActions } from '../Controls/BulkActions';
import styles from './DeviceGrid.module.css';

interface DeviceGridProps {
  devices: Device[];
  selectedDeviceIps: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onClear: () => void;
  onConfigure: (device: Device) => void;
}

export function DeviceGrid({ devices, selectedDeviceIps, onSelectionChange, onClear, onConfigure }: DeviceGridProps) {
  const handleSelectAll = () => {
    if (selectedDeviceIps.size === devices.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(devices.map(d => d.ip)));
    }
  };

  const handleSelect = (ip: string, isSelected: boolean) => {
    const newSelected = new Set(selectedDeviceIps);
    if (isSelected) {
      newSelected.add(ip);
    } else {
      newSelected.delete(ip);
    }
    onSelectionChange(newSelected);
  };

  const selectedDevices = devices.filter(d => selectedDeviceIps.has(d.ip));

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.listening}>Listening for devices...</span>
        <button className={styles.btnSecondary} onClick={onClear}>Clear List</button>
        <button className={styles.btnSecondary} onClick={handleSelectAll}>
          {selectedDeviceIps.size === devices.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className={styles.count}>{selectedDeviceIps.size} of {devices.length} selected</span>
      </div>

      {selectedDevices.length > 0 && (
        <BulkActions devices={selectedDevices} />
      )}

      <div className={styles.grid}>
        {devices.map(device => (
          <DeviceCard
            key={device.ip}
            device={device}
            selected={selectedDeviceIps.has(device.ip)}
            onSelect={(sel) => handleSelect(device.ip, sel)}
            onConfigure={() => onConfigure(device)}
          />
        ))}
      </div>
    </div>
  );
}
