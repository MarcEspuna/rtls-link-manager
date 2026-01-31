/**
 * Device command utilities.
 *
 * This module provides reusable functions for sending commands to devices
 * via the Tauri backend, supporting both single and bulk operations.
 * All device communication is routed through Rust (WebSocket/HTTP handled there).
 */

import { Device } from '@shared/types';
import { isJsonCommand } from '@shared/commands';
import {
  sendDeviceCommand as tauriSendCommand,
  sendDeviceCommands as tauriSendCommands,
  uploadFirmwareFromFile,
  uploadFirmwareBulk as tauriUploadBulk,
  onOtaProgress,
  onOtaComplete,
  onOtaError,
  type FirmwareResult,
  type OtaProgressEvent,
} from './tauri-api';
import { open } from '@tauri-apps/plugin-dialog';

// Default timeouts
export const DEFAULT_COMMAND_TIMEOUT_MS = 5000;
export const DEFAULT_WRITE_TIMEOUT_MS = 3000;

/**
 * Result of a bulk command operation for a single device.
 */
export interface BulkCommandResult {
  device: Device;
  success: boolean;
  error?: string;
}

/**
 * Check if a command response indicates an error.
 */
export function checkCommandResponse(command: string, response: string): void {
  if (isJsonCommand(command)) {
    try {
      const jsonStart = response.indexOf('{');
      if (jsonStart !== -1) {
        const json = JSON.parse(response.substring(jsonStart));
        if (json.success === false || json.error) {
          throw new Error(json.error || 'Command failed');
        }
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        // Not valid JSON, continue to text check
      } else {
        throw e;
      }
    }
  }
  if (/error|fail|invalid/i.test(response) && !/success/i.test(response)) {
    throw new Error(response);
  }
}

/**
 * Send a single command to a device and get the response.
 */
export async function sendDeviceCommand(
  deviceIp: string,
  command: string,
  timeout = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<string> {
  return tauriSendCommand(deviceIp, command, timeout);
}

/**
 * Send multiple commands to a device sequentially.
 *
 * The Rust backend sends commands sequentially over a single WebSocket connection.
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

  // Validate each response and report progress
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const command = commands[i];

    try {
      checkCommandResponse(command, response);
    } catch (e) {
      throw new Error(
        `Command ${i + 1} failed: ${e instanceof Error ? e.message : response}`
      );
    }

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

  const results: BulkCommandResult[] = [];

  for (let i = 0; i < devices.length; i += concurrency) {
    const batch = devices.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (device): Promise<BulkCommandResult> => {
        try {
          const response = await sendDeviceCommand(device.ip, command, timeout);
          checkCommandResponse(command, response);
          return { device, success: true };
        } catch (e) {
          return {
            device,
            success: false,
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
  }
): Promise<void> {
  const { onProgress } = options ?? {};

  // Listen for progress events for this specific device
  let unlistenProgress: (() => void) | undefined;
  if (onProgress) {
    unlistenProgress = await onOtaProgress((event: OtaProgressEvent) => {
      if (event.ip === deviceIp && event.totalBytes > 0) {
        onProgress(Math.round((event.bytesSent / event.totalBytes) * 100));
      }
    });
  }

  try {
    await uploadFirmwareFromFile(deviceIp, filePath);
  } finally {
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
  }
): Promise<FirmwareUploadResult[]> {
  const { concurrency = 3, onDeviceProgress, onDeviceComplete, onOverallProgress } = options ?? {};

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
    const tauriResults = await tauriUploadBulk(ips, filePath, concurrency);

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
