import { useState } from 'react';
import { Device } from '@shared/types';
import { Commands } from '@shared/commands';
import { executeBulkCommand, BulkCommandResult } from '../../lib/deviceCommands';
import { ProgressBar } from '../common/ProgressBar';
import { FirmwareUpdate } from '../FirmwareUpdate';
import styles from './BulkActions.module.css';

interface BulkActionsProps {
  devices: Device[];
}

export function BulkActions({ devices }: BulkActionsProps) {
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<BulkCommandResult[]>([]);
  const [showFirmwareUpdate, setShowFirmwareUpdate] = useState(false);

  const executeBulk = async (command: string, options?: { confirm?: string }) => {
    if (options?.confirm && !confirm(options.confirm)) return;

    setProgress({ current: 0, total: devices.length });
    setResults([]);

    const newResults = await executeBulkCommand(devices, command, {
      concurrency: 5,
      onProgress: (completed, total) => setProgress({ current: completed, total }),
    });

    setResults(newResults);
    setProgress(null);
  };

  return (
    <div className={styles.container}>
      <h4>Bulk Actions ({devices.length} devices)</h4>

      <div className={styles.actions}>
        <button onClick={() => executeBulk(Commands.toggleLed())}>
          Toggle LEDs
        </button>
        <button onClick={() => executeBulk(Commands.start())}>
          Start UWB
        </button>
        <button
          onClick={() =>
            executeBulk(Commands.reboot(), {
              confirm: `Reboot ${devices.length} devices?`,
            })
          }
        >
          Reboot All
        </button>
        <button onClick={() => setShowFirmwareUpdate(!showFirmwareUpdate)}>
          {showFirmwareUpdate ? 'Hide Firmware Update' : 'Firmware Update'}
        </button>
      </div>

      {showFirmwareUpdate && (
        <div style={{ marginTop: 16 }}>
          <FirmwareUpdate devices={devices} />
        </div>
      )}

      {progress && <ProgressBar current={progress.current} total={progress.total} />}

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
    </div>
  );
}
