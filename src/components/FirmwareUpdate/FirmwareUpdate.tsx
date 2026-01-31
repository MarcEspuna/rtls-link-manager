import { useState } from 'react';
import { Device } from '@shared/types';
import {
  uploadFirmware,
  uploadFirmwareBulk,
  selectFirmwareFile,
  FirmwareUploadResult,
} from '../../lib/deviceCommands';
import { ProgressBar } from '../common/ProgressBar';
import styles from './FirmwareUpdate.module.css';

interface FirmwareUpdateProps {
  device?: Device;  // Single device mode
  devices?: Device[];  // Bulk mode
  onComplete?: () => void;
}

// Track upload status for each device
interface DeviceUploadStatus {
  device: Device;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  version?: string;
  error?: string;
}

export function FirmwareUpdate({ device, devices, onComplete }: FirmwareUpdateProps) {
  const [firmwarePath, setFirmwarePath] = useState<string | null>(null);
  const [firmwareName, setFirmwareName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);  // For single device mode
  const [deviceStatuses, setDeviceStatuses] = useState<Map<string, DeviceUploadStatus>>(new Map());
  const [results, setResults] = useState<FirmwareUploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isBulkMode = !!devices && devices.length > 0;
  const targetDevices = isBulkMode ? devices : (device ? [device] : []);

  const handleSelectFile = async () => {
    const path = await selectFirmwareFile();
    if (path) {
      setFirmwarePath(path);
      // Extract filename from path
      const name = path.split(/[/\\]/).pop() || path;
      setFirmwareName(name);
      setError(null);
      setSuccess(false);
      setResults([]);
    }
  };

  const handleUpload = async () => {
    if (!firmwarePath || targetDevices.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess(false);
    setResults([]);
    setUploadProgress(0);

    // Initialize device statuses for bulk mode
    if (isBulkMode) {
      const initialStatuses = new Map<string, DeviceUploadStatus>();
      targetDevices.forEach(dev => {
        initialStatuses.set(dev.ip, {
          device: dev,
          progress: 0,
          status: 'pending',
        });
      });
      setDeviceStatuses(initialStatuses);
    }

    try {
      if (isBulkMode) {
        const uploadResults = await uploadFirmwareBulk(targetDevices, firmwarePath, {
          onDeviceProgress: (dev, percent) => {
            setDeviceStatuses(prev => {
              const next = new Map(prev);
              const current = next.get(dev.ip);
              if (current) {
                next.set(dev.ip, { ...current, progress: percent, status: 'uploading' });
              }
              return next;
            });
          },
          onDeviceComplete: (dev, didSucceed, version, err) => {
            setDeviceStatuses(prev => {
              const next = new Map(prev);
              const current = next.get(dev.ip);
              if (current) {
                next.set(dev.ip, {
                  ...current,
                  progress: 100,
                  status: didSucceed ? 'complete' : 'error',
                  version,
                  error: err,
                });
              }
              return next;
            });
            setResults(prev => [...prev, { device: dev, success: didSucceed, version, error: err }]);
          },
        });

        const allSuccess = uploadResults.every(r => r.success);
        if (allSuccess) {
          setSuccess(true);
        } else {
          const failCount = uploadResults.filter(r => !r.success).length;
          setError(`${failCount} of ${uploadResults.length} devices failed to update`);
        }
      } else {
        await uploadFirmware(targetDevices[0].ip, firmwarePath, {
          onProgress: setUploadProgress,
        });
        setSuccess(true);
      }

      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setDeviceStatuses(new Map());
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>
        Firmware Update
        {isBulkMode && <span className={styles.count}>({targetDevices.length} devices)</span>}
      </h4>

      <div
        className={`${styles.dropZone} ${firmwarePath ? styles.hasFile : ''}`}
        onClick={handleSelectFile}
      >
        {firmwarePath ? (
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{firmwareName}</span>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.icon}>+</span>
            <span>Click to select firmware.bin</span>
          </div>
        )}
      </div>

      <button
        className={styles.uploadBtn}
        onClick={handleUpload}
        disabled={!firmwarePath || uploading || targetDevices.length === 0}
      >
        {uploading ? 'Uploading...' : 'Upload Firmware'}
      </button>

      {uploading && (
        <div className={styles.progress}>
          {isBulkMode ? (
            // Bulk mode: show individual progress for each device
            <div className={styles.deviceProgressList}>
              {Array.from(deviceStatuses.values()).map((status) => (
                <div key={status.device.ip} className={styles.deviceProgressItem}>
                  <div className={styles.deviceProgressHeader}>
                    <span className={styles.deviceProgressName}>
                      {status.device.id || status.device.ip}
                    </span>
                    <span className={`${styles.deviceProgressStatus} ${styles[`status${status.status.charAt(0).toUpperCase() + status.status.slice(1)}`]}`}>
                      {status.status === 'pending' && 'Waiting...'}
                      {status.status === 'uploading' && `${status.progress}%`}
                      {status.status === 'complete' && (status.version ? `v${status.version}` : 'Done')}
                      {status.status === 'error' && 'Failed'}
                    </span>
                  </div>
                  <ProgressBar
                    current={status.progress}
                    total={100}
                  />
                </div>
              ))}
            </div>
          ) : (
            // Single device mode: simple progress bar
            <>
              <ProgressBar current={uploadProgress} total={100} />
              <div className={styles.progressText}>{uploadProgress}%</div>
            </>
          )}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {success && (
        <div className={styles.success}>
          Firmware updated successfully. Device{isBulkMode ? 's are' : ' is'} rebooting...
        </div>
      )}

      {results.length > 0 && !uploading && (
        <div className={styles.results}>
          {results.map((r) => (
            <div
              key={r.device.ip}
              className={r.success ? styles.resultSuccess : styles.resultError}
            >
              <span>{r.success ? 'OK' : 'FAIL'}</span>
              <span>{r.device.id}</span>
              <span className={styles.deviceIp}>{r.device.ip}</span>
              {r.error && <span className={styles.errorMsg}>{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
