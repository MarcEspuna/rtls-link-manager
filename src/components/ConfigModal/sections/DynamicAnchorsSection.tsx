import { DeviceConfig, Device, AnchorLayout } from '@shared/types';
import { LayoutSelector } from '../../SystemConfig';
import styles from '../ConfigModal.module.css';

interface DynamicAnchorsSectionProps {
  config: DeviceConfig;
  device: Device;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
}

export function DynamicAnchorsSection({
  config,
  device,
  onChange,
  onApply,
}: DynamicAnchorsSectionProps) {
  const safeParseFloat = (value: string, fallback: number): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  };

  const safeParseInt = (value: string, fallback: number): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  const isEnabled = config.uwb.dynamicAnchorPosEnabled === 1;
  const lockedMask = config.uwb.anchorPosLocked ?? 0;

  const isAnchorLocked = (anchorId: number): boolean => {
    return (lockedMask & (1 << anchorId)) !== 0;
  };

  const handleLockToggle = async (anchorId: number) => {
    const newMask = lockedMask ^ (1 << anchorId);
    onChange('uwb', 'anchorPosLocked', newMask);
    await onApply('uwb', 'anchorPosLocked', newMask);
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Dynamic Anchor Positioning</h3>
        <p>
          Calculate anchor positions automatically from inter-anchor TWR measurements
          instead of using manually configured static coordinates.
        </p>

        <div className={styles.field}>
          <label>Dynamic Positioning</label>
          <select
            value={config.uwb.dynamicAnchorPosEnabled ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange('uwb', 'dynamicAnchorPosEnabled', val);
              onApply('uwb', 'dynamicAnchorPosEnabled', val);
            }}
          >
            <option value={0}>Disabled (Use Static Positions)</option>
            <option value={1}>Enabled (Calculate from Distances)</option>
          </select>
        </div>
      </div>

      {isEnabled && (
        <>
          <div className={styles.section}>
            <h3>Configuration</h3>
            <div className={styles.field}>
              <label>Anchor Layout</label>
              <LayoutSelector
                value={config.uwb.anchorLayout ?? AnchorLayout.RECTANGULAR_0_ORIGIN}
                onChange={(layout) => {
                  onChange('uwb', 'anchorLayout', layout);
                  onApply('uwb', 'anchorLayout', layout);
                }}
              />
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label>Anchor Height (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.uwb.anchorHeight ?? 0}
                  onChange={(e) => onChange('uwb', 'anchorHeight', safeParseFloat(e.target.value, 0))}
                  onBlur={(e) => {
                    const val = safeParseFloat(e.target.value, 0);
                    onChange('uwb', 'anchorHeight', val);
                    onApply('uwb', 'anchorHeight', val);
                  }}
                  placeholder="Height above ground (NED: Z = -height)"
                />
              </div>
              <div className={styles.field}>
                <label>Distance Averaging Samples</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="500"
                  value={config.uwb.distanceAvgSamples ?? 50}
                  onChange={(e) => onChange('uwb', 'distanceAvgSamples', safeParseInt(e.target.value, 50))}
                  onBlur={(e) => {
                    const val = safeParseInt(e.target.value, 50);
                    onChange('uwb', 'distanceAvgSamples', val);
                    onApply('uwb', 'distanceAvgSamples', val);
                  }}
                  placeholder="Samples to average (default: 50)"
                />
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3>Calculated Positions</h3>
            <p>
              Positions calculated from inter-anchor TWR measurements. Lock an anchor to preserve
              its calculated position even if new measurements arrive.
            </p>

            {device.dynamicAnchors && device.dynamicAnchors.length > 0 ? (
              <div className={styles.positionsGrid}>
                <div className={styles.positionsGridHeader}>Anchor</div>
                <div className={styles.positionsGridHeader}>X (m)</div>
                <div className={styles.positionsGridHeader}>Y (m)</div>
                <div className={styles.positionsGridHeader}>Z (m)</div>
                <div className={styles.positionsGridHeader}>Lock</div>

                {device.dynamicAnchors.map((anchor) => {
                  const locked = isAnchorLocked(anchor.id);
                  return (
                    <div key={anchor.id} className={styles.positionsGridRow}>
                      <span className={styles.anchorId}>A{anchor.id}</span>
                      <span className={styles.posValue}>{anchor.x.toFixed(2)}</span>
                      <span className={styles.posValue}>{anchor.y.toFixed(2)}</span>
                      <span className={styles.posValue}>{anchor.z.toFixed(2)}</span>
                      <button
                        onClick={() => handleLockToggle(anchor.id)}
                        className={`${styles.lockBtn} ${locked ? styles.lockBtnLocked : ''}`}
                        title={locked ? 'Unlock anchor position' : 'Lock anchor position'}
                      >
                        {locked ? '🔒' : '🔓'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.waitingMessage}>
                <strong>Waiting for calculated positions...</strong>
                <p style={{ marginTop: 8, marginBottom: 0 }}>
                  Positions will appear here once the device has collected enough
                  inter-anchor distance measurements.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
