import { useState, useEffect, useCallback } from 'react';
import { Device, DeviceConfig, LocalConfigInfo } from '@shared/types';
import { Commands } from '@shared/commands';
import { configToParams } from '@shared/configParams';
import { flatToAnchors, normalizeUwbShortAddr } from '@shared/anchors';
import { listConfigs, getConfig, saveConfig, deleteConfig } from '../../lib/tauri-api';
import {
  sendDeviceCommand as sendCommand,
  sendDeviceCommands as sendCommands,
} from '../../lib/deviceCommands';
import { ProgressBar } from '../common/ProgressBar';
import styles from './LocalConfigPanel.module.css';

// Transform flat backup-config response to normalized DeviceConfig with anchors array
const transformConfigResult = (result: any): DeviceConfig => {
  const uwb = result.uwb || {};
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

interface LocalConfigPanelProps {
  selectedDevices: Device[];
  allDevices: Device[];
}

interface BulkResult {
  device: Device;
  success: boolean;
  error?: string;
}

export function LocalConfigPanel({ selectedDevices, allDevices }: LocalConfigPanelProps) {
  const [configs, setConfigs] = useState<LocalConfigInfo[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [configPreview, setConfigPreview] = useState<DeviceConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label?: string } | null>(null);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newConfigName, setNewConfigName] = useState('');

  // Fetch list of local configs
  const fetchConfigs = useCallback(async () => {
    try {
      const data = await listConfigs();
      setConfigs(data);
    } catch (e) {
      console.error('Failed to fetch configs', e);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Load config preview when selected
  useEffect(() => {
    if (!selectedConfig) {
      setConfigPreview(null);
      return;
    }
    (async () => {
      try {
        const localConfig = await getConfig(selectedConfig);
        if (localConfig?.config) {
          setConfigPreview(localConfig.config);
        }
      } catch (e) {
        console.error('Failed to load config', e);
      }
    })();
  }, [selectedConfig]);

  // Upload config to a single device
  const uploadConfigToDevice = async (
    device: Device,
    config: DeviceConfig,
    configName: string,
    onProgress?: (step: number, total: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    const params = configToParams(config);
    const commands = [
      ...params.map(([group, name, value]) => Commands.writeParam(group, name, value)),
      Commands.saveConfigAs(configName)
    ];

    try {
      await sendCommands(device.ip, commands, { onProgress });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' };
    }
  };

  // Upload selected config to selected devices
  const handleUploadToSelected = async () => {
    if (!selectedConfig || !configPreview || selectedDevices.length === 0) return;
    if (!confirm(`Upload config "${selectedConfig}" to ${selectedDevices.length} device(s)?`)) return;

    setLoading(true);
    setResults([]);
    const totalParams = configToParams(configPreview).length + 1;
    const totalSteps = selectedDevices.length * totalParams;
    let completedSteps = 0;

    const newResults: BulkResult[] = [];

    // Execute with concurrency limit
    const CONCURRENT = 3;
    for (let i = 0; i < selectedDevices.length; i += CONCURRENT) {
      const batch = selectedDevices.slice(i, i + CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(async (device) => {
          const result = await uploadConfigToDevice(
            device,
            configPreview,
            selectedConfig,
            (step) => {
              completedSteps++;
              setProgress({
                current: completedSteps,
                total: totalSteps,
                label: `${device.id}: ${step}/${totalParams}`
              });
            }
          );
          return { device, ...result };
        })
      );
      newResults.push(...batchResults);
    }

    setResults(newResults);
    setProgress(null);
    setLoading(false);
  };

  // Activate config on all devices
  const handleActivateOnAll = async () => {
    if (!selectedConfig) return;
    if (!confirm(`Activate config "${selectedConfig}" on all ${allDevices.length} devices?`)) return;

    setLoading(true);
    setResults([]);
    setProgress({ current: 0, total: allDevices.length });

    const newResults: BulkResult[] = [];
    const CONCURRENT = 5;

    for (let i = 0; i < allDevices.length; i += CONCURRENT) {
      const batch = allDevices.slice(i, i + CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(async (device) => {
          try {
            await sendCommand(device.ip, Commands.loadConfigNamed(selectedConfig));
            return { device, success: true };
          } catch (e) {
            return {
              device,
              success: false,
              error: e instanceof Error ? e.message : 'Failed'
            };
          }
        })
      );
      newResults.push(...batchResults);
      setProgress({ current: newResults.length, total: allDevices.length });
    }

    setResults(newResults);
    setProgress(null);
    setLoading(false);
  };

  // Save config from first selected device to server
  const handleSaveFromDevice = async () => {
    if (selectedDevices.length === 0) return;
    setSaveDialogOpen(true);
  };

  const confirmSaveFromDevice = async () => {
    if (!newConfigName.trim() || selectedDevices.length === 0) return;

    // Validate name
    if (!/^[a-zA-Z0-9_-]+$/.test(newConfigName) || newConfigName.length > 64) {
      alert('Invalid name. Use only alphanumeric, dash, and underscore (max 64 chars).');
      return;
    }

    setLoading(true);
    setSaveDialogOpen(false);

    try {
      const device = selectedDevices[0];
      const rawConfig = await sendCommand<any>(device.ip, Commands.backupConfig());
      const config = transformConfigResult(rawConfig);

      // Save to local storage
      const success = await saveConfig(newConfigName, config);
      if (!success) throw new Error('Failed to save config');

      await fetchConfigs();
      setSelectedConfig(newConfigName);
      setNewConfigName('');
    } catch (e) {
      alert(`Failed to save config: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete selected config
  const handleDeleteConfig = async () => {
    if (!selectedConfig) return;
    if (!confirm(`Delete config "${selectedConfig}"?`)) return;

    try {
      await deleteConfig(selectedConfig);
      setSelectedConfig(null);
      setConfigPreview(null);
      await fetchConfigs();
    } catch (e) {
      console.error('Failed to delete config', e);
    }
  };

  return (
    <div className={styles.container}>
      <h4>Local Configurations</h4>

      <div className={styles.content}>
        <div className={styles.configList}>
          <div className={styles.listHeader}>
            <span>Saved Configs</span>
            <button
              onClick={handleSaveFromDevice}
              disabled={loading || selectedDevices.length === 0}
              title="Save config from first selected device"
            >
              + Save from Device
            </button>
          </div>

          {configs.length === 0 ? (
            <div className={styles.empty}>No saved configurations</div>
          ) : (
            <ul>
              {configs.map((c) => (
                <li
                  key={c.name}
                  className={selectedConfig === c.name ? styles.selected : ''}
                  onClick={() => setSelectedConfig(c.name)}
                >
                  <span className={styles.configName}>{c.name}</span>
                  <span className={styles.configDate}>
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.preview}>
          {configPreview ? (
            <>
              <div className={styles.previewHeader}>
                <span>{selectedConfig}</span>
                <button onClick={handleDeleteConfig} className={styles.deleteBtn}>
                  Delete
                </button>
              </div>
              <pre>{JSON.stringify(configPreview, null, 2)}</pre>
            </>
          ) : (
            <div className={styles.empty}>Select a config to preview</div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleUploadToSelected}
          disabled={loading || !selectedConfig || selectedDevices.length === 0}
        >
          Upload to Selected ({selectedDevices.length})
        </button>
        <button
          onClick={handleActivateOnAll}
          disabled={loading || !selectedConfig || allDevices.length === 0}
        >
          Activate on All ({allDevices.length})
        </button>
      </div>

      {progress && (
        <ProgressBar
          current={progress.current}
          total={progress.total}
          label={progress.label}
        />
      )}

      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((r) => (
            <div key={r.device.ip} className={r.success ? styles.success : styles.error}>
              {r.success ? 'OK' : 'FAIL'} {r.device.id} ({r.device.ip})
              {r.error && <span className={styles.errorMsg}>{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {saveDialogOpen && (
        <div className={styles.dialog}>
          <div className={styles.dialogContent}>
            <h5>Save Configuration</h5>
            <p>Save config from device {selectedDevices[0]?.id}</p>
            <input
              type="text"
              placeholder="Config name"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              autoFocus
            />
            <div className={styles.dialogActions}>
              <button onClick={() => setSaveDialogOpen(false)}>Cancel</button>
              <button onClick={confirmSaveFromDevice} disabled={!newConfigName.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
