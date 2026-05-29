import { DeviceConfig } from './types.js';
import { anchorsAreNonCoplanar3D, MAX_CONFIGURABLE_ANCHORS, validateAnchorList } from './anchors.js';

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
    const isTagTdoa = config.uwb.mode === 4;
    const dynamicAnchorsEnabled = config.uwb.dynamicAnchorPosEnabled === 1;
    const use3DEstimator = config.uwb.use2DEstimator === 0;
    const shouldValidateTagAnchors = isTagTdoa || config.uwb.mode === undefined;
    const shouldValidateStaticTagAnchors = shouldValidateTagAnchors && !dynamicAnchorsEnabled;
    const hasAnchorArray = Array.isArray(config.uwb.anchors);
    const hasAnchorGeometry = hasAnchorArray && config.uwb.anchors!.length > 0;
    const anchorCount = config.uwb.anchorCount;
    let validAnchorCount: number | null = null;
    if (shouldValidateStaticTagAnchors && anchorCount !== undefined) {
      const count = Number(anchorCount);
      if (!Number.isInteger(count) || count < 0) {
        errors.push('Anchor count must be positive when set');
      } else if (count === 0) {
        if (isTagTdoa || config.uwb.mode === undefined || hasAnchorGeometry) {
          errors.push('Anchor count must be positive when set');
        }
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

    if (isTagTdoa && !dynamicAnchorsEnabled && !hasAnchorGeometry) {
      errors.push('Anchor geometry required for TAG_TDOA configs');
    }

    if (shouldValidateStaticTagAnchors && hasAnchorGeometry) {
      const anchorError = validateAnchorList(config.uwb.anchors!);
      if (anchorError) {
        errors.push(anchorError);
      }
      if (isTagTdoa && !dynamicAnchorsEnabled) {
        const minimumAnchors = use3DEstimator ? 5 : 4;
        if (config.uwb.anchors!.length < minimumAnchors) {
          errors.push(`${use3DEstimator ? '3D' : '2D'} TAG_TDOA static geometry requires at least ${minimumAnchors} anchors`);
        } else if (use3DEstimator && !anchorsAreNonCoplanar3D(config.uwb.anchors!)) {
          errors.push('3D TAG_TDOA static geometry requires non-coplanar anchors');
        }
      }
    }

    if (isTagTdoa && dynamicAnchorsEnabled && use3DEstimator) {
      const separation = Number(config.uwb.anchorPlaneSeparation);
      if (!Number.isFinite(separation) || separation <= 0) {
        errors.push('3D dynamic anchors require a positive anchor plane separation');
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

    if (config.uwb.tdoaAnchorTelemetryEnable !== undefined &&
      config.uwb.tdoaAnchorTelemetryEnable !== 0 &&
      config.uwb.tdoaAnchorTelemetryEnable !== 1) {
      errors.push('TDoA anchor telemetry enable must be 0 or 1');
    }

    if (config.uwb.tdoaAnchorTelemetryIntervalMs !== undefined) {
      const v = Number(config.uwb.tdoaAnchorTelemetryIntervalMs);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 250 || v > 60000) {
        errors.push('TDoA anchor telemetry interval must be an integer in 250-60000 ms');
      }
    }

    if (config.uwb.tdoaAnchorTelemetryPort !== undefined) {
      const v = Number(config.uwb.tdoaAnchorTelemetryPort);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 1 || v > 65535) {
        errors.push('TDoA anchor telemetry port must be an integer in 1-65535');
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

    if (config.uwb.rtlsBeaconTdoaSigmaFloorM !== undefined) {
      const v = Number(config.uwb.rtlsBeaconTdoaSigmaFloorM);
      if (Number.isNaN(v) || !Number.isFinite(v) || v < 0) {
        errors.push('RTLSLink beacon TDoA sigma floor must be >= 0 m');
      }
    }

    if (config.uwb.rtlsBeaconTdoaPhysicalGuardEnable !== undefined &&
      config.uwb.rtlsBeaconTdoaPhysicalGuardEnable !== 0 &&
      config.uwb.rtlsBeaconTdoaPhysicalGuardEnable !== 1) {
      errors.push('RTLSLink beacon TDoA physical guard enable must be 0 or 1');
    }

    if (config.uwb.rtlsBeaconTdoaPhysicalGuardMarginM !== undefined) {
      const v = Number(config.uwb.rtlsBeaconTdoaPhysicalGuardMarginM);
      if (Number.isNaN(v) || !Number.isFinite(v) || v < 0) {
        errors.push('RTLSLink beacon TDoA physical guard margin must be >= 0 m');
      }
    }

    if (config.uwb.tdoaMatcherPolicy !== undefined &&
      config.uwb.tdoaMatcherPolicy !== 0 &&
      config.uwb.tdoaMatcherPolicy !== 1) {
      errors.push('TDoA matcher policy must be 0 or 1');
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
