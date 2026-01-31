import { DeviceConfig, Device, logLevelToName } from '@shared/types';
import styles from '../ConfigModal.module.css';

interface LoggingSectionProps {
  config: DeviceConfig;
  device: Device;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
  onOpenLogTerminal: () => void;
}

export function LoggingSection({
  config,
  device,
  onChange,
  onApply,
  onOpenLogTerminal,
}: LoggingSectionProps) {
  const safeParseInt = (value: string, fallback: number): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Logging Configuration</h3>
        <div className={styles.field}>
          <label>Compiled Log Level</label>
          <input
            value={device.logLevel !== undefined
              ? `${logLevelToName(device.logLevel)} (${device.logLevel})`
              : 'Unknown'}
            readOnly
            disabled
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Set at compile time via user_defines.txt
          </span>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Serial Logging</label>
            <select
              value={config.wifi.logSerialEnabled ?? 1}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('wifi', 'logSerialEnabled', val);
                onApply('wifi', 'logSerialEnabled', val);
              }}
            >
              <option value={1}>Enabled (Default)</option>
              <option value={0}>Disabled</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>UDP Log Streaming</label>
            <select
              value={config.wifi.logUdpEnabled ?? 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('wifi', 'logUdpEnabled', val);
                onApply('wifi', 'logUdpEnabled', val);
              }}
            >
              <option value={0}>Disabled (Default)</option>
              <option value={1}>Enabled</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label>UDP Log Port</label>
          <input
            type="number"
            step="1"
            value={config.wifi.logUdpPort ?? 3334}
            onChange={(e) => onChange('wifi', 'logUdpPort', safeParseInt(e.target.value, 3334))}
            onBlur={(e) => {
              const val = safeParseInt(e.target.value, 3334);
              onChange('wifi', 'logUdpPort', val);
              onApply('wifi', 'logUdpPort', val);
            }}
          />
        </div>
      </div>

      <div className={styles.section}>
        <h3>Log Terminal</h3>
        <p>
          View real-time log messages from the device. Enable UDP log streaming above to see logs.
        </p>
        <button
          type="button"
          onClick={onOpenLogTerminal}
          className={styles.btnPrimary}
        >
          Open Log Terminal
        </button>
      </div>
    </div>
  );
}
