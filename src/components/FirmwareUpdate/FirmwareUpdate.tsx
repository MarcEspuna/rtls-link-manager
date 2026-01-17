import { useState, useRef } from 'react';
import { Device } from '@shared/types';
import { uploadFirmware, uploadFirmwareBulk, FirmwareUploadResult } from '../../lib/deviceCommands';
import { ProgressBar } from '../common/ProgressBar';
import styles from './FirmwareUpdate.module.css';

interface FirmwareUpdateProps {
  device?: Device;  // Single device mode
  devices?: Device[];  // Bulk mode
  onComplete?: () => void;
}

export function FirmwareUpdate({ device, devices, onComplete }: FirmwareUpdateProps) {
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState<{ current: number; total: number } | null>(null);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [results, setResults] = useState<FirmwareUploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBulkMode = !!devices && devices.length > 0;
  const targetDevices = isBulkMode ? devices : (device ? [device] : []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.bin')) {
        setError('Please select a .bin firmware file');
        return;
      }
      setFirmwareFile(file);
      setError(null);
      setSuccess(false);
      setResults([]);
    }
  };

  const handleUpload = async () => {
    if (!firmwareFile || targetDevices.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess(false);
    setResults([]);
    setUploadProgress(0);

    try {
      const firmwareData = await firmwareFile.arrayBuffer();

      if (isBulkMode) {
        setOverallProgress({ current: 0, total: targetDevices.length });
        const uploadResults = await uploadFirmwareBulk(targetDevices, firmwareData, {
          onDeviceProgress: (dev, percent) => {
            setCurrentDevice(dev);
            setUploadProgress(percent);
          },
          onDeviceComplete: (dev, success, err) => {
            setResults(prev => [...prev, { device: dev, success, error: err }]);
          },
          onOverallProgress: (completed, total) => {
            setOverallProgress({ current: completed, total });
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
        await uploadFirmware(targetDevices[0].ip, firmwareData, {
          onProgress: setUploadProgress,
        });
        setSuccess(true);
      }

      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setCurrentDevice(null);
      setOverallProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.bin')) {
      setFirmwareFile(file);
      setError(null);
      setSuccess(false);
      setResults([]);
    } else {
      setError('Please drop a .bin firmware file');
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>
        Firmware Update
        {isBulkMode && <span className={styles.count}>({targetDevices.length} devices)</span>}
      </h4>

      <div
        className={`${styles.dropZone} ${firmwareFile ? styles.hasFile : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin"
          onChange={handleFileSelect}
          className={styles.fileInput}
        />
        {firmwareFile ? (
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{firmwareFile.name}</span>
            <span className={styles.fileSize}>
              {(firmwareFile.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.icon}>+</span>
            <span>Drop firmware.bin here or click to select</span>
          </div>
        )}
      </div>

      <button
        className={styles.uploadBtn}
        onClick={handleUpload}
        disabled={!firmwareFile || uploading || targetDevices.length === 0}
      >
        {uploading ? 'Uploading...' : 'Upload Firmware'}
      </button>

      {uploading && (
        <div className={styles.progress}>
          {currentDevice && isBulkMode && (
            <div className={styles.currentDevice}>
              Updating: {currentDevice.id} ({currentDevice.ip})
            </div>
          )}
          <ProgressBar current={uploadProgress} total={100} />
          <div className={styles.progressText}>{uploadProgress}%</div>
          {overallProgress && (
            <div className={styles.overallProgress}>
              Device {overallProgress.current} of {overallProgress.total}
            </div>
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
