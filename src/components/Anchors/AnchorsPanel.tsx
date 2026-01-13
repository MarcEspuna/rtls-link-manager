import { Device } from '@shared/types';
import { AnchorCard } from './AnchorCard';
import { BulkActions } from '../Controls/BulkActions';
import styles from './AnchorsPanel.module.css';

interface AnchorsPanelProps {
  anchors: Device[];
  selectedIps: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onConfigure: (device: Device) => void;
  onClear: () => void;
}

export function AnchorsPanel({
  anchors,
  selectedIps,
  onSelectionChange,
  onConfigure,
  onClear,
}: AnchorsPanelProps) {
  const handleSelectAll = () => {
    if (selectedIps.size === anchors.length && anchors.length > 0) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(anchors.map(d => d.ip)));
    }
  };

  const handleSelect = (ip: string, isSelected: boolean) => {
    const newSelected = new Set(selectedIps);
    if (isSelected) {
      newSelected.add(ip);
    } else {
      newSelected.delete(ip);
    }
    onSelectionChange(newSelected);
  };

  const selectedDevices = anchors.filter(d => selectedIps.has(d.ip));

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Anchors</h2>
        <span className={styles.listening}>Listening for devices...</span>
        <div className={styles.toolbarActions}>
          <button className={styles.btnSecondary} onClick={onClear}>
            Clear List
          </button>
          <button
            className={styles.btnSecondary}
            onClick={handleSelectAll}
            disabled={anchors.length === 0}
          >
            {selectedIps.size === anchors.length && anchors.length > 0
              ? 'Deselect All'
              : 'Select All'}
          </button>
          <span className={styles.count}>
            {selectedIps.size} of {anchors.length} selected
          </span>
        </div>
      </div>

      {selectedDevices.length > 0 && (
        <BulkActions devices={selectedDevices} />
      )}

      {anchors.length === 0 ? (
        <div className={styles.empty}>
          <p>No anchors discovered yet.</p>
          <p className={styles.hint}>
            Ensure anchor devices are powered on and connected to the same network.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {anchors.map(device => (
            <AnchorCard
              key={device.ip}
              device={device}
              selected={selectedIps.has(device.ip)}
              onSelect={(sel) => handleSelect(device.ip, sel)}
              onConfigure={() => onConfigure(device)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
