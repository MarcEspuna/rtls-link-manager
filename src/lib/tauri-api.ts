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

// ============================================================================
// Device Commands
// ============================================================================

/**
 * Get all discovered devices.
 */
export async function getDevices(): Promise<Device[]> {
  return await invoke('get_devices');
}

/**
 * Get a specific device by IP address.
 */
export async function getDevice(ip: string): Promise<Device | null> {
  return await invoke('get_device', { ip });
}

/**
 * Clear all discovered devices from the cache.
 */
export async function clearDevices(): Promise<void> {
  await invoke('clear_devices');
}

// ============================================================================
// Config Commands
// ============================================================================

/**
 * List all saved local configurations.
 */
export async function listConfigs(): Promise<LocalConfigInfo[]> {
  return await invoke('list_configs');
}

/**
 * Get a specific configuration by name.
 */
export async function getConfig(name: string): Promise<LocalConfig | null> {
  return await invoke('get_config', { name });
}

/**
 * Save a configuration with the given name.
 */
export async function saveConfig(
  name: string,
  config: DeviceConfig
): Promise<boolean> {
  return await invoke('save_config', { name, config });
}

/**
 * Delete a configuration by name.
 */
export async function deleteConfig(name: string): Promise<boolean> {
  return await invoke('delete_config', { name });
}

// ============================================================================
// Preset Commands
// ============================================================================

/**
 * List all saved presets.
 */
export async function listPresets(): Promise<PresetInfo[]> {
  return await invoke('list_presets');
}

/**
 * Get a specific preset by name.
 */
export async function getPreset(name: string): Promise<Preset | null> {
  return await invoke('get_preset', { name });
}

/**
 * Save a preset.
 */
export async function savePreset(preset: Preset): Promise<boolean> {
  return await invoke('save_preset', { preset });
}

/**
 * Delete a preset by name.
 */
export async function deletePreset(name: string): Promise<boolean> {
  return await invoke('delete_preset', { name });
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

// ============================================================================
// Type Re-exports for convenience
// ============================================================================

export type { Device, LocalConfigInfo, LocalConfig, DeviceConfig, Preset, PresetInfo };
