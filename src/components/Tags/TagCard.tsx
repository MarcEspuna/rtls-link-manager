import { useState } from 'react';
import { Device, logLevelToShort } from '@shared/types';
import { Commands } from '@shared/commands';
import { useDeviceCommand } from '../../hooks/useDeviceWebSocket';
import { StatusBadge } from '../common/StatusBadge';
import { HealthBadge } from '../common/HealthBadge';
import { calculateDeviceHealth } from '../../lib/healthStatus';
import styles from './TagCard.module.css';

interface TagCardProps {
  device: Device;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onConfigure: () => void;
  isExpertMode?: boolean;
}

export function TagCard({ device, selected, onSelect, onConfigure, isExpertMode = false }: TagCardProps) {
  const { sendCommand, loading } = useDeviceCommand(device.ip);
  const [ledState, setLedState] = useState<boolean | null>(null);
  const health = calculateDeviceHealth(device);

  const handleToggleLed = async () => {
    const result = await sendCommand<{ success: boolean; led2State: boolean }>(
      Commands.toggleLed()
    );
    if (result?.success) {
      setLedState(result.led2State);
    }
  };

  const handleReboot = async () => {
    if (confirm(`Reboot tag ${device.ip}?`)) {
      await sendCommand(Commands.reboot());
    }
  };

  const handleStart = async () => {
    await sendCommand(Commands.start());
  };

  // Format telemetry status with fallback for unknown
  const formatStatus = (value: boolean | undefined, trueText: string, falseText: string) => {
    if (value === undefined) return '?';
    return value ? trueText : falseText;
  };

  return (
    <div className={`${styles.card} ${selected ? styles.selected : ''}`}>
      <div className={styles.header}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <HealthBadge health={health} size="sm" />
        <span className={styles.ip}>{device.ip}</span>
        {isExpertMode && device.logLevel !== undefined && (
          <span className={styles.logBadge} title={`Compiled log level: ${device.logLevel}`}>
            {logLevelToShort(device.logLevel)}
          </span>
        )}
        <StatusBadge status={device.online ? 'online' : 'offline'} />
      </div>

      <div className={styles.info}>
        <div><span>Role:</span> {device.role}</div>
        <div><span>MAV ID:</span> {device.mavSysId}</div>
        <div><span>FW:</span> {device.firmware}</div>
      </div>

      {/* Telemetry Section */}
      <div className={styles.telemetry}>
        <div className={styles.telemetryRow}>
          <span className={styles.telemetryLabel}>Position:</span>
          <span className={device.sendingPos ? styles.statusOk : styles.statusWarn}>
            {formatStatus(device.sendingPos, 'Sending', 'Not sending')}
          </span>
        </div>
        <div className={styles.telemetryRow}>
          <span className={styles.telemetryLabel}>Anchors:</span>
          <span className={(device.anchorsSeen ?? 0) >= 3 ? styles.statusOk : styles.statusWarn}>
            {device.anchorsSeen ?? '?'}
          </span>
        </div>
        <div className={styles.telemetryRow}>
          <span className={styles.telemetryLabel}>Origin:</span>
          <span className={device.originSent ? styles.statusOk : styles.statusPending}>
            {formatStatus(device.originSent, 'Sent', 'Pending')}
          </span>
        </div>
        {device.rfEnabled !== undefined && (
          <div className={styles.telemetryRow}>
            <span className={styles.telemetryLabel}>RF:</span>
            <span className={
              !device.rfEnabled ? styles.statusMuted :
              device.rfHealthy ? styles.statusOk : styles.statusWarn
            }>
              {!device.rfEnabled ? 'Disabled' :
               device.rfHealthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
        )}
        <div className={styles.telemetryRow}>
          <span className={styles.telemetryLabel}>Rate:</span>
          <span className={
            device.avgRateCHz !== undefined && device.avgRateCHz >= 500 ? styles.statusOk :
            device.avgRateCHz !== undefined && device.avgRateCHz >= 100 ? styles.statusWarn :
            styles.statusMuted
          }>
            {device.avgRateCHz !== undefined ? `${(device.avgRateCHz / 100).toFixed(1)} Hz` : '?'}
          </span>
        </div>
        {device.minRateCHz !== undefined && device.maxRateCHz !== undefined && (
          <div className={styles.telemetryRow}>
            <span className={styles.telemetryLabel}>Rate (5s):</span>
            <span className={styles.statusMuted}>
              {(device.minRateCHz / 100).toFixed(1)}–{(device.maxRateCHz / 100).toFixed(1)} Hz
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button onClick={handleToggleLed} disabled={loading}>
          {ledState ? 'LED On' : 'LED Off'}
        </button>
        <button onClick={handleStart} disabled={loading}>
          Start
        </button>
        <button onClick={onConfigure} disabled={loading}>
          Config
        </button>
        <button onClick={handleReboot} disabled={loading}>
          Reboot
        </button>
      </div>
    </div>
  );
}
