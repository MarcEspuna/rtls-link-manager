import { DeviceConfig } from '@shared/types';
import { MAV_SENSOR_ORIENTATION_OPTIONS } from '@shared/mavlink';
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

  const clampU8 = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(255, Math.max(0, Math.trunc(value)));
  };

  const safeParseU8 = (value: string, fallback: number): number =>
    clampU8(Number(value), fallback);

  const clampU16 = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(65535, Math.max(0, Math.trunc(value)));
  };

  const safeParseU16 = (value: string, fallback: number): number =>
    clampU16(Number(value), fallback);

  const safeParseNonNegativeInt = (value: string, fallback: number): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : Math.max(0, parsed);
  };

  const apOutputMode = config.uwb.apOutputMode ?? 0;
  const apBeaconPositionMode = config.uwb.apBeaconPositionMode ?? 1;
  const apBeaconPositionStartupMs = config.uwb.apBeaconPositionStartupMs ?? 10000;
  const apBeaconPositionErrorMm = config.uwb.apBeaconPositionErrorMm ?? 500;
  const rfForwardEnabled = config.uwb.rfForwardEnable ?? 0;
  const rfForwardPreserveSrcIds = config.uwb.rfForwardPreserveSrcIds ?? 0;
  const rfForwardSensorId = config.uwb.rfForwardSensorId ?? 255;
  const rfForwardOrientation = config.uwb.rfForwardOrientation ?? 255;
  const preserveSensorId = rfForwardSensorId === 255;
  const preserveOrientation = rfForwardOrientation === 255;
  const rfOrientationOptions = MAV_SENSOR_ORIENTATION_OPTIONS.some(
    (option) => option.value === rfForwardOrientation
  )
    ? MAV_SENSOR_ORIENTATION_OPTIONS
    : [
        { value: rfForwardOrientation, label: `${rfForwardOrientation} - Unknown (as-is)` },
        ...MAV_SENSOR_ORIENTATION_OPTIONS,
      ];

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
        <h3>ArduPilot Output</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Output Mode</label>
            <select
              value={apOutputMode}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('uwb', 'apOutputMode', val);
                onApply('uwb', 'apOutputMode', val);
              }}
            >
              <option value={0}>MAVLink External Nav</option>
              <option value={1}>Beacon TDoA</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Position Feed</label>
            <select
              value={apBeaconPositionMode}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('uwb', 'apBeaconPositionMode', val);
                onApply('uwb', 'apBeaconPositionMode', val);
              }}
            >
              <option value={0}>Disabled</option>
              <option value={1}>Startup Window</option>
              <option value={2}>Continuous</option>
            </select>
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Startup Window (ms)</label>
            <input
              type="number"
              step="100"
              min={0}
              value={apBeaconPositionStartupMs}
              onChange={(e) =>
                onChange('uwb', 'apBeaconPositionStartupMs', safeParseNonNegativeInt(e.target.value, 10000))
              }
              onBlur={(e) => {
                const val = safeParseNonNegativeInt(e.target.value, 10000);
                onChange('uwb', 'apBeaconPositionStartupMs', val);
                onApply('uwb', 'apBeaconPositionStartupMs', val);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>Position Error (mm)</label>
            <input
              type="number"
              step="50"
              min={1}
              max={65535}
              value={apBeaconPositionErrorMm}
              onChange={(e) =>
                onChange('uwb', 'apBeaconPositionErrorMm', Math.max(1, safeParseU16(e.target.value, 500)))
              }
              onBlur={(e) => {
                const val = Math.max(1, safeParseU16(e.target.value, 500));
                onChange('uwb', 'apBeaconPositionErrorMm', val);
                onApply('uwb', 'apBeaconPositionErrorMm', val);
              }}
            />
          </div>
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
        <h3>Rangefinder Forwarding</h3>
        <p>
          Forward incoming MAVLink <code>DISTANCE_SENSOR</code> from the rangefinder UART to ArduPilot.
        </p>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Forwarding</label>
            <select
              value={rfForwardEnabled}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('uwb', 'rfForwardEnable', val);
                onApply('uwb', 'rfForwardEnable', val);
              }}
            >
              <option value={0}>Disabled</option>
              <option value={1}>Enabled</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Source SYS/COMP IDs</label>
            <select
              value={rfForwardPreserveSrcIds}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange('uwb', 'rfForwardPreserveSrcIds', val);
                onApply('uwb', 'rfForwardPreserveSrcIds', val);
              }}
            >
              <option value={0}>Use UWB Device IDs</option>
              <option value={1}>Preserve Source IDs</option>
            </select>
          </div>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Sensor ID</label>
            <select
              value={preserveSensorId ? 'preserve' : 'override'}
              onChange={(e) => {
                const next = e.target.value === 'preserve' ? 255 : 0;
                onChange('uwb', 'rfForwardSensorId', next);
                onApply('uwb', 'rfForwardSensorId', next);
              }}
            >
              <option value="preserve">Preserve Source</option>
              <option value="override">Override</option>
            </select>
            {!preserveSensorId && (
              <input
                type="number"
                step="1"
                min={0}
                max={254}
                value={rfForwardSensorId}
                onChange={(e) =>
                  onChange('uwb', 'rfForwardSensorId', safeParseU8(e.target.value, 0))
                }
                onBlur={(e) => {
                  const val = Math.min(254, safeParseU8(e.target.value, 0));
                  onChange('uwb', 'rfForwardSensorId', val);
                  onApply('uwb', 'rfForwardSensorId', val);
                }}
              />
            )}
          </div>

          <div className={styles.field}>
            <label>Orientation</label>
            <select
              value={preserveOrientation ? 'preserve' : 'override'}
              onChange={(e) => {
                const next = e.target.value === 'preserve' ? 255 : 0;
                onChange('uwb', 'rfForwardOrientation', next);
                onApply('uwb', 'rfForwardOrientation', next);
              }}
            >
              <option value="preserve">Preserve Source</option>
              <option value="override">Override</option>
            </select>
            {!preserveOrientation && (
              <select
                value={rfForwardOrientation}
                onChange={(e) => {
                  const val = safeParseU8(e.target.value, 0);
                  onChange('uwb', 'rfForwardOrientation', val);
                  onApply('uwb', 'rfForwardOrientation', val);
                }}
              >
                {rfOrientationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          Sensor ID and orientation use MAVLink values. Value 255 means preserve source message value.
        </span>
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
