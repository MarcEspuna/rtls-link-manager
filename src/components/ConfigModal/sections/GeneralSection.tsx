import { DeviceConfig, Device } from '@shared/types';
import styles from '../ConfigModal.module.css';

interface GeneralSectionProps {
  config: DeviceConfig;
  device: Device;
  savedConfigs: string[];
  activeConfig: string | null;
  previewingConfig: string | null;
  onPreviewConfig: (name: string) => void;
  onActivate: () => void;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
  loading: boolean;
}

export function GeneralSection({
  config,
  device,
  savedConfigs,
  activeConfig,
  previewingConfig,
  onPreviewConfig,
  onChange,
  onApply,
  loading,
}: GeneralSectionProps) {
  const safeParseInt = (value: string, fallback: number): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Device Information</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>IP Address</label>
            <input value={device.ip} readOnly disabled />
          </div>
          <div className={styles.field}>
            <label>MAC Address</label>
            <input value={device.mac} readOnly disabled />
          </div>
          <div className={styles.field}>
            <label>Firmware</label>
            <input value={device.firmware} readOnly disabled />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3>MAVLink Settings</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Target System ID</label>
            <input
              type="number"
              step="1"
              min="1"
              max="255"
              value={config.uwb.mavlinkTargetSystemId || 1}
              onChange={(e) => onChange('uwb', 'mavlinkTargetSystemId', safeParseInt(e.target.value, 1))}
              onBlur={(e) => {
                const val = safeParseInt(e.target.value, 1);
                onChange('uwb', 'mavlinkTargetSystemId', val);
                onApply('uwb', 'mavlinkTargetSystemId', val);
              }}
            />
          </div>
        </div>
      </div>

      {savedConfigs.length > 0 && (
        <div className={styles.section}>
          <h3>Saved Configurations</h3>
          <div className={styles.configList}>
            {savedConfigs.map(name => (
              <button
                key={name}
                onClick={() => onPreviewConfig(name)}
                disabled={loading}
                className={`${styles.configTag} ${name === activeConfig ? styles.configTagActive : ''} ${name === previewingConfig ? styles.configTagPreviewing : ''}`}
              >
                {name}
                {name === activeConfig && <span className={styles.activeIndicator}>Active</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
