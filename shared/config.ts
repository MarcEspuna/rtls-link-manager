import { DeviceConfig } from './types.js';

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(config: Partial<DeviceConfig>): ConfigValidationResult {
  const errors: string[] = [];

  if (config.wifi) {
    if (config.wifi.mode === 1) {
      if (!config.wifi.ssidST) errors.push('Station mode requires ssidST');
    }
  }

  if (config.uwb) {
    if (config.uwb.anchorCount && config.uwb.anchorCount > 6) {
      errors.push('Maximum 6 anchors supported');
    }

    if (config.uwb.tdoaSlotCount !== undefined) {
      const v = Number(config.uwb.tdoaSlotCount);
      if (Number.isNaN(v) || (!Number.isInteger(v))) {
        errors.push('TDoA slot count must be an integer');
      } else if (v !== 0 && (v < 2 || v > 8)) {
        errors.push('TDoA slot count must be 0 (legacy) or 2-8');
      }
    }

    if (config.uwb.tdoaSlotDurationUs !== undefined) {
      const v = Number(config.uwb.tdoaSlotDurationUs);
      if (Number.isNaN(v) || (!Number.isInteger(v))) {
        errors.push('TDoA slot duration must be an integer');
      } else if (v < 0) {
        errors.push('TDoA slot duration must be >= 0');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function mergeConfigs(
  base: DeviceConfig,
  overlay: Partial<DeviceConfig>
): DeviceConfig {
  return {
    wifi: { ...base.wifi, ...overlay.wifi },
    uwb: { ...base.uwb, ...overlay.uwb },
    app: { ...base.app, ...overlay.app },
  };
}
