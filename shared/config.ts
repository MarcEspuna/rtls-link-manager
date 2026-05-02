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

    if (config.wifi.enableUartBridge !== undefined &&
      config.wifi.enableUartBridge !== 0 &&
      config.wifi.enableUartBridge !== 1) {
      errors.push('UART bridge enable must be 0 or 1');
    }
  }

  if (config.uwb) {
    if (config.uwb.anchorCount && config.uwb.anchorCount > 8) {
      errors.push('Maximum 8 anchors supported');
    }

    if (config.uwb.apOutputMode !== undefined &&
      config.uwb.apOutputMode !== 0 &&
      config.uwb.apOutputMode !== 1) {
      errors.push('ArduPilot output mode must be 0 or 1');
    }

    if (config.uwb.apBeaconPositionMode !== undefined &&
      config.uwb.apBeaconPositionMode !== 0 &&
      config.uwb.apBeaconPositionMode !== 1 &&
      config.uwb.apBeaconPositionMode !== 2) {
      errors.push('Beacon position mode must be 0, 1, or 2');
    }

    if (config.uwb.apBeaconPositionStartupMs !== undefined) {
      const v = Number(config.uwb.apBeaconPositionStartupMs);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 0) {
        errors.push('Beacon position startup window must be a non-negative integer');
      }
    }

    if (config.uwb.apBeaconPositionErrorMm !== undefined) {
      const v = Number(config.uwb.apBeaconPositionErrorMm);
      if (Number.isNaN(v) || !Number.isInteger(v) || v <= 0 || v > 65535) {
        errors.push('Beacon position error must be an integer in 1-65535 mm');
      }
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

    if (config.uwb.rfForwardEnable !== undefined && config.uwb.rfForwardEnable !== 0 && config.uwb.rfForwardEnable !== 1) {
      errors.push('Rangefinder forwarding enable must be 0 or 1');
    }

    if (config.uwb.rfForwardPreserveSrcIds !== undefined && config.uwb.rfForwardPreserveSrcIds !== 0 && config.uwb.rfForwardPreserveSrcIds !== 1) {
      errors.push('Rangefinder preserve source IDs must be 0 or 1');
    }

    if (config.uwb.rfForwardSensorId !== undefined) {
      const v = Number(config.uwb.rfForwardSensorId);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 0 || v > 255) {
        errors.push('Rangefinder sensor ID must be an integer in 0-255');
      }
    }

    if (config.uwb.rfForwardOrientation !== undefined) {
      const v = Number(config.uwb.rfForwardOrientation);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 0 || v > 255) {
        errors.push('Rangefinder orientation must be an integer in 0-255');
      }
    }

    if (config.uwb.uwbEnable !== undefined &&
      config.uwb.uwbEnable !== 0 &&
      config.uwb.uwbEnable !== 1) {
      errors.push('UWB runtime enable must be 0 or 1');
    }

    if (config.uwb.enableCovMatrix !== undefined &&
      config.uwb.enableCovMatrix !== 0 &&
      config.uwb.enableCovMatrix !== 1) {
      errors.push('Covariance matrix enable must be 0 or 1');
    }

    if (config.uwb.rmseThreshold !== undefined) {
      const v = Number(config.uwb.rmseThreshold);
      if (Number.isNaN(v) || !Number.isFinite(v) || v <= 0) {
        errors.push('RMSE threshold must be a positive number');
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
