import { useRef } from 'react';
import { DeviceConfig, AnchorConfig } from '@shared/types';
import { Commands } from '@shared/commands';
import { getAnchorWriteCommands } from '@shared/anchors';
import { AnchorListEditor } from '../../ConfigPanel/AnchorListEditor';
import styles from '../ConfigModal.module.css';

interface AnchorListSectionProps {
  config: DeviceConfig;
  setConfig: (config: DeviceConfig) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
  onApplyBatch: (commands: string[]) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  anchorError: string | null;
}

export function AnchorListSection({
  config,
  setConfig,
  onApply,
  onApplyBatch,
  onBusyChange,
  onError,
  anchorError,
}: AnchorListSectionProps) {
  const anchorApplyRef = useRef<Promise<void> | null>(null);
  const pendingAnchorsRef = useRef<AnchorConfig[] | null>(null);

  const safeParseFloat = (value: string, fallback: number): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  };

  const handleAnchorsChange = (newAnchors: AnchorConfig[]) => {
    setConfig({
      ...config,
      uwb: {
        ...config.uwb,
        anchors: newAnchors,
        anchorCount: newAnchors.length,
      },
    });
  };

  const handleAnchorsApply = async (newAnchors: AnchorConfig[]) => {
    pendingAnchorsRef.current = newAnchors;
    if (anchorApplyRef.current) {
      return;
    }

    const run = (async () => {
      onBusyChange(true);
      onError(null);
      while (pendingAnchorsRef.current) {
        const anchorsToApply = pendingAnchorsRef.current;
        pendingAnchorsRef.current = null;
        const commands = getAnchorWriteCommands(anchorsToApply);
        const batch = commands.map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value));
        try {
          await onApplyBatch(batch);
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Failed to write anchors');
        }
      }
    })();

    anchorApplyRef.current = run;
    try {
      await run;
    } finally {
      anchorApplyRef.current = null;
      onBusyChange(false);
    }
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Anchor List</h3>
        <p>Configure the positions of anchors in your system. Positions use NED (North-East-Down) coordinates in meters.</p>
        <AnchorListEditor
          anchors={config.uwb.anchors || []}
          onChange={handleAnchorsChange}
          onApply={handleAnchorsApply}
        />
        {anchorError && (
          <div className={styles.fieldError} style={{ marginTop: 8 }}>{anchorError}</div>
        )}
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
          Count: {config.uwb.anchorCount || 0}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Origin / Geo-Reference</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Origin Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={config.uwb.originLat || 0}
              onChange={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.originLat || 0);
                setConfig({ ...config, uwb: { ...config.uwb, originLat: val } });
              }}
              onBlur={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.originLat || 0);
                setConfig({ ...config, uwb: { ...config.uwb, originLat: val } });
                onApply('uwb', 'originLat', val);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>Origin Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={config.uwb.originLon || 0}
              onChange={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.originLon || 0);
                setConfig({ ...config, uwb: { ...config.uwb, originLon: val } });
              }}
              onBlur={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.originLon || 0);
                setConfig({ ...config, uwb: { ...config.uwb, originLon: val } });
                onApply('uwb', 'originLon', val);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>Origin Altitude (m)</label>
            <input
              type="number"
              step="0.1"
              value={config.uwb.originAlt || 0}
              onChange={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.originAlt || 0);
                setConfig({ ...config, uwb: { ...config.uwb, originAlt: val } });
              }}
              onBlur={(e) => {
                const val = safeParseFloat(e.target.value, config.uwb.originAlt || 0);
                setConfig({ ...config, uwb: { ...config.uwb, originAlt: val } });
                onApply('uwb', 'originAlt', val);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
