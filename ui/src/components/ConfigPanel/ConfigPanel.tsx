import { useState, useEffect } from 'react';
import { Device, DeviceConfig } from '@shared/types';
import { Commands } from '@shared/commands';
import { flatToAnchors } from '@shared/anchors';
import { useDeviceCommand } from '../../hooks/useDeviceWebSocket';
import { ConfigEditor } from './ConfigEditor';
import styles from './ConfigPanel.module.css';

interface ConfigPanelProps {
  device: Device;
  onClose: () => void;
}

export function ConfigPanel({ device, onClose }: ConfigPanelProps) {
  const { sendCommand, loading } = useDeviceCommand(device.ip);
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [activeConfig, setActiveConfig] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    loadSavedConfigs();
  }, [device.ip]);

  const loadConfig = async () => {
    const result = await sendCommand<any>(Commands.backupConfig());
    if (result) {
      // Transform flat anchor fields (devId1, x1, y1, z1, etc.) to anchors array
      const anchors = flatToAnchors(result.uwb, result.uwb?.anchorCount || 0);
      const config: DeviceConfig = {
        ...result,
        uwb: { ...result.uwb, anchors }
      };
      setConfig(config);
    }
  };

  const loadSavedConfigs = async () => {
    const result = await sendCommand<{ activeConfig?: string; configs: { name: string }[] }>(
      Commands.listConfigs()
    );
    if (result) {
      setSavedConfigs(result.configs.map(c => c.name));
      setActiveConfig(result.activeConfig || null);
    }
  };

  const handleSave = async () => {
    await sendCommand(Commands.saveConfig());
    alert('Configuration saved to device');
  };

  const handleSaveAs = async () => {
    const name = prompt('Configuration name:');
    if (name) {
      await sendCommand(Commands.saveConfigAs(name));
      await loadSavedConfigs();
    }
  };

  const handleLoadNamed = async (name: string) => {
    await sendCommand(Commands.loadConfigNamed(name));
    await loadConfig();
  };

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <h3>Config: {device.id}</h3>
            <button className={styles.closeBtn} onClick={onClose}>×</button>
          </div>
          <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={loading}>Save</button>
              <button className={styles.btnSecondary} onClick={handleSaveAs} disabled={loading}>Save As...</button>
              <button className={styles.btnSecondary} onClick={loadConfig} disabled={loading}>Reload</button>
          </div>
        </div>

        <div className={styles.content}>
          {savedConfigs.length > 0 && (
            <div className={styles.saved}>
              <h4>Saved Configurations</h4>
              <div className={styles.tagList}>
                  {savedConfigs.map(name => (
                    <button
                      key={name}
                      onClick={() => handleLoadNamed(name)}
                      className={`${styles.tag} ${name === activeConfig ? styles.tagActive : ''}`}
                    >
                      {name}
                      {name === activeConfig && <span className={styles.activeIndicator}>Active</span>}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {config ? (
            <ConfigEditor
              config={config}
              onChange={setConfig}
              onApply={async (group, name, value) => {
                await sendCommand(Commands.writeParam(group, name, value));
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              {loading ? 'Loading configuration...' : 'Failed to load configuration'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}