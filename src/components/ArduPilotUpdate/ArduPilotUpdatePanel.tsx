import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Device } from "@shared/types";
import {
  readApjMetadata,
  updateArduPilotFromFile,
  onArduPilotUpdateProgress,
  type ApjMetadata,
  type ArduPilotUpdateProgressEvent,
  type BootloaderInfo,
} from "../../lib/tauri-api";
import styles from "./ArduPilotUpdatePanel.module.css";

interface ArduPilotUpdatePanelProps {
  devices: Device[];
}

const phaseLabel: Record<string, string> = {
  connecting: "Connecting",
  rebooting: "Rebooting",
  syncing: "Syncing",
  checking_board: "Checking board",
  erasing: "Erasing",
  flashing: "Flashing",
  verifying: "Verifying",
  complete: "Complete",
};

export function ArduPilotUpdatePanel({ devices }: ArduPilotUpdatePanelProps) {
  const [selectedIp, setSelectedIp] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [metadata, setMetadata] = useState<ApjMetadata | null>(null);
  const [progress, setProgress] = useState<ArduPilotUpdateProgressEvent | null>(
    null,
  );
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [bootloaderInfo, setBootloaderInfo] = useState<BootloaderInfo | null>(
    null,
  );

  const selectedDevice = useMemo(
    () => devices.find((device) => device.ip === selectedIp) ?? null,
    [devices, selectedIp],
  );

  useEffect(() => {
    if (devices.length === 0) {
      if (selectedIp) setSelectedIp("");
      return;
    }

    if (!selectedIp || !devices.some((device) => device.ip === selectedIp)) {
      setSelectedIp(devices[0].ip);
    }
  }, [devices, selectedIp]);

  const handleSelectFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "ArduPilot firmware", extensions: ["apj"] }],
    });
    if (typeof selected !== "string") return;

    setFilePath(selected);
    setFileName(selected.split(/[/\\]/).pop() ?? selected);
    setError("");
    setBootloaderInfo(null);
    setProgress(null);

    try {
      setMetadata(await readApjMetadata(selected));
    } catch (e) {
      setMetadata(null);
      setError(e instanceof Error ? e.message : "Failed to read APJ metadata");
    }
  };

  const handleUpdate = async () => {
    if (!selectedDevice || !filePath || updating) return;

    const updateIp = selectedDevice.ip;
    let unlisten: (() => void) | null = null;

    setUpdating(true);
    setError("");
    setBootloaderInfo(null);
    setProgress({ ip: updateIp, phase: "connecting", percent: 0 });

    try {
      unlisten = await onArduPilotUpdateProgress((event) => {
        if (event.ip === updateIp) {
          setProgress(event);
        }
      });

      const info = await updateArduPilotFromFile(updateIp, filePath);
      setBootloaderInfo(info);
      setProgress({ ip: updateIp, phase: "complete", percent: 100 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ArduPilot update failed");
    } finally {
      unlisten?.();
      setUpdating(false);
    }
  };

  const pct = Math.max(0, Math.min(100, progress?.percent ?? 0));
  const phase = progress
    ? (phaseLabel[progress.phase] ?? progress.phase)
    : "Idle";

  return (
    <section className={styles.container}>
      <div className={styles.toolbar}>
        <div>
          <h2 className={styles.title}>ArduPilot Update</h2>
          <div className={styles.subtitle}>Single MAP-Link device</div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.panel}>
          <label className={styles.field}>
            <span>RTLS / MAP-Link device</span>
            <select
              value={selectedIp}
              onChange={(event) => setSelectedIp(event.target.value)}
              disabled={updating}
            >
              {devices.map((device) => (
                <option key={device.ip} value={device.ip}>
                  {device.id || device.ip} - {device.ip}
                </option>
              ))}
            </select>
          </label>

          {selectedDevice && (
            <div className={styles.deviceSummary}>
              <div>
                <span>Role</span>
                {selectedDevice.role}
              </div>
              <div>
                <span>Firmware</span>
                {selectedDevice.firmware}
              </div>
              <div>
                <span>MAV sysid</span>
                {selectedDevice.mavSysId}
              </div>
            </div>
          )}

          <button
            className={styles.fileButton}
            onClick={handleSelectFile}
            disabled={updating}
          >
            {fileName || "Select .apj"}
          </button>

          {metadata && (
            <div className={styles.metadata}>
              <div>
                <span>Board ID</span>
                {metadata.boardId}
              </div>
              <div>
                <span>Image size</span>
                {metadata.imageSize.toLocaleString()} bytes
              </div>
              {metadata.vehicleType && (
                <div>
                  <span>Vehicle</span>
                  {metadata.vehicleType}
                </div>
              )}
              {metadata.gitIdentity && (
                <div>
                  <span>Git</span>
                  {metadata.gitIdentity}
                </div>
              )}
            </div>
          )}

          <button
            className={styles.primaryButton}
            onClick={handleUpdate}
            disabled={!selectedDevice || !filePath || updating}
          >
            {updating ? "Updating" : "Start Update"}
          </button>
        </div>

        <div className={styles.panel}>
          <div className={styles.progressHeader}>
            <span>{phase}</span>
            <strong>{Math.round(pct)}%</strong>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          {progress?.detail && (
            <div className={styles.detail}>{progress.detail}</div>
          )}

          {bootloaderInfo && (
            <div className={styles.result}>
              <div>
                <span>Bootloader</span>
                {bootloaderInfo.revision}
              </div>
              <div>
                <span>Board ID</span>
                {bootloaderInfo.boardId}
              </div>
              <div>
                <span>Flash size</span>
                {bootloaderInfo.flashSize.toLocaleString()} bytes
              </div>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    </section>
  );
}
