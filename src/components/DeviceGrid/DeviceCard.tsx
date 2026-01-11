import { useState } from 'react';
import { Device } from '@shared/types';
import { Commands } from '@shared/commands';
import { useDeviceCommand } from '../../hooks/useDeviceWebSocket';
import { StatusBadge } from '../common/StatusBadge';
import styles from './DeviceCard.module.css';

interface DeviceCardProps {
  device: Device;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onConfigure: () => void;
}

export function DeviceCard({ device, selected, onSelect, onConfigure }: DeviceCardProps) {
  const { sendCommand, loading } = useDeviceCommand(device.ip);
  const [ledState, setLedState] = useState<boolean | null>(null);

  const handleToggleLed = async () => {
    const result = await sendCommand<{ success: boolean; led2State: boolean }>(
      Commands.toggleLed()
    );
    if (result?.success) {
      setLedState(result.led2State);
    }
  };

  const handleReboot = async () => {
    if (confirm(`Reboot device ${device.id}?`)) {
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
        <h3>{device.id}</h3>
        <StatusBadge status={device.online ? 'online' : 'offline'} />
      </div>

      <div className={styles.info}>
        <div><span>Role:</span> {device.role}</div>
        <div><span>IP:</span> {device.ip}</div>
        <div><span>MAC:</span> {device.mac}</div>
        <div><span>UWB:</span> {device.uwbShort}</div>
        <div><span>MAV ID:</span> {device.mavSysId}</div>
        <div><span>FW:</span> {device.firmware}</div>
      </div>

      {device.role === 'tag_tdoa' && (
        <div className={styles.telemetry}>
          <span className={device.sendingPos === undefined ? styles.statusUnknown : (device.sendingPos ? styles.statusOk : styles.statusWarn)}>
            {device.sendingPos === undefined ? '?' : (device.sendingPos ? 'Sending' : 'Not sending')}
          </span>
          <span>Anchors: {device.anchorsSeen ?? '?'}</span>
          <span className={device.originSent === undefined ? styles.statusUnknown : (device.originSent ? styles.statusOk : styles.statusPending)}>
            Origin: {device.originSent === undefined ? '?' : (device.originSent ? 'Sent' : 'Pending')}
          </span>
          <span className={
            device.rfEnabled === undefined ? styles.statusUnknown :
            !device.rfEnabled ? styles.statusPending :
            device.rfHealthy ? styles.statusOk : styles.statusWarn
          }>
            RF: {device.rfEnabled === undefined ? '?' :
                 !device.rfEnabled ? 'Disabled' :
                 device.rfHealthy ? 'Healthy' : 'Unhealthy'}
          </span>
        </div>
      )}

      <div className={styles.actions}>
        <button onClick={handleToggleLed} disabled={loading}>
          {ledState ? '💡 LED On' : '⚫ LED Off'}
        </button>
        <button onClick={onConfigure} disabled={loading}>
          ⚙️ Config
        </button>
        <button onClick={handleReboot} disabled={loading}>
          🔄 Reboot
        </button>
      </div>
    </div>
  );
}
