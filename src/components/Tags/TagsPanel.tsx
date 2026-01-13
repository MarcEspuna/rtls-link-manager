import { Device } from '@shared/types';
import { TagCard } from './TagCard';
import { BulkActions } from '../Controls/BulkActions';
import styles from './TagsPanel.module.css';

interface TagsPanelProps {
  tags: Device[];
  selectedIps: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onConfigure: (device: Device) => void;
  onClear: () => void;
}

export function TagsPanel({
  tags,
  selectedIps,
  onSelectionChange,
  onConfigure,
  onClear,
}: TagsPanelProps) {
  const handleSelectAll = () => {
    if (selectedIps.size === tags.length && tags.length > 0) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(tags.map(d => d.ip)));
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

  const selectedDevices = tags.filter(d => selectedIps.has(d.ip));

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Tags</h2>
        <span className={styles.listening}>Listening for devices...</span>
        <div className={styles.toolbarActions}>
          <button className={styles.btnSecondary} onClick={onClear}>
            Clear List
          </button>
          <button
            className={styles.btnSecondary}
            onClick={handleSelectAll}
            disabled={tags.length === 0}
          >
            {selectedIps.size === tags.length && tags.length > 0
              ? 'Deselect All'
              : 'Select All'}
          </button>
          <span className={styles.count}>
            {selectedIps.size} of {tags.length} selected
          </span>
        </div>
      </div>

      {selectedDevices.length > 0 && (
        <BulkActions devices={selectedDevices} />
      )}

      {tags.length === 0 ? (
        <div className={styles.empty}>
          <p>No tags discovered yet.</p>
          <p className={styles.hint}>
            Ensure tag devices are powered on and connected to the same network.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {tags.map(device => (
            <TagCard
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
