import { useRef, useState } from 'react';
import { DeviceConfig, AnchorConfig, Device, logLevelToName } from '@shared/types';
import { Commands } from '@shared/commands';
import { getAnchorWriteCommands } from '@shared/anchors';
import { AnchorListEditor } from './AnchorListEditor';
import styles from './ConfigEditor.module.css';

interface ConfigEditorProps {
  config: DeviceConfig;
  device?: Device;  // For reading telemetry like logLevel
  onChange: (config: DeviceConfig) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
  onApplyBatch?: (commands: string[]) => Promise<void>;
  onAnchorsBusyChange?: (busy: boolean) => void;
  onAnchorsError?: (message: string | null) => void;
  anchorError?: string | null;
  isExpertMode?: boolean;
  onOpenLogTerminal?: () => void;
}

const safeParseFloat = (value: string, fallback: number = 0): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

const safeParseInt = (value: string, fallback: number = 0): number => {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
};

export function ConfigEditor({
  config,
  device,
  onChange,
  onApply,
  onApplyBatch,
  onAnchorsBusyChange,
  onAnchorsError,
  anchorError,
  isExpertMode = false,
  onOpenLogTerminal
}: ConfigEditorProps) {
  const [shortAddrError, setShortAddrError] = useState<string | null>(null);
  const anchorApplyRef = useRef<Promise<void> | null>(null);
  const pendingAnchorsRef = useRef<AnchorConfig[] | null>(null);

  const validateShortAddr = (value: string): string | null => {
    if (!value) return 'Device ID is required';
    if (!/^\d{1,2}$/.test(value)) return 'Use 1-2 digits (0-99)';
    return null;
  };
  const handleChange = (group: keyof DeviceConfig, name: string, value: any) => {
    // For nested updates (like anchors), value is the full new value for that property
    const newConfig = { ...config, [group]: { ...config[group], [name]: value } };
    onChange(newConfig);
  };

  const handleApply = async (group: string, name: string, value: any) => {
    await onApply(group, name, value);
  };

  const handleAnchorsChange = (newAnchors: AnchorConfig[]) => {
    const nextConfig: DeviceConfig = {
      ...config,
      uwb: {
        ...config.uwb,
        anchors: newAnchors,
        anchorCount: newAnchors.length,
      },
    };
    onChange(nextConfig);
  };

  const handleAnchorsApply = async (newAnchors: AnchorConfig[]) => {
    pendingAnchorsRef.current = newAnchors;
    if (anchorApplyRef.current) {
      return;
    }

    const run = (async () => {
      onAnchorsBusyChange?.(true);
      onAnchorsError?.(null);
      while (pendingAnchorsRef.current) {
        const anchorsToApply = pendingAnchorsRef.current;
        pendingAnchorsRef.current = null;
        const commands = getAnchorWriteCommands(anchorsToApply);
        if (onApplyBatch) {
          const batch = commands.map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value));
          try {
            await onApplyBatch(batch);
            continue;
          } catch (e) {
            onAnchorsError?.(e instanceof Error ? e.message : 'Failed to write anchors');
          }
        }
        for (const cmd of commands) {
          await onApply('uwb', cmd.name, cmd.value);
        }
      }
    })();

    anchorApplyRef.current = run;
    try {
      await run;
    } finally {
      anchorApplyRef.current = null;
      onAnchorsBusyChange?.(false);
    }
  };

  return (
    <div className={styles.editor}>

      {/* WiFi Section - Expert Mode Only */}
      {isExpertMode && (
        <div className={styles.section}>
          <h4>WiFi Settings</h4>
          <div className={styles.field}>
            <label>Mode</label>
            <select
              value={config.wifi.mode}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('wifi', 'mode', val);
                handleApply('wifi', 'mode', val);
              }}
            >
              <option value={0}>Access Point (AP)</option>
              <option value={1}>Station (Client)</option>
            </select>
          </div>
          {config.wifi.mode === 1 && (
            <>
              <div className={styles.field}>
                <label>SSID</label>
                <input
                  value={config.wifi.ssidST || ''}
                  onChange={(e) => handleChange('wifi', 'ssidST', e.target.value)}
                  onBlur={(e) => handleApply('wifi', 'ssidST', e.target.value)}
                />
              </div>
               <div className={styles.field}>
                <label>Password</label>
                <input
                  type="password"
                  value={config.wifi.pswdST || ''}
                  onChange={(e) => handleChange('wifi', 'pswdST', e.target.value)}
                  onBlur={(e) => handleApply('wifi', 'pswdST', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* UWB Basic Section - Always Visible */}
      <div className={styles.section}>
        <h4>UWB Configuration</h4>
        <div className={styles.field}>
          <label>Operation Mode</label>
          <select
            value={config.uwb.mode}
            onChange={(e) => {
              const val = Number(e.target.value);
              handleChange('uwb', 'mode', val);
              handleApply('uwb', 'mode', val);
            }}
          >
            <option value={0}>TWR Anchor</option>
            <option value={1}>TWR Tag</option>
            <option value={2}>Calibration</option>
            <option value={3}>TDoA Anchor</option>
            <option value={4}>TDoA Tag</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>UWB Short Address</label>
          <div className={styles.inputWithError}>
            <input
              value={config.uwb.devShortAddr || ''}
              onChange={(e) => {
                const val = e.target.value;
                handleChange('uwb', 'devShortAddr', val);
                setShortAddrError(validateShortAddr(val));
              }}
              onBlur={(e) => {
                const val = e.target.value;
                const error = validateShortAddr(val);
                setShortAddrError(error);
                if (error) return;
                handleApply('uwb', 'devShortAddr', val);
              }}
              placeholder="e.g. 0"
              className={shortAddrError ? styles.inputError : undefined}
            />
            {shortAddrError && <div className={styles.fieldError}>{shortAddrError}</div>}
          </div>
        </div>
      </div>

      {/* Anchor List Section - Always Visible */}
      <div className={styles.section}>
        <h4>Anchor List</h4>
        <AnchorListEditor
          anchors={config.uwb.anchors || []}
          onChange={handleAnchorsChange}
          onApply={handleAnchorsApply}
        />
        {anchorError && (
          <div className={styles.anchorErrorBanner}>{anchorError}</div>
        )}
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
          Count: {config.uwb.anchorCount || 0}
        </div>
      </div>

      {/* Origin Coordinates Section - Always Visible */}
      <div className={styles.section}>
        <h4>Origin / Geo-Reference</h4>
        <div className={styles.field}>
          <label>Origin Latitude</label>
          <input
            type="number" step="0.000001"
            value={config.uwb.originLat || 0}
            onChange={(e) => handleChange('uwb', 'originLat', safeParseFloat(e.target.value, config.uwb.originLat || 0))}
            onBlur={(e) => {
              const val = safeParseFloat(e.target.value, config.uwb.originLat || 0);
              handleChange('uwb', 'originLat', val);
              handleApply('uwb', 'originLat', val);
            }}
          />
        </div>
        <div className={styles.field}>
          <label>Origin Longitude</label>
          <input
            type="number" step="0.000001"
            value={config.uwb.originLon || 0}
            onChange={(e) => handleChange('uwb', 'originLon', safeParseFloat(e.target.value, config.uwb.originLon || 0))}
            onBlur={(e) => {
              const val = safeParseFloat(e.target.value, config.uwb.originLon || 0);
              handleChange('uwb', 'originLon', val);
              handleApply('uwb', 'originLon', val);
            }}
          />
        </div>
        <div className={styles.field}>
          <label>Origin Altitude (m)</label>
          <input
            type="number" step="0.1"
            value={config.uwb.originAlt || 0}
            onChange={(e) => handleChange('uwb', 'originAlt', safeParseFloat(e.target.value, config.uwb.originAlt || 0))}
            onBlur={(e) => {
              const val = safeParseFloat(e.target.value, config.uwb.originAlt || 0);
              handleChange('uwb', 'originAlt', val);
              handleApply('uwb', 'originAlt', val);
            }}
          />
        </div>
      </div>

      {/* Advanced Settings - Expert Mode Only */}
      {isExpertMode && (
        <div className={styles.section}>
          <h4>Advanced Settings</h4>
          <div className={styles.field}>
            <label>North Rotation (deg)</label>
            <input
              type="number" step="1"
              value={config.uwb.rotationDegrees || 0}
              onChange={(e) => handleChange('uwb', 'rotationDegrees', safeParseFloat(e.target.value, config.uwb.rotationDegrees || 0))}
              onBlur={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.rotationDegrees || 0);
                handleChange('uwb', 'rotationDegrees', val);
                handleApply('uwb', 'rotationDegrees', val);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>MAVLink Target System ID</label>
            <input
              type="number" step="1"
              value={config.uwb.mavlinkTargetSystemId || 1}
              onChange={(e) => handleChange('uwb', 'mavlinkTargetSystemId', safeParseInt(e.target.value, config.uwb.mavlinkTargetSystemId || 1))}
              onBlur={(e) => {
                const val = safeParseInt(e.target.value, config.uwb.mavlinkTargetSystemId || 1);
                handleChange('uwb', 'mavlinkTargetSystemId', val);
                handleApply('uwb', 'mavlinkTargetSystemId', val);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>Z Calculation Mode</label>
            <select
              value={config.uwb.zCalcMode ?? 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('uwb', 'zCalcMode', val);
                handleApply('uwb', 'zCalcMode', val);
              }}
            >
              <option value={0}>None (TDoA Z)</option>
              <option value={1}>Rangefinder</option>
              <option value={2}>UWB (reserved)</option>
            </select>
          </div>
        </div>
      )}

      {/* Hardware Settings - Expert Mode Only */}
      {isExpertMode && (
        <div className={styles.section}>
          <h4>Hardware Settings</h4>
          <div className={styles.field}>
            <label>LED Pin</label>
            <input
              type="number" step="1"
              value={config.app.led2Pin || 2}
              onChange={(e) => handleChange('app', 'led2Pin', safeParseInt(e.target.value, config.app.led2Pin || 2))}
              onBlur={(e) => {
                const val = safeParseInt(e.target.value, config.app.led2Pin || 2);
                handleChange('app', 'led2Pin', val);
                handleApply('app', 'led2Pin', val);
              }}
            />
          </div>
        </div>
      )}

      {/* UWB Radio Settings - Expert Mode + TDoA modes only */}
      {isExpertMode && (config.uwb.mode === 3 || config.uwb.mode === 4) && (
        <div className={styles.section}>
          <h4>UWB Radio Settings</h4>
          <div className={styles.field}>
            <label>Channel</label>
            <select
              value={config.uwb.channel ?? 2}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('uwb', 'channel', val);
                handleApply('uwb', 'channel', val);
              }}
            >
              <option value={1}>Channel 1</option>
              <option value={2}>Channel 2 (Default)</option>
              <option value={3}>Channel 3</option>
              <option value={4}>Channel 4</option>
              <option value={5}>Channel 5</option>
              <option value={7}>Channel 7</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Mode</label>
            <select
              value={config.uwb.dwMode ?? 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('uwb', 'dwMode', val);
                handleApply('uwb', 'dwMode', val);
              }}
            >
              <option value={0}>Short Data, Fast Accuracy (Default)</option>
              <option value={1}>Long Data, Fast Accuracy</option>
              <option value={2}>Short Data, Fast Low Power</option>
              <option value={3}>Long Data, Fast Low Power</option>
              <option value={4}>Short Data, Mid Accuracy</option>
              <option value={5}>Long Data, Mid Accuracy</option>
              <option value={6}>Long Data, Range Accuracy</option>
              <option value={7}>Long Data, Range Low Power</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>TX Power</label>
            <select
              value={config.uwb.txPowerLevel ?? 3}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('uwb', 'txPowerLevel', val);
                handleApply('uwb', 'txPowerLevel', val);
              }}
            >
              <option value={0}>Low</option>
              <option value={1}>Medium-Low</option>
              <option value={2}>Medium-High</option>
              <option value={3}>High (Default)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Smart Power</label>
            <select
              value={config.uwb.smartPowerEnable ?? 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('uwb', 'smartPowerEnable', val);
                handleApply('uwb', 'smartPowerEnable', val);
              }}
            >
              <option value={0}>Disabled (Default)</option>
              <option value={1}>Enabled</option>
            </select>
          </div>
        </div>
      )}

      {/* Debug & Logging - Expert Mode Only */}
      {isExpertMode && (
        <div className={styles.section}>
          <h4>Debug & Logging</h4>
          <div className={styles.field}>
            <label>Compiled Log Level</label>
            <div className={styles.readonlyField}>
              {device?.logLevel !== undefined
                ? `${logLevelToName(device.logLevel)} (${device.logLevel})`
                : 'Unknown'}
            </div>
          </div>
          <div className={styles.field}>
            <label>Serial Logging</label>
            <select
              value={config.wifi.logSerialEnabled ?? 1}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('wifi', 'logSerialEnabled', val);
                handleApply('wifi', 'logSerialEnabled', val);
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
                handleChange('wifi', 'logUdpEnabled', val);
                handleApply('wifi', 'logUdpEnabled', val);
              }}
            >
              <option value={0}>Disabled (Default)</option>
              <option value={1}>Enabled</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>UDP Log Port</label>
            <input
              type="number"
              step="1"
              value={config.wifi.logUdpPort ?? 3334}
              onChange={(e) => handleChange('wifi', 'logUdpPort', safeParseInt(e.target.value, 3334))}
              onBlur={(e) => {
                const val = safeParseInt(e.target.value, 3334);
                handleChange('wifi', 'logUdpPort', val);
                handleApply('wifi', 'logUdpPort', val);
              }}
            />
          </div>
          {onOpenLogTerminal && (
            <div className={styles.field}>
              <button
                type="button"
                onClick={onOpenLogTerminal}
                className={styles.logTerminalButton}
              >
                Open Log Terminal
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
