/**
 * Tauri API wrapper for frontend-backend communication.
 *
 * This module provides type-safe wrappers around Tauri IPC commands
 * and event listeners for device discovery and configuration management.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Device,
  LocalConfigInfo,
  LocalConfig,
  DeviceConfig,
  Preset,
  PresetInfo,
} from '@shared/types';

export type AppError =
  | { Io: string }
  | { InvalidName: string }
  | { NotFound: string }
  | { Json: string }
  | { Discovery: string }
  | { Device: string };

export function formatAppError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }

    const entries = Object.entries(error as Record<string, unknown>);
    if (entries.length === 1) {
      const [kind, value] = entries[0];
      if (typeof value === 'string') return value;
      return `${kind}: ${JSON.stringify(value)}`;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  const err = new Error(formatAppError(error));
  (err as any).cause = error;
  return err;
}

async function invokeSafe<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke(command, args);
  } catch (e) {
    throw toError(e);
  }
}

// ============================================================================
// Device Commands
// ============================================================================

/**
 * Get all discovered devices.
 */
export async function getDevices(): Promise<Device[]> {
  return await invokeSafe('get_devices');
}

/**
 * Get a specific device by IP address.
 */
export async function getDevice(ip: string): Promise<Device | null> {
  return await invokeSafe('get_device', { ip });
}

/**
 * Clear all discovered devices from the cache.
 */
export async function clearDevices(): Promise<void> {
  await invokeSafe('clear_devices');
}

// ============================================================================
// Config Commands
// ============================================================================

/**
 * List all saved local configurations.
 */
export async function listConfigs(): Promise<LocalConfigInfo[]> {
  return await invokeSafe('list_configs');
}

/**
 * Get a specific configuration by name.
 */
export async function getConfig(name: string): Promise<LocalConfig | null> {
  return await invokeSafe('get_config', { name });
}

/**
 * Save a configuration with the given name.
 */
export async function saveConfig(
  name: string,
  config: DeviceConfig
): Promise<boolean> {
  return await invokeSafe('save_config', { name, config });
}

/**
 * Delete a configuration by name.
 */
export async function deleteConfig(name: string): Promise<boolean> {
  return await invokeSafe('delete_config', { name });
}

export async function backupDeviceConfigToLocal(
  ip: string,
  name: string,
  timeoutMs?: number
): Promise<boolean> {
  return await invokeSafe('backup_device_config_to_local', { ip, name, timeoutMs });
}

// ============================================================================
// Preset Commands
// ============================================================================

/**
 * List all saved presets.
 */
export async function listPresets(): Promise<PresetInfo[]> {
  return await invokeSafe('list_presets');
}

/**
 * Get a specific preset by name.
 */
export async function getPreset(name: string): Promise<Preset | null> {
  return await invokeSafe('get_preset', { name });
}

/**
 * Save a preset.
 */
export async function savePreset(preset: Preset): Promise<boolean> {
  return await invokeSafe('save_preset', { preset });
}

/**
 * Delete a preset by name.
 */
export async function deletePreset(name: string): Promise<boolean> {
  return await invokeSafe('delete_preset', { name });
}

export async function backupDevicePreset(
  ip: string,
  name: string,
  description: string | undefined,
  presetType: 'full' | 'locations',
  timeoutMs?: number
): Promise<boolean> {
  return await invokeSafe('backup_device_preset', { ip, name, description, presetType, timeoutMs });
}

// ============================================================================
// Device Communication Commands
// ============================================================================

export interface DeviceCommandResponse {
  raw: string;
  json?: unknown;
}

/**
 * Send a single UDP MAVLink command to a device and return the response.
 */
export async function sendDeviceCommand(
  ip: string,
  command: string,
  timeoutMs?: number
): Promise<DeviceCommandResponse> {
  return await invokeSafe('send_device_command', { ip, command, timeoutMs });
}

/**
 * Send multiple UDP MAVLink commands to a device sequentially.
 */
export async function sendDeviceCommands(
  ip: string,
  commands: string[],
  timeoutMs?: number
): Promise<DeviceCommandResponse[]> {
  return await invokeSafe('send_device_commands', { ip, commands, timeoutMs });
}

export interface DeviceOperationResult {
  ip: string;
  success: boolean;
  error?: string;
}

export interface DeviceOperationProgressEvent {
  operationId: string;
  completed: number;
  total: number;
  ip?: string;
  success?: boolean;
  error?: string;
}

export async function runBulkDeviceCommand(
  ips: string[],
  command: string,
  options?: { timeoutMs?: number; concurrency?: number; operationId?: string }
): Promise<DeviceOperationResult[]> {
  return await invokeSafe('run_bulk_device_command', {
    ips,
    command,
    timeoutMs: options?.timeoutMs,
    concurrency: options?.concurrency,
    operationId: options?.operationId,
  });
}

export async function applyConfigToDevices(
  ips: string[],
  config: DeviceConfig,
  configName: string,
  options?: { timeoutMs?: number; concurrency?: number; operationId?: string }
): Promise<DeviceOperationResult[]> {
  return await invokeSafe('apply_config_to_devices', {
    ips,
    config,
    configName,
    timeoutMs: options?.timeoutMs,
    concurrency: options?.concurrency,
    operationId: options?.operationId,
  });
}

export async function activateConfigOnDevices(
  ips: string[],
  configName: string,
  options?: { timeoutMs?: number; concurrency?: number; operationId?: string }
): Promise<DeviceOperationResult[]> {
  return await invokeSafe('activate_config_on_devices', {
    ips,
    configName,
    timeoutMs: options?.timeoutMs,
    concurrency: options?.concurrency,
    operationId: options?.operationId,
  });
}

export async function uploadPresetToDevices(
  ips: string[],
  preset: Preset,
  options?: { timeoutMs?: number; concurrency?: number; operationId?: string }
): Promise<DeviceOperationResult[]> {
  return await invokeSafe('upload_preset_to_devices', {
    ips,
    preset,
    timeoutMs: options?.timeoutMs,
    concurrency: options?.concurrency,
    operationId: options?.operationId,
  });
}

export interface AnchorCalibrationConfig {
  anchorCount?: number;
  x: number;
  y: number;
  planeSeparation?: number;
  layout: 'rectangular-a1x-a3y' | 'rectangular-a1x-a2y' | 'rectangular-a3x-a1y' | 'rectangular-a2x-a3y';
  ips?: string[];
  discoveryDuration: number;
  minSamples: number;
  sampleDuration: number;
  sampleIntervalMs: number;
  maxIters: number;
  toleranceM: number;
  minImprovementM: number;
  priorSigmaTicks: number;
  maxDeltaTicks: number;
  dryRun: boolean;
  timeoutMs: number;
}

export interface CalibrationPairError {
  a: number;
  b: number;
  errorM: number;
}

export interface CalibrationErrorReport {
  pairErrors: CalibrationPairError[];
  rmsM: number;
  maxAbsM: number;
}

export interface CalibrationIteration {
  iteration: number;
  delays: number[];
  error: CalibrationErrorReport;
}

export interface CalibrationRun {
  layout: string;
  anchorCount: number;
  xM: number;
  yM: number;
  planeSeparationM?: number;
  anchors: Array<{ anchorId: number; ip: string }>;
  iterations: CalibrationIteration[];
  finalResult?: CalibrationIteration;
  dryRun: boolean;
}

export type CalibrationEvent =
  | { type: 'log'; message: string }
  | { type: 'iteration'; iteration: number; maxIterations: number; delays: number[]; error: CalibrationErrorReport }
  | { type: 'complete'; result: CalibrationRun };

export async function runAntennaCalibration(
  config: AnchorCalibrationConfig
): Promise<CalibrationRun> {
  return await invokeSafe('run_antenna_calibration', { config });
}

/**
 * Upload firmware to a single device from a file path.
 *
 * Progress is reported via `onOtaProgress` events.
 */
export async function uploadFirmwareFromFile(
  ip: string,
  filePath: string
): Promise<void> {
  await invokeSafe('upload_firmware_from_file', { ip, filePath });
}

export interface FirmwareResult {
  ip: string;
  success: boolean;
  error?: string;
}

/**
 * Upload firmware to multiple devices concurrently.
 *
 * Progress is reported via `onOtaProgress` events per device.
 */
export async function uploadFirmwareBulk(
  ips: string[],
  filePath: string,
  concurrency?: number
): Promise<FirmwareResult[]> {
  return await invokeSafe('upload_firmware_to_devices', { ips, filePath, concurrency });
}

export async function cancelFirmwareUpload(ip: string): Promise<boolean> {
  return await invokeSafe('cancel_firmware_upload', { ip });
}

export interface FirmwareInfo {
  [key: string]: unknown;
}

/**
 * Get firmware info from a device.
 */
export async function getFirmwareInfo(
  ip: string,
  timeoutMs?: number
): Promise<FirmwareInfo> {
  return await invokeSafe('get_firmware_info', { ip, timeoutMs });
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Listen for device discovery updates.
 *
 * This event is emitted whenever the device list changes (device discovered,
 * device goes offline due to TTL expiration, etc.).
 *
 * @param callback Function to call with the updated device list
 * @returns Unlisten function to stop listening
 */
export async function onDevicesUpdated(
  callback: (devices: Device[]) => void
): Promise<UnlistenFn> {
  return await listen<Device[]>('devices-updated', (event) => {
    callback(event.payload);
  });
}

export interface OtaProgressEvent {
  ip: string;
  bytesSent: number;
  totalBytes: number;
}

export interface OtaCompleteEvent {
  ip: string;
}

export interface OtaErrorEvent {
  ip: string;
  error: string;
}

/**
 * Listen for OTA firmware upload progress events.
 */
export async function onOtaProgress(
  callback: (event: OtaProgressEvent) => void
): Promise<UnlistenFn> {
  return await listen<OtaProgressEvent>('ota-progress', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for OTA firmware upload completion events.
 */
export async function onOtaComplete(
  callback: (event: OtaCompleteEvent) => void
): Promise<UnlistenFn> {
  return await listen<OtaCompleteEvent>('ota-complete', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for OTA firmware upload error events.
 */
export async function onOtaError(
  callback: (event: OtaErrorEvent) => void
): Promise<UnlistenFn> {
  return await listen<OtaErrorEvent>('ota-error', (event) => {
    callback(event.payload);
  });
}

export async function onDeviceOperationProgress(
  callback: (event: DeviceOperationProgressEvent) => void
): Promise<UnlistenFn> {
  return await listen<DeviceOperationProgressEvent>('device-operation-progress', (event) => {
    callback(event.payload);
  });
}

export async function onAntennaCalibrationEvent(
  callback: (event: CalibrationEvent) => void
): Promise<UnlistenFn> {
  return await listen<CalibrationEvent>('antenna-calibration-event', (event) => {
    callback(event.payload);
  });
}

// ============================================================================
// Type Re-exports for convenience
// ============================================================================

export type { Device, LocalConfigInfo, LocalConfig, DeviceConfig, Preset, PresetInfo };
