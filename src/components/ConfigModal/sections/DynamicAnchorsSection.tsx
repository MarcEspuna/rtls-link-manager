import { useState } from 'react';
import { DeviceConfig, Device, AnchorLayout } from '@shared/types';
import { Commands } from '@shared/commands';
import { getAnchorWriteCommands, validateStaticTagAnchorList } from '@shared/anchors';
import { LayoutSelector } from '../../SystemConfig';
import { getDynamicAnchorConfigCommands, getDynamicAnchorEnableCommands, validateDynamicAnchorEnable } from './dynamicAnchorCommands';
import styles from '../ConfigModal.module.css';

interface DynamicAnchorsSectionProps {
  config: DeviceConfig;
  device: Device;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
  onApplyBatch: (commands: string[]) => Promise<void>;
}

export function DynamicAnchorsSection({
  config,
  device,
  onChange,
  onApply,
  onApplyBatch,
}: DynamicAnchorsSectionProps) {
  const [dynamicApplyError, setDynamicApplyError] = useState<string | null>(null);
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

  const handleDynamicEnabledChange = async (enabled: number) => {
    setDynamicApplyError(null);
    if (enabled === 1) {
      const dynamicError = validateDynamicAnchorEnable(config);
      if (dynamicError) {
        setDynamicApplyError(dynamicError);
        return;
      }
      try {
        await onApplyBatch(getDynamicAnchorEnableCommands(config));
        onChange('uwb', 'dynamicAnchorPosEnabled', 1);
      } catch (e) {
        setDynamicApplyError(e instanceof Error ? e.message : 'Failed to enable dynamic anchors');
      }
      return;
    }

    try {
      const commands: string[] = [];
      if (config.uwb.mode === 4) {
        const anchors = config.uwb.anchors || [];
        const anchorError = validateStaticTagAnchorList(anchors, config.uwb.use2DEstimator ?? 1);
        if (anchorError) {
          setDynamicApplyError(`Configure valid static anchors before disabling dynamic positioning: ${anchorError}`);
          return;
        }
        commands.push(...getAnchorWriteCommands(anchors)
          .map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value)));
      }
      commands.push(Commands.writeParam('uwb', 'dynamicAnchorPosEnabled', 0));
      await onApplyBatch(commands);
      onChange('uwb', 'dynamicAnchorPosEnabled', 0);
    } catch (e) {
      setDynamicApplyError(e instanceof Error ? e.message : 'Failed to disable dynamic anchors');
    }
  };

  const handleEstimatorModeChange = async (use2DEstimator: 0 | 1) => {
    setDynamicApplyError(null);
    const nextConfig: DeviceConfig = {
      ...config,
      uwb: {
        ...config.uwb,
        use2DEstimator,
      },
    };
    const dynamicError = validateDynamicAnchorEnable(nextConfig);
    if (isEnabled && dynamicError) {
      setDynamicApplyError(dynamicError);
      return;
    }

    try {
      if (isEnabled) {
        await onApplyBatch([
          ...getDynamicAnchorConfigCommands(nextConfig),
          Commands.writeParam('uwb', 'use2DEstimator', use2DEstimator),
        ]);
      } else if (config.uwb.mode === 4) {
        const anchorError = validateStaticTagAnchorList(config.uwb.anchors || [], use2DEstimator);
        if (anchorError) {
          setDynamicApplyError(`Configure valid static anchors before switching estimator mode: ${anchorError}`);
          return;
        }
        await onApply('uwb', 'use2DEstimator', use2DEstimator);
      } else {
        await onApply('uwb', 'use2DEstimator', use2DEstimator);
      }
      onChange('uwb', 'use2DEstimator', use2DEstimator);
    } catch (e) {
      setDynamicApplyError(e instanceof Error ? e.message : 'Failed to apply estimator mode');
    }
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Dynamic Anchor Positioning</h3>
        <p>
          Calculate anchor positions automatically from inter-anchor ToF measurements
          instead of using manually configured static coordinates.
        </p>

        <div className={styles.field}>
          <label>Estimator Mode</label>
          <select
            value={config.uwb.use2DEstimator ?? 1}
            onChange={(e) => {
              void handleEstimatorModeChange(Number(e.target.value) as 0 | 1);
            }}
          >
            <option value={1}>2D / 4 anchors</option>
            <option value={0}>3D / 8 anchors</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Dynamic Positioning</label>
          <select
            value={config.uwb.dynamicAnchorPosEnabled ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              void handleDynamicEnabledChange(val);
            }}
          >
            <option value={0}>Disabled (Use Static Positions)</option>
            <option value={1}>Enabled (Calculate from Distances)</option>
          </select>
          {dynamicApplyError && <div className={styles.fieldError}>{dynamicApplyError}</div>}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Configuration</h3>
        <div className={styles.field}>
          <label>Anchor Layout</label>
          <LayoutSelector
            value={config.uwb.anchorLayout ?? AnchorLayout.RECTANGULAR_A1X_A3Y}
            onChange={(layout) => {
              onChange('uwb', 'anchorLayout', layout);
              onApply('uwb', 'anchorLayout', layout);
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Lower Plane Height (m)</label>
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
            <label>Plane Separation (m)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={config.uwb.anchorPlaneSeparation ?? 0}
              onChange={(e) => onChange('uwb', 'anchorPlaneSeparation', safeParseFloat(e.target.value, 0))}
              onBlur={(e) => {
                const val = safeParseFloat(e.target.value, 0);
                const nextConfig: DeviceConfig = {
                  ...config,
                  uwb: {
                    ...config.uwb,
                    anchorPlaneSeparation: val,
                  },
                };
                const dynamicError = isEnabled ? validateDynamicAnchorEnable(nextConfig) : null;
                if (dynamicError) {
                  setDynamicApplyError(dynamicError);
                  return;
                }
                setDynamicApplyError(null);
                onChange('uwb', 'anchorPlaneSeparation', val);
                onApply('uwb', 'anchorPlaneSeparation', val);
              }}
              placeholder="Vertical offset for 3D anchors"
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

      {isEnabled && (
        <>
          <div className={styles.section}>
            <h3>Calculated Positions</h3>
            <p>
              Positions calculated from inter-anchor ToF measurements. Lock an anchor to preserve
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
