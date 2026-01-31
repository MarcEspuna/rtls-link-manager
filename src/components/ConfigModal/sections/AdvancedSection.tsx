import { DeviceConfig } from '@shared/types';
import styles from '../ConfigModal.module.css';

interface AdvancedSectionProps {
  config: DeviceConfig;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
}

export function AdvancedSection({ config, onChange, onApply }: AdvancedSectionProps) {
  const safeParseFloat = (value: string, fallback: number): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  };

  const safeParseInt = (value: string, fallback: number): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Coordinate System</h3>
        <div className={styles.field}>
          <label>North Rotation (degrees)</label>
          <input
            type="number"
            step="1"
            value={config.uwb.rotationDegrees || 0}
            onChange={(e) => onChange('uwb', 'rotationDegrees', safeParseFloat(e.target.value, 0))}
            onBlur={(e) => {
              const val = safeParseFloat(e.target.value, 0);
              onChange('uwb', 'rotationDegrees', val);
              onApply('uwb', 'rotationDegrees', val);
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Rotation offset from true north (clockwise positive)
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h3>Z Axis Calculation</h3>
        <div className={styles.field}>
          <label>Z Calculation Mode</label>
          <select
            value={config.uwb.zCalcMode ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange('uwb', 'zCalcMode', val);
              onApply('uwb', 'zCalcMode', val);
            }}
          >
            <option value={0}>None (TDoA Z)</option>
            <option value={1}>Rangefinder</option>
            <option value={2}>UWB (reserved)</option>
          </select>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            How to calculate the Z coordinate for position reports
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h3>Hardware Settings</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>LED Pin</label>
            <input
              type="number"
              step="1"
              value={config.app.led2Pin || 2}
              onChange={(e) => onChange('app', 'led2Pin', safeParseInt(e.target.value, 2))}
              onBlur={(e) => {
                const val = safeParseInt(e.target.value, 2);
                onChange('app', 'led2Pin', val);
                onApply('app', 'led2Pin', val);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>LED State</label>
            <select
              value={config.app.led2State ?? 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('app', 'led2State', val);
                onApply('app', 'led2State', val);
              }}
            >
              <option value={0}>Off</option>
              <option value={1}>On</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
