import { DeviceConfig } from './types.js';
import { MAX_CONFIGURABLE_ANCHORS, validateAnchorList } from './anchors.js';

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
    const anchorCount = config.uwb.anchorCount;
    let validAnchorCount: number | null = null;
    if (anchorCount !== undefined) {
      const count = Number(anchorCount);
      if (!Number.isInteger(count) || count <= 0) {
        errors.push('Anchor count must be positive when set');
      } else {
        validAnchorCount = count;
        if (count > MAX_CONFIGURABLE_ANCHORS) {
          errors.push(`Maximum ${MAX_CONFIGURABLE_ANCHORS} anchors supported`);
        }
      }
    }

    if (validAnchorCount !== null
      && (!config.uwb.anchors || config.uwb.anchors.length !== validAnchorCount)) {
      errors.push('Anchor geometry required when anchorCount is set');
    }

    if (config.uwb.anchors) {
      const anchorError = validateAnchorList(config.uwb.anchors);
      if (anchorError) {
        errors.push(anchorError);
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

    if (config.uwb.outputBackend !== undefined &&
      config.uwb.outputBackend !== 0 &&
      config.uwb.outputBackend !== 1) {
      errors.push('Output backend must be 0 or 1');
    }

    if (config.uwb.rtlsBeaconAgeBiasMs !== undefined) {
      const v = Number(config.uwb.rtlsBeaconAgeBiasMs);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 0 || v > 20) {
        errors.push('RTLSLink beacon age bias must be an integer in 0-20 ms');
      }
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
