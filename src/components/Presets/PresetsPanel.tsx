import { useState, useEffect, useCallback } from 'react';
import {
  Device,
  Preset,
  PresetInfo,
  PresetType,
  isTagRole,
} from '@shared/types';
import {
  backupDevicePreset,
  deletePreset,
  getPreset,
  listPresets,
  onDeviceOperationProgress,
  uploadPresetToDevices,
} from '../../lib/tauri-api';
import { ProgressBar } from '../common/ProgressBar';
import styles from './PresetsPanel.module.css';

interface PresetsPanelProps {
  selectedDevices: Device[];
}

interface PresetUploadResult {
  ip: string;
  success: boolean;
  error?: string;
}

export function PresetsPanel({ selectedDevices }: PresetsPanelProps) {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [presetData, setPresetData] = useState<Preset | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label?: string } | null>(null);
  const [results, setResults] = useState<PresetUploadResult[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveType, setSaveType] = useState<PresetType>('full');
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');

  // Fetch presets list
  const fetchPresets = useCallback(async () => {
    try {
      const data = await listPresets();
      setPresets(data);
    } catch (e) {
      console.error('Failed to fetch presets', e);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Load preset data when selected
  useEffect(() => {
    if (!selectedPreset) {
      setPresetData(null);
      return;
    }
    (async () => {
      try {
        const data = await getPreset(selectedPreset);
        if (data) {
          setPresetData(data);
        }
      } catch (e) {
        console.error('Failed to load preset', e);
      }
    })();
  }, [selectedPreset]);

  // Upload preset to selected devices
  const handleUploadToSelected = async () => {
    if (!selectedPreset || !presetData || selectedDevices.length === 0) return;

    const targetDevices =
      presetData.type === 'locations'
        ? selectedDevices.filter((d) => isTagRole(d.role))
        : selectedDevices;

    if (targetDevices.length === 0) {
      alert(
        presetData.type === 'locations'
          ? 'No tags selected. Location presets can only be uploaded to tags.'
          : 'No devices selected.'
      );
      return;
    }

    const typeLabel = presetData.type === 'locations' ? 'location preset' : 'full preset';
    if (!confirm(`Upload ${typeLabel} "${selectedPreset}" to ${targetDevices.length} device(s)?`)) {
      return;
    }

    setLoading(true);
    setResults([]);
    const operationId = `upload-preset-${Date.now()}`;
    const unlisten = await onDeviceOperationProgress((event) => {
      if (event.operationId === operationId) {
        setProgress({
          current: event.completed,
          total: event.total,
          label: event.ip,
        });
      }
    });

    try {
      const backendResults = await uploadPresetToDevices(
        targetDevices.map((device) => device.ip),
        presetData,
        { concurrency: 3, operationId }
      );
      setResults(backendResults.map((result) => ({
        ip: result.ip,
        success: result.success,
        error: result.error,
      })));
    } finally {
      unlisten();
      setProgress(null);
      setLoading(false);
    }
  };

  // Save preset from device
  const handleSaveFromDevice = async () => {
    if (selectedDevices.length === 0) return;
    setSaveDialogOpen(true);
    setSaveType('full');
    setNewPresetName('');
    setNewPresetDescription('');
  };

  const confirmSavePreset = async () => {
    if (!newPresetName.trim() || selectedDevices.length === 0) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(newPresetName) || newPresetName.length > 64) {
      alert('Invalid name. Use only alphanumeric, dash, and underscore (max 64 chars).');
      return;
    }

    setLoading(true);
    setSaveDialogOpen(false);

    try {
      const device = selectedDevices[0];
      const success = await backupDevicePreset(
        device.ip,
        newPresetName,
        newPresetDescription || undefined,
        saveType
      );
      if (!success) throw new Error('Failed to save preset');

      await fetchPresets();
      setSelectedPreset(newPresetName);
      setNewPresetName('');
      setNewPresetDescription('');
    } catch (e) {
      alert(`Failed to save preset: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete preset
  const handleDeletePreset = async () => {
    if (!selectedPreset) return;
    if (!confirm(`Delete preset "${selectedPreset}"?`)) return;

    try {
      await deletePreset(selectedPreset);
      setSelectedPreset(null);
      setPresetData(null);
      await fetchPresets();
    } catch (e) {
      console.error('Failed to delete preset', e);
    }
  };

  const getPresetTypeLabel = (type: PresetType) => {
    return type === 'full' ? 'Full Config' : 'Locations';
  };

  const tagsOnly = selectedDevices.filter((d) => isTagRole(d.role));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Presets</h2>
        <button
          onClick={handleSaveFromDevice}
          disabled={loading || selectedDevices.length === 0}
          className={styles.btnPrimary}
        >
          + Save from Device
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.presetList}>
          <div className={styles.listHeader}>Saved Presets</div>
          {presets.length === 0 ? (
            <div className={styles.empty}>No saved presets</div>
          ) : (
            <ul>
              {presets.map((p) => (
                <li
                  key={p.name}
                  className={selectedPreset === p.name ? styles.selected : ''}
                  onClick={() => setSelectedPreset(p.name)}
                >
                  <span className={styles.presetName}>{p.name}</span>
                  <span className={`${styles.presetType} ${p.type === 'full' ? styles.typeFull : styles.typeLocations}`}>
                    {getPresetTypeLabel(p.type)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.preview}>
          {presetData ? (
            <>
              <div className={styles.previewHeader}>
                <div>
                  <span className={styles.presetNameLarge}>{presetData.name}</span>
                  <span className={`${styles.presetTypeBadge} ${presetData.type === 'full' ? styles.typeFull : styles.typeLocations}`}>
                    {getPresetTypeLabel(presetData.type)}
                  </span>
                </div>
                <button onClick={handleDeletePreset} className={styles.deleteBtn}>
                  Delete
                </button>
              </div>
              {presetData.description && (
                <p className={styles.description}>{presetData.description}</p>
              )}
              <pre className={styles.previewJson}>
                {JSON.stringify(
                  presetData.type === 'full' ? presetData.config : presetData.locations,
                  null,
                  2
                )}
              </pre>
            </>
          ) : (
            <div className={styles.empty}>Select a preset to preview</div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleUploadToSelected}
          disabled={loading || !selectedPreset || selectedDevices.length === 0}
          className={styles.btnPrimary}
        >
          Upload to Selected ({presetData?.type === 'locations' ? `${tagsOnly.length} tags` : selectedDevices.length})
        </button>
        {presetData?.type === 'locations' && selectedDevices.length > 0 && tagsOnly.length < selectedDevices.length && (
          <span className={styles.hint}>
            Location presets upload to tags only ({selectedDevices.length - tagsOnly.length} anchors skipped)
          </span>
        )}
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
            <div key={r.ip} className={r.success ? styles.success : styles.error}>
              {r.success ? 'OK' : 'FAIL'} {r.ip}
              {r.error && <span className={styles.errorMsg}>{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {saveDialogOpen && (
        <div className={styles.dialog}>
          <div className={styles.dialogContent}>
            <h5>Save Preset</h5>
            <p>Save from device {selectedDevices[0]?.ip}</p>

            <div className={styles.dialogField}>
              <label>Preset Type</label>
              <select value={saveType} onChange={(e) => setSaveType(e.target.value as PresetType)}>
                <option value="full">Full Configuration</option>
                <option value="locations">Locations Only (anchors + origin)</option>
              </select>
            </div>

            <div className={styles.dialogField}>
              <label>Name</label>
              <input
                type="text"
                placeholder="my-preset"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.dialogField}>
              <label>Description (optional)</label>
              <input
                type="text"
                placeholder="Description..."
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
              />
            </div>

            <div className={styles.dialogActions}>
              <button onClick={() => setSaveDialogOpen(false)}>Cancel</button>
              <button onClick={confirmSavePreset} disabled={!newPresetName.trim()} className={styles.btnPrimary}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
