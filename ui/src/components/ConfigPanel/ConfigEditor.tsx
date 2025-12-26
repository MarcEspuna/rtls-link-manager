import { DeviceConfig, AnchorConfig } from '@shared/types';
import { getAnchorWriteCommands } from '@shared/anchors';
import { AnchorListEditor } from './AnchorListEditor';
import styles from './ConfigEditor.module.css';

interface ConfigEditorProps {
  config: DeviceConfig;
  onChange: (config: DeviceConfig) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
}

export function ConfigEditor({ config, onChange, onApply }: ConfigEditorProps) {
  const handleChange = (group: keyof DeviceConfig, name: string, value: any) => {
    // For nested updates (like anchors), value is the full new value for that property
    const newConfig = { ...config, [group]: { ...config[group], [name]: value } };
    onChange(newConfig);
  };

  const handleApply = async (group: string, name: string, value: any) => {
    await onApply(group, name, value);
  };

  const handleAnchorsChange = (newAnchors: AnchorConfig[]) => {
    handleChange('uwb', 'anchors', newAnchors);
    // Also update count in local state (will be written to device with anchors)
    handleChange('uwb', 'anchorCount', newAnchors.length);
  };

  const handleAnchorsApply = async (newAnchors: AnchorConfig[]) => {
    // Write each anchor field individually (devId1, x1, y1, z1, devId2, etc.)
    const commands = getAnchorWriteCommands(newAnchors);
    for (const cmd of commands) {
      await onApply('uwb', cmd.name, cmd.value);
    }
  };

  return (
    <div className={styles.editor}>
      
      {/* WiFi Section */}
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

      {/* UWB Basic Section */}
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
          <label>Device ID (Short)</label>
          <input 
             value={config.uwb.devShortAddr || ''}
             onChange={(e) => handleChange('uwb', 'devShortAddr', e.target.value)}
             onBlur={(e) => handleApply('uwb', 'devShortAddr', e.target.value)}
             placeholder="e.g. 1A2B"
          />
        </div>
      </div>

      {/* Anchor List Section */}
      <div className={styles.section}>
        <h4>Anchor List</h4>
        <AnchorListEditor 
          anchors={config.uwb.anchors || []}
          onChange={handleAnchorsChange}
          onApply={handleAnchorsApply}
        />
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#666', textAlign: 'right' }}>
          Count: {config.uwb.anchorCount || 0}
        </div>
      </div>

      {/* Advanced / Geo Section */}
      <div className={styles.section}>
        <h4>Advanced / Geo-Reference</h4>
        <div className={styles.field}>
          <label>Origin Latitude</label>
          <input 
            type="number" step="0.000001"
            value={config.uwb.originLat || 0}
            onChange={(e) => handleChange('uwb', 'originLat', parseFloat(e.target.value))}
            onBlur={(e) => handleApply('uwb', 'originLat', parseFloat(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label>Origin Longitude</label>
          <input 
            type="number" step="0.000001"
            value={config.uwb.originLon || 0}
            onChange={(e) => handleChange('uwb', 'originLon', parseFloat(e.target.value))}
            onBlur={(e) => handleApply('uwb', 'originLon', parseFloat(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label>Origin Altitude (m)</label>
          <input 
            type="number" step="0.1"
            value={config.uwb.originAlt || 0}
            onChange={(e) => handleChange('uwb', 'originAlt', parseFloat(e.target.value))}
            onBlur={(e) => handleApply('uwb', 'originAlt', parseFloat(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label>North Rotation (°)</label>
          <input 
            type="number" step="1"
            value={config.uwb.rotationDegrees || 0}
            onChange={(e) => handleChange('uwb', 'rotationDegrees', parseFloat(e.target.value))}
            onBlur={(e) => handleApply('uwb', 'rotationDegrees', parseFloat(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label>MAVLink System ID</label>
          <input 
            type="number" step="1"
            value={config.uwb.mavlinkTargetSystemId || 1}
            onChange={(e) => handleChange('uwb', 'mavlinkTargetSystemId', parseInt(e.target.value))}
            onBlur={(e) => handleApply('uwb', 'mavlinkTargetSystemId', parseInt(e.target.value))}
          />
        </div>
      </div>

      {/* App Settings */}
      <div className={styles.section}>
        <h4>Hardware Settings</h4>
        <div className={styles.field}>
          <label>LED Pin</label>
          <input 
            type="number" step="1"
            value={config.app.led2Pin || 2}
            onChange={(e) => handleChange('app', 'led2Pin', parseInt(e.target.value))}
            onBlur={(e) => handleApply('app', 'led2Pin', parseInt(e.target.value))}
          />
        </div>
      </div>

    </div>
  );
}