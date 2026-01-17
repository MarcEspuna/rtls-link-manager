import { useState } from 'react';
import { Device, logLevelToShort } from '@shared/types';
import { Commands } from '@shared/commands';
import { useDeviceCommand } from '../../hooks/useDeviceWebSocket';
import { StatusBadge } from '../common/StatusBadge';
import { HealthBadge } from '../common/HealthBadge';
import { calculateDeviceHealth } from '../../lib/healthStatus';
import styles from './AnchorCard.module.css';

interface AnchorCardProps {
  device: Device;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onConfigure: () => void;
  isExpertMode?: boolean;
}

export function AnchorCard({ device, selected, onSelect, onConfigure, isExpertMode = false }: AnchorCardProps) {
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
    if (confirm(`Reboot anchor ${device.ip}?`)) {
      await sendCommand(Commands.reboot());
    }
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
        <div><span>MAC:</span> {device.mac}</div>
        <div><span>FW:</span> {device.firmware}</div>
      </div>

      <div className={styles.actions}>
        <button onClick={handleToggleLed} disabled={loading}>
          {ledState ? 'LED On' : 'LED Off'}
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
