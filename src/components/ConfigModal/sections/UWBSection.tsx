import { useState } from 'react';
import { DeviceConfig } from '@shared/types';
import styles from '../ConfigModal.module.css';

interface UWBSectionProps {
  config: DeviceConfig;
  onChange: (group: keyof DeviceConfig, name: string, value: any) => void;
  onApply: (group: string, name: string, value: any) => Promise<void>;
  isExpertMode?: boolean;
}

export function UWBSection({ config, onChange, onApply, isExpertMode = false }: UWBSectionProps) {
  const [shortAddrError, setShortAddrError] = useState<string | null>(null);

  const validateShortAddr = (value: string): string | null => {
    if (!value) return 'Device ID is required';
    if (!/^\d{1,2}$/.test(value)) return 'Use 1-2 digits (0-99)';
    return null;
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>UWB Configuration</h3>
        <div className={styles.field}>
          <label>Operation Mode</label>
          <select
            value={config.uwb.mode}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange('uwb', 'mode', val);
              onApply('uwb', 'mode', val);
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
          <input
            value={config.uwb.devShortAddr || ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange('uwb', 'devShortAddr', val);
              setShortAddrError(validateShortAddr(val));
            }}
            onBlur={(e) => {
              const val = e.target.value;
              const error = validateShortAddr(val);
              setShortAddrError(error);
              if (error) return;
              onApply('uwb', 'devShortAddr', val);
            }}
            placeholder="e.g. 0"
            className={shortAddrError ? styles.inputError : undefined}
          />
          {shortAddrError && <div className={styles.fieldError}>{shortAddrError}</div>}
        </div>
      </div>

      {/* UWB Radio Settings - Expert Mode + TDoA modes only */}
      {isExpertMode && (config.uwb.mode === 3 || config.uwb.mode === 4) && (
        <div className={styles.section}>
          <h3>UWB Radio Settings</h3>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Channel</label>
              <select
                value={config.uwb.channel ?? 2}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange('uwb', 'channel', val);
                  onApply('uwb', 'channel', val);
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
                  onChange('uwb', 'dwMode', val);
                  onApply('uwb', 'dwMode', val);
                }}
              >
                <option value={0}>Short Data, Fast Accuracy</option>
                <option value={1}>Long Data, Fast Accuracy</option>
                <option value={2}>Short Data, Fast Low Power</option>
                <option value={3}>Long Data, Fast Low Power</option>
                <option value={4}>Short Data, Mid Accuracy</option>
                <option value={5}>Long Data, Mid Accuracy</option>
                <option value={6}>Long Data, Range Accuracy</option>
                <option value={7}>Long Data, Range Low Power</option>
              </select>
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>TX Power</label>
              <select
                value={config.uwb.txPowerLevel ?? 3}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange('uwb', 'txPowerLevel', val);
                  onApply('uwb', 'txPowerLevel', val);
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
                  onChange('uwb', 'smartPowerEnable', val);
                  onApply('uwb', 'smartPowerEnable', val);
                }}
              >
                <option value={0}>Disabled (Default)</option>
                <option value={1}>Enabled</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TDMA Schedule - Expert Mode + TDoA Anchor only */}
      {isExpertMode && config.uwb.mode === 3 && (
        <div className={styles.section}>
          <h3>TDoA TDMA Schedule</h3>
          <p>
            Configure the number of active TDMA slots and the slot duration to
            increase update rate when using fewer anchors. Use 0 to keep legacy
            defaults.
          </p>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Active Slots</label>
              <select
                value={config.uwb.tdoaSlotCount ?? 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange('uwb', 'tdoaSlotCount', val);
                  onApply('uwb', 'tdoaSlotCount', val);
                }}
              >
                <option value={0}>Default (8 slots)</option>
                <option value={2}>2 slots</option>
                <option value={3}>3 slots</option>
                <option value={4}>4 slots</option>
                <option value={5}>5 slots</option>
                <option value={6}>6 slots</option>
                <option value={7}>7 slots</option>
                <option value={8}>8 slots</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Slot Duration (us)</label>
              <input
                type="number"
                min={0}
                step={50}
                value={config.uwb.tdoaSlotDurationUs ?? 0}
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = raw === '' ? 0 : Number(raw);
                  onChange('uwb', 'tdoaSlotDurationUs', val);
                }}
                onBlur={(e) => {
                  const raw = e.target.value;
                  const val = raw === '' ? 0 : Number(raw);
                  if (!Number.isFinite(val) || !Number.isInteger(val) || val < 0) return;
                  onApply('uwb', 'tdoaSlotDurationUs', val);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
