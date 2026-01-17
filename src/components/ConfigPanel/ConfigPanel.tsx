import { useState, useEffect } from 'react';
import { Device, DeviceConfig } from '@shared/types';
import { Commands } from '@shared/commands';
import { flatToAnchors, getAnchorWriteCommands, normalizeUwbShortAddr } from '@shared/anchors';
import { useDeviceCommand } from '../../hooks/useDeviceWebSocket';
import { ConfigEditor } from './ConfigEditor';
import { FirmwareUpdate } from '../FirmwareUpdate';
import { LogTerminal } from '../ExpertMode/LogTerminal';
import styles from './ConfigPanel.module.css';

interface ConfigPanelProps {
  device: Device;
  onClose: () => void;
  isExpertMode?: boolean;
}

export function ConfigPanel({ device, onClose, isExpertMode = false }: ConfigPanelProps) {
  const { sendCommand, sendCommands, loading, close } = useDeviceCommand(device.ip, { mode: 'persistent' });
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [activeConfig, setActiveConfig] = useState<string | null>(null);
  const [previewingConfig, setPreviewingConfig] = useState<string | null>(null);
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [showLogTerminal, setShowLogTerminal] = useState(false);

  const findCommandError = (responses: string[] | null): string | null => {
    if (!responses) return 'No response from device';
    for (const response of responses) {
      if (/error|fail|invalid|not found/i.test(response)) {
        return response;
      }
    }
    return null;
  };

  useEffect(() => {
    loadConfig();
    loadSavedConfigs();
    return () => {
      close();
    };
  }, [device.ip, close]);

  const transformConfigResult = (result: any): DeviceConfig => {
    // Safe access to uwb object (might be missing in older firmware or error cases)
    const uwb = result.uwb || {};
    // Transform flat anchor fields (devId1, x1, y1, z1, etc.) to anchors array
    const anchors = flatToAnchors(uwb, uwb.anchorCount || 0);
    return {
      ...result,
      uwb: {
        ...uwb,
        devShortAddr: normalizeUwbShortAddr(uwb.devShortAddr),
        anchors,
      }
    };
  };

  const loadConfig = async () => {
    const result = await sendCommand<any>(Commands.backupConfig());
    if (result) {
      setConfig(transformConfigResult(result));
      setPreviewingConfig(null); // Clear preview mode when loading current config
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
    if (!config) return;
    try {
      const anchorCommands = getAnchorWriteCommands(config.uwb.anchors || [])
        .map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value));
      const batch = [...anchorCommands, Commands.saveConfig()];
      const result = await sendCommands(batch);
      const errorMessage = findCommandError(result);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
      alert('Configuration saved to device');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save configuration');
    }
  };

  const handleSaveAs = async () => {
    const name = prompt('Configuration name:');
    if (name) {
      try {
        if (config) {
          const anchorCommands = getAnchorWriteCommands(config.uwb.anchors || [])
            .map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value));
          const batch = [...anchorCommands, Commands.saveConfigAs(name)];
          const result = await sendCommands(batch);
          const errorMessage = findCommandError(result);
          if (errorMessage) {
            throw new Error(errorMessage);
          }
        } else {
          await sendCommand(Commands.saveConfigAs(name));
        }
        await loadSavedConfigs();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Failed to save configuration');
      }
    }
  };

  const handlePreviewConfig = async (name: string) => {
    const result = await sendCommand<any>(Commands.readConfigNamed(name));
    if (result && !result.error) {
      setConfig(transformConfigResult(result));
      setPreviewingConfig(name);
    } else {
      alert(result?.error || 'Failed to load configuration preview');
    }
  };

  const handleActivate = async () => {
    if (!previewingConfig) return;
    try {
      const result = await sendCommand<{ success: boolean; error?: string }>(
        Commands.loadConfigNamed(previewingConfig)
      );
      if (result?.success) {
        await loadSavedConfigs(); // Refresh active config badge
        setPreviewingConfig(null);
        alert(`Configuration "${previewingConfig}" activated successfully`);
      } else {
        throw new Error(result?.error || 'Failed to activate configuration');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to activate configuration');
    }
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
          {previewingConfig && (
            <div className={styles.previewBanner}>
              <span>Previewing: <strong>{previewingConfig}</strong></span>
              {previewingConfig !== activeConfig && (
                <button
                  className={styles.btnActivate}
                  onClick={handleActivate}
                  disabled={loading}
                >
                  Activate
                </button>
              )}
            </div>
          )}
          <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={loading || anchorBusy}>Save</button>
              <button className={styles.btnSecondary} onClick={handleSaveAs} disabled={loading || anchorBusy}>Save As...</button>
              <button className={styles.btnSecondary} onClick={loadConfig} disabled={loading || anchorBusy}>Reload</button>
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
                      onClick={() => handlePreviewConfig(name)}
                      className={`${styles.tag} ${name === activeConfig ? styles.tagActive : ''} ${name === previewingConfig ? styles.tagPreviewing : ''}`}
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
              onApplyBatch={async (commands) => {
                const result = await sendCommands(commands);
                const errorMessage = findCommandError(result);
                if (errorMessage) {
                  throw new Error(errorMessage);
                }
              }}
              onAnchorsBusyChange={setAnchorBusy}
              onAnchorsError={setAnchorError}
              anchorError={anchorError}
              isExpertMode={isExpertMode}
              onOpenLogTerminal={() => setShowLogTerminal(true)}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              {loading ? 'Loading configuration...' : 'Failed to load configuration'}
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <FirmwareUpdate device={device} />
          </div>
        </div>
      </div>

      {showLogTerminal && (
        <LogTerminal
          deviceIp={device.ip}
          onClose={() => setShowLogTerminal(false)}
        />
      )}
    </>
  );
}
