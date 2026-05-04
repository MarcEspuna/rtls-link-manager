/**
 * Device command utilities.
 *
 * This module provides reusable functions for sending commands to devices
 * via the Tauri backend, supporting both single and bulk operations.
 * All device communication is routed through Rust (WebSocket/HTTP handled there).
 */

import { Device } from '@shared/types';
import {
  sendDeviceCommand as tauriSendCommand,
  sendDeviceCommands as tauriSendCommands,
  uploadFirmwareFromFile,
  uploadFirmwareBulk as tauriUploadBulk,
  runBulkDeviceCommand,
  onOtaProgress,
  onOtaComplete,
  onOtaError,
  onDeviceOperationProgress,
  type FirmwareResult,
  type OtaProgressEvent,
} from './tauri-api';
import { open } from '@tauri-apps/plugin-dialog';

// Default timeouts
export const DEFAULT_COMMAND_TIMEOUT_MS = 5000;
export const DEFAULT_WRITE_TIMEOUT_MS = 3000;
export const DEFAULT_OTA_STALL_TIMEOUT_MS = 30_000;

const OTA_CANCEL_MESSAGE =
  'Firmware update canceled. The device may still be finishing or rebooting; wait for it to reappear before retrying.';

const OTA_STALL_MESSAGE =
  'Firmware update stalled: no upload progress was received for 30 seconds. Check Wi-Fi signal, wait for the device to reappear, then retry.';

interface OtaControlOptions {
  signal?: AbortSignal;
  stallTimeoutMs?: number;
}

function createAbortError(message = OTA_CANCEL_MESSAGE): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function createOtaWatchdog(
  signal: AbortSignal | undefined,
  stallTimeoutMs = DEFAULT_OTA_STALL_TIMEOUT_MS
) {
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let rejectWatchdog: (error: Error) => void = () => {};

  const clear = () => {
    settled = true;
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = undefined;
    }
    signal?.removeEventListener('abort', onAbort);
  };

  const rejectOnce = (error: Error) => {
    if (settled) return;
    clear();
    rejectWatchdog(error);
  };

  const onAbort = () => rejectOnce(createAbortError());
  const promise = new Promise<never>((_, reject) => {
    rejectWatchdog = reject;
  });

  const reset = () => {
    if (settled || stallTimeoutMs <= 0) return;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      rejectOnce(new Error(OTA_STALL_MESSAGE));
    }, stallTimeoutMs);
  };

  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
    reset();
  }

  return { promise, reset, clear };
}

/**
 * Result of a bulk command operation for a single device.
 */
export interface BulkCommandResult {
  device: Device;
  success: boolean;
  error?: string;
}

/**
 * Send a single command to a device and get the response.
 */
export async function sendDeviceCommand<T = string>(
  deviceIp: string,
  command: string,
  timeout = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<T> {
  const response = await tauriSendCommand(deviceIp, command, timeout);
  return (response.json ?? response.raw) as T;
}

/**
 * Send multiple commands to a device sequentially.
 *
 * The Rust backend sends commands sequentially over one WebSocket connection.
 * Response validation and progress callbacks are handled on the frontend.
 */
export async function sendDeviceCommands(
  deviceIp: string,
  commands: string[],
  options?: {
    onProgress?: (current: number, total: number) => void;
    perCommandTimeout?: number;
  }
): Promise<void> {
  const { onProgress, perCommandTimeout = DEFAULT_WRITE_TIMEOUT_MS } = options ?? {};

  const responses = await tauriSendCommands(deviceIp, commands, perCommandTimeout);
  for (let i = 0; i < responses.length; i++) {
    onProgress?.(i + 1, commands.length);
  }
}

/**
 * Execute a command on multiple devices concurrently with a concurrency limit.
 */
export async function executeBulkCommand(
  devices: Device[],
  command: string,
  options?: {
    concurrency?: number;
    timeout?: number;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<BulkCommandResult[]> {
  const { concurrency = 5, timeout = DEFAULT_COMMAND_TIMEOUT_MS, onProgress } = options ?? {};
  const operationId = `bulk-${Date.now()}`;
  let unlisten: (() => void) | undefined;
  if (onProgress) {
    unlisten = await onDeviceOperationProgress((event) => {
      if (event.operationId === operationId) {
        onProgress(event.completed, event.total);
      }
    });
  }

  try {
    const rawResults = await runBulkDeviceCommand(
      devices.map((d) => d.ip),
      command,
      { timeoutMs: timeout, concurrency, operationId }
    );
    const deviceByIp = new Map(devices.map((device) => [device.ip, device]));
    return rawResults.flatMap((result) => {
      const device = deviceByIp.get(result.ip);
      if (!device) return [];
      return [{
        device,
        success: result.success,
        error: result.error,
      }];
    });
  } finally {
    unlisten?.();
  }
}

/**
 * OTA response from firmware after successful upload.
 */
export interface OtaResponse {
  success: boolean;
  message: string;
  version?: string;
  rebooting?: boolean;
}

/**
 * Upload firmware to a device via the Tauri backend.
 *
 * Uses Tauri's file dialog to get the file path, then the Rust backend
 * handles the HTTP POST to the device's /update endpoint.
 */
export async function uploadFirmware(
  deviceIp: string,
  filePath: string,
  options?: {
    onProgress?: (percent: number) => void;
  } & OtaControlOptions
): Promise<void> {
  const { onProgress, signal, stallTimeoutMs } = options ?? {};
  const watchdog = createOtaWatchdog(signal, stallTimeoutMs);

  // Listen for progress events for this specific device
  let unlistenProgress: (() => void) | undefined;
  if (onProgress) {
    unlistenProgress = await onOtaProgress((event: OtaProgressEvent) => {
      if (event.ip === deviceIp && event.totalBytes > 0) {
        watchdog.reset();
        onProgress(Math.round((event.bytesSent / event.totalBytes) * 100));
      }
    });
  }

  try {
    await Promise.race([uploadFirmwareFromFile(deviceIp, filePath), watchdog.promise]);
  } finally {
    watchdog.clear();
    unlistenProgress?.();
  }
}

/**
 * Upload firmware to multiple devices with optional parallelism.
 */
export interface FirmwareUploadResult {
  device: Device;
  success: boolean;
  version?: string;
  error?: string;
}

export async function uploadFirmwareBulk(
  devices: Device[],
  filePath: string,
  options?: {
    concurrency?: number;
    onDeviceProgress?: (device: Device, percent: number) => void;
    onDeviceComplete?: (device: Device, success: boolean, version?: string, error?: string) => void;
    onOverallProgress?: (completed: number, total: number) => void;
  } & OtaControlOptions
): Promise<FirmwareUploadResult[]> {
  const {
    concurrency = 1,
    onDeviceProgress,
    onDeviceComplete,
    onOverallProgress,
    signal,
    stallTimeoutMs,
  } = options ?? {};
  const watchdog = createOtaWatchdog(signal, stallTimeoutMs);

  const ips = devices.map(d => d.ip);
  const ipToDevice = new Map(devices.map(d => [d.ip, d]));

  // Set up progress event listeners
  let unlistenProgress: (() => void) | undefined;
  let unlistenComplete: (() => void) | undefined;
  let unlistenError: (() => void) | undefined;

  if (onDeviceProgress) {
    unlistenProgress = await onOtaProgress((event) => {
      const device = ipToDevice.get(event.ip);
      if (device && event.totalBytes > 0) {
        watchdog.reset();
        onDeviceProgress(device, Math.round((event.bytesSent / event.totalBytes) * 100));
      }
    });
  }

  if (onDeviceComplete) {
    unlistenComplete = await onOtaComplete((event) => {
      const device = ipToDevice.get(event.ip);
      if (device) {
        onDeviceComplete(device, true);
      }
    });

    unlistenError = await onOtaError((event) => {
      const device = ipToDevice.get(event.ip);
      if (device) {
        onDeviceComplete(device, false, undefined, event.error);
      }
    });
  }

  try {
    const tauriResults = await Promise.race([
      tauriUploadBulk(ips, filePath, concurrency),
      watchdog.promise,
    ]);

    const results: FirmwareUploadResult[] = tauriResults.map((r: FirmwareResult) => {
      const device = ipToDevice.get(r.ip);
      return {
        device: device!,
        success: r.success,
        error: r.error,
      };
    });

    onOverallProgress?.(results.length, devices.length);
    return results;
  } finally {
    watchdog.clear();
    unlistenProgress?.();
    unlistenComplete?.();
    unlistenError?.();
  }
}

/**
 * Open a file dialog to select a firmware file.
 * Returns the selected file path, or null if cancelled.
 */
export async function selectFirmwareFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Firmware', extensions: ['bin'] }],
  });
  if (typeof selected === 'string') {
    return selected;
  }
  return null;
}

/**
 * Execute a function on multiple devices concurrently with a concurrency limit.
 * More flexible than executeBulkCommand - allows custom logic per device.
 */
export async function executeBulkOperation<T>(
  devices: Device[],
  operation: (device: Device) => Promise<T>,
  options?: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Array<{ device: Device; result: T | null; error?: string }>> {
  const { concurrency = 3, onProgress } = options ?? {};

  const results: Array<{ device: Device; result: T | null; error?: string }> = [];

  for (let i = 0; i < devices.length; i += concurrency) {
    const batch = devices.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (device) => {
        try {
          const result = await operation(device);
          return { device, result, error: undefined };
        } catch (e) {
          return {
            device,
            result: null,
            error: e instanceof Error ? e.message : 'Failed',
          };
        }
      })
    );
    results.push(...batchResults);
    onProgress?.(results.length, devices.length);
  }

  return results;
}
