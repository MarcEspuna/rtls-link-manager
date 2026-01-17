/**
 * Device WebSocket command utilities.
 *
 * This module provides reusable functions for sending commands to devices
 * via WebSocket, supporting both single and bulk operations.
 */

import { Device } from '@shared/types';
import { isJsonCommand } from '@shared/commands';

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
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`ws://${deviceIp}/ws`);

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error('Timeout'));
      }
    }, timeout);

    ws.onopen = () => ws.send(command);

    ws.onmessage = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      ws.close();
      resolve(event.data.toString());
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        ws.close();
        reject(new Error('WebSocket error'));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Connection closed'));
      }
    };
  });
}

/**
 * Send multiple commands to a device sequentially over a single connection.
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

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${deviceIp}/ws`);
    let currentIndex = 0;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        ws.close();
      }
    };

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout on command ${currentIndex + 1}`));
      }, perCommandTimeout);
    };

    const sendNext = () => {
      if (currentIndex >= commands.length) {
        cleanup();
        resolve();
        return;
      }
      resetTimeout();
      ws.send(commands[currentIndex]);
    };

    ws.onopen = () => sendNext();

    ws.onmessage = (event) => {
      const response = event.data.toString();
      const currentCommand = commands[currentIndex];

      try {
        checkCommandResponse(currentCommand, response);
      } catch (e) {
        cleanup();
        reject(
          new Error(
            `Command ${currentIndex + 1} failed: ${e instanceof Error ? e.message : response}`
          )
        );
        return;
      }

      currentIndex++;
      onProgress?.(currentIndex, commands.length);
      sendNext();
    };

    ws.onerror = () => {
      cleanup();
      reject(new Error('WebSocket error'));
    };

    ws.onclose = () => {
      if (!settled && currentIndex < commands.length) {
        cleanup();
        reject(new Error('Connection closed unexpectedly'));
      }
    };
  });
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
 * Upload firmware to a device via HTTP POST to /update endpoint.
 */
export async function uploadFirmware(
  deviceIp: string,
  firmwareData: ArrayBuffer,
  options?: {
    onProgress?: (percent: number) => void;
    timeout?: number;
  }
): Promise<void> {
  const { onProgress, timeout = 120000 } = options ?? {};

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `http://${deviceIp}/update`, true);
    xhr.timeout = timeout;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve();
      } else {
        reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during firmware upload'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Firmware upload timed out'));
    };

    const formData = new FormData();
    formData.append('firmware', new Blob([firmwareData]), 'firmware.bin');
    xhr.send(formData);
  });
}

/**
 * Upload firmware to multiple devices sequentially.
 * Sequential upload is preferred to avoid network congestion and ensure reliability.
 */
export interface FirmwareUploadResult {
  device: Device;
  success: boolean;
  error?: string;
}

export async function uploadFirmwareBulk(
  devices: Device[],
  firmwareData: ArrayBuffer,
  options?: {
    onDeviceProgress?: (device: Device, percent: number) => void;
    onDeviceComplete?: (device: Device, success: boolean, error?: string) => void;
    onOverallProgress?: (completed: number, total: number) => void;
  }
): Promise<FirmwareUploadResult[]> {
  const { onDeviceProgress, onDeviceComplete, onOverallProgress } = options ?? {};
  const results: FirmwareUploadResult[] = [];

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    try {
      await uploadFirmware(device.ip, firmwareData, {
        onProgress: (percent) => onDeviceProgress?.(device, percent),
      });
      results.push({ device, success: true });
      onDeviceComplete?.(device, true);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Upload failed';
      results.push({ device, success: false, error });
      onDeviceComplete?.(device, false, error);
    }
    onOverallProgress?.(i + 1, devices.length);
  }

  return results;
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
