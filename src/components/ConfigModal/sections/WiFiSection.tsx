import { DeviceConfig } from '@shared/types';
import styles from '../ConfigModal.module.css';

interface WiFiSectionProps {
  config: DeviceConfig;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
}

export function WiFiSection({ config, onChange, onApply }: WiFiSectionProps) {
  return (
    <div>
      <div className={styles.section}>
        <h3>WiFi Settings</h3>
        <div className={styles.field}>
          <label>Mode</label>
          <select
            value={config.wifi.mode}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange('wifi', 'mode', val);
              onApply('wifi', 'mode', val);
            }}
          >
            <option value={0}>Access Point (AP)</option>
            <option value={1}>Station (Client)</option>
          </select>
        </div>

        {config.wifi.mode === 1 && (
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Station SSID</label>
              <input
                value={config.wifi.ssidST || ''}
                onChange={(e) => onChange('wifi', 'ssidST', e.target.value)}
                onBlur={(e) => onApply('wifi', 'ssidST', e.target.value)}
                placeholder="Network name"
              />
            </div>
            <div className={styles.field}>
              <label>Station Password</label>
              <input
                type="password"
                value={config.wifi.pswdST || ''}
                onChange={(e) => onChange('wifi', 'pswdST', e.target.value)}
                onBlur={(e) => onApply('wifi', 'pswdST', e.target.value)}
                placeholder="Network password"
              />
            </div>
          </div>
        )}

        {config.wifi.mode === 0 && (
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>AP SSID</label>
              <input
                value={config.wifi.ssidAP || ''}
                onChange={(e) => onChange('wifi', 'ssidAP', e.target.value)}
                onBlur={(e) => onApply('wifi', 'ssidAP', e.target.value)}
                placeholder="Access point name"
              />
            </div>
            <div className={styles.field}>
              <label>AP Password</label>
              <input
                type="password"
                value={config.wifi.pswdAP || ''}
                onChange={(e) => onChange('wifi', 'pswdAP', e.target.value)}
                onBlur={(e) => onApply('wifi', 'pswdAP', e.target.value)}
                placeholder="Access point password"
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3>GCS Connection</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>GCS IP Address</label>
            <input
              value={config.wifi.gcsIp || ''}
              onChange={(e) => onChange('wifi', 'gcsIp', e.target.value)}
              onBlur={(e) => onApply('wifi', 'gcsIp', e.target.value)}
              placeholder="e.g. 192.168.4.2"
            />
          </div>
          <div className={styles.field}>
            <label>UDP Port</label>
            <input
              type="number"
              value={config.wifi.udpPort || 14550}
              onChange={(e) => onChange('wifi', 'udpPort', Number(e.target.value))}
              onBlur={(e) => onApply('wifi', 'udpPort', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3>Services</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Web Server</label>
            <select
              value={config.wifi.enableWebServer ?? 1}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('wifi', 'enableWebServer', val);
                onApply('wifi', 'enableWebServer', val);
              }}
            >
              <option value={1}>Enabled</option>
              <option value={0}>Disabled</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Discovery</label>
            <select
              value={config.wifi.enableDiscovery ?? 1}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('wifi', 'enableDiscovery', val);
                onApply('wifi', 'enableDiscovery', val);
              }}
            >
              <option value={1}>Enabled</option>
              <option value={0}>Disabled</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Discovery Port</label>
            <input
              type="number"
              value={config.wifi.discoveryPort || 3333}
              onChange={(e) => onChange('wifi', 'discoveryPort', Number(e.target.value))}
              onBlur={(e) => onApply('wifi', 'discoveryPort', Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
