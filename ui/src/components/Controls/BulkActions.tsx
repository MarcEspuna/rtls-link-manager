import { useState } from 'react';
import { Device } from '@shared/types';
import { Commands } from '@shared/commands';
import { ProgressBar } from '../common/ProgressBar';
import styles from './BulkActions.module.css';

interface BulkActionsProps {
  devices: Device[];
}

interface BulkResult {
  device: Device;
  success: boolean;
  error?: string;
}

export function BulkActions({ devices }: BulkActionsProps) {
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<BulkResult[]>([]);

  const executeBulk = async (
    command: string,
    options?: { confirm?: string }
  ) => {
    if (options?.confirm && !confirm(options.confirm)) return;

    setProgress({ current: 0, total: devices.length });
    setResults([]);
    const newResults: BulkResult[] = [];

    // Execute in parallel with concurrency limit
    const CONCURRENT = 5;
    for (let i = 0; i < devices.length; i += CONCURRENT) {
      const batch = devices.slice(i, i + CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(async (device) => {
          try {
            const ws = new WebSocket(`ws://${device.ip}/ws`);
            await new Promise<void>((resolve, reject) => {
              ws.onopen = () => { ws.send(command); resolve(); };
              ws.onerror = reject;
              setTimeout(() => reject(new Error('Timeout')), 5000);
            });
            ws.close();
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
      setProgress({ current: newResults.length, total: devices.length });
    }

    setResults(newResults);
    setProgress(null);
  };

  return (
    <div className={styles.container}>
      <h4>Bulk Actions ({devices.length} devices)</h4>

      <div className={styles.actions}>
        <button onClick={() => executeBulk(Commands.toggleLed())}>
          💡 Toggle LEDs
        </button>
        <button onClick={() => executeBulk(Commands.start())}>
          ▶️ Start UWB
        </button>
        <button
          onClick={() => executeBulk(Commands.reboot(), {
            confirm: `Reboot ${devices.length} devices?`
          })}
        >
          🔄 Reboot All
        </button>
      </div>

      {progress && (
        <ProgressBar
          current={progress.current}
          total={progress.total}
        />
      )}

      {results.length > 0 && (
        <div className={styles.results}>
          {results.map(r => (
            <div key={r.device.ip} className={r.success ? styles.success : styles.error}>
              {r.success ? '✓' : '✗'} {r.device.id} ({r.device.ip})
              {r.error && <span className={styles.errorMsg}>{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
