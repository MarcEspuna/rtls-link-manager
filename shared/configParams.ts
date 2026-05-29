import { DeviceConfig } from './types.js';
import { anchorsAreNonCoplanar3D, MAX_CONFIGURABLE_ANCHORS, normalizeUwbShortAddr, validateAnchorList } from './anchors.js';

/**
 * Converts a DeviceConfig to an array of [group, paramName, value] tuples.
 * Used for uploading config to devices via write commands.
 *
 * Note: devShortAddr is intentionally skipped - it should be preserved per-device.
 */
export function configToParams(config: DeviceConfig): Array<[string, string, string]> {
  const params: Array<[string, string, string]> = [];

  // WiFi params
  if (config.wifi) {
    if (config.wifi.mode !== undefined) params.push(['wifi', 'mode', String(config.wifi.mode)]);
    if (config.wifi.ssidAP) params.push(['wifi', 'ssidAP', config.wifi.ssidAP]);
    if (config.wifi.pswdAP) params.push(['wifi', 'pswdAP', config.wifi.pswdAP]);
    if (config.wifi.ssidST) params.push(['wifi', 'ssidST', config.wifi.ssidST]);
    if (config.wifi.pswdST) params.push(['wifi', 'pswdST', config.wifi.pswdST]);
    if (config.wifi.gcsIp) params.push(['wifi', 'gcsIp', config.wifi.gcsIp]);
    if (config.wifi.udpPort !== undefined) params.push(['wifi', 'udpPort', String(config.wifi.udpPort)]);
    if (config.wifi.enableWebServer !== undefined) params.push(['wifi', 'enableWebServer', String(config.wifi.enableWebServer)]);
    if (config.wifi.enableUartBridge !== undefined) params.push(['wifi', 'enableUartBridge', String(config.wifi.enableUartBridge)]);
    // Logging parameters
    if (config.wifi.logUdpPort !== undefined) params.push(['wifi', 'logUdpPort', String(config.wifi.logUdpPort)]);
    if (config.wifi.logSerialEnabled !== undefined) params.push(['wifi', 'logSerialEnabled', String(config.wifi.logSerialEnabled)]);
    if (config.wifi.logUdpEnabled !== undefined) params.push(['wifi', 'logUdpEnabled', String(config.wifi.logUdpEnabled)]);
  }

  // UWB params
  if (config.uwb) {
    // NOTE: devShortAddr intentionally skipped - preserved per-device

    // Flatten anchors array to devId1/x1/y1/z1, devId2/x2/y2/z2, etc.
    const dynamicAnchorsEnabled = config.uwb.dynamicAnchorPosEnabled === 1;
    if (config.uwb.mode === 4 && dynamicAnchorsEnabled && config.uwb.use2DEstimator === 0) {
      const separation = Number(config.uwb.anchorPlaneSeparation);
      if (!Number.isFinite(separation) || separation <= 0) {
        throw new Error('3D dynamic anchors require a positive anchor plane separation');
      }
    }
    const shouldWriteTagAnchors = (config.uwb.mode === 4 || config.uwb.mode === undefined)
      && !dynamicAnchorsEnabled;
    if (shouldWriteTagAnchors && config.uwb.anchors !== undefined) {
      if (config.uwb.anchorCount !== undefined) {
        const count = Number(config.uwb.anchorCount);
        if (!Number.isInteger(count) || count < 0) {
          throw new Error('Anchor count must be positive when set');
        }
        if (count === 0) {
          if (config.uwb.mode === 4 || config.uwb.mode === undefined || config.uwb.anchors.length > 0) {
            throw new Error('Anchor count must be positive when set');
          }
        } else if (config.uwb.anchors.length !== count) {
          throw new Error('Anchor geometry required when anchorCount is set');
        }
      }
      if (config.uwb.anchors.length === 0) {
        if (config.uwb.mode === 4) {
          throw new Error('Anchor geometry required for TAG_TDOA configs');
        }
      } else {
        const validationError = validateAnchorList(config.uwb.anchors);
        if (validationError) {
          throw new Error(validationError);
        }
        const anchors = config.uwb.anchors.slice(0, MAX_CONFIGURABLE_ANCHORS);
        if (config.uwb.mode === 4) {
          const use3DEstimator = config.uwb.use2DEstimator === 0;
          const minimumAnchors = use3DEstimator ? 5 : 4;
          if (anchors.length < minimumAnchors) {
            throw new Error(`${use3DEstimator ? '3D' : '2D'} TAG_TDOA static geometry requires at least ${minimumAnchors} anchors`);
          }
          if (use3DEstimator && !anchorsAreNonCoplanar3D(anchors)) {
            throw new Error('3D TAG_TDOA static geometry requires non-coplanar anchors');
          }
        }
        anchors.forEach((anchor, i) => {
          const idx = i + 1; // 1-indexed in firmware
          params.push(['uwb', `devId${idx}`, normalizeUwbShortAddr(anchor.id)]);
          params.push(['uwb', `x${idx}`, String(anchor.x)]);
          params.push(['uwb', `y${idx}`, String(anchor.y)]);
          params.push(['uwb', `z${idx}`, String(anchor.z)]);
        });
        params.push(['uwb', 'anchorCount', String(anchors.length)]);
      }
    } else if (shouldWriteTagAnchors && config.uwb.anchorCount !== undefined) {
      const count = Number(config.uwb.anchorCount);
      if (!Number.isInteger(count) || count < 0) {
        throw new Error('Anchor count must be positive when set');
      }
      if (count === 0) {
        if (config.uwb.mode === 4 || config.uwb.mode === undefined) {
          throw new Error('Anchor count must be positive when set');
        }
      } else {
        throw new Error('Anchor geometry required when anchorCount is set');
      }
    } else if (config.uwb.mode === 4 && !dynamicAnchorsEnabled) {
      throw new Error('Anchor geometry required for TAG_TDOA configs');
    }

    if (config.uwb.originLat !== undefined) params.push(['uwb', 'originLat', String(config.uwb.originLat)]);
    if (config.uwb.originLon !== undefined) params.push(['uwb', 'originLon', String(config.uwb.originLon)]);
    if (config.uwb.originAlt !== undefined) params.push(['uwb', 'originAlt', String(config.uwb.originAlt)]);
    if (config.uwb.mavlinkTargetSystemId !== undefined) params.push(['uwb', 'mavlinkTargetSystemId', String(config.uwb.mavlinkTargetSystemId)]);
    if (config.uwb.outputBackend !== undefined) params.push(['uwb', 'outputBackend', String(config.uwb.outputBackend)]);
    if (config.uwb.rtlsBeaconAgeBiasMs !== undefined) params.push(['uwb', 'rtlsBeaconAgeBiasMs', String(config.uwb.rtlsBeaconAgeBiasMs)]);
    if (config.uwb.rtlsBeaconTdoaSigmaFloorM !== undefined) params.push(['uwb', 'rtlsBeaconTdoaSigmaFloorM', String(config.uwb.rtlsBeaconTdoaSigmaFloorM)]);
    if (config.uwb.rtlsBeaconTdoaPhysicalGuardEnable !== undefined) params.push(['uwb', 'rtlsBeaconTdoaPhysicalGuardEnable', String(config.uwb.rtlsBeaconTdoaPhysicalGuardEnable)]);
    if (config.uwb.rtlsBeaconTdoaPhysicalGuardMarginM !== undefined) params.push(['uwb', 'rtlsBeaconTdoaPhysicalGuardMarginM', String(config.uwb.rtlsBeaconTdoaPhysicalGuardMarginM)]);
    if (config.uwb.rotationDegrees !== undefined) params.push(['uwb', 'rotationDegrees', String(config.uwb.rotationDegrees)]);
    if (config.uwb.zCalcMode !== undefined) params.push(['uwb', 'zCalcMode', String(config.uwb.zCalcMode)]);
    if (config.uwb.rfForwardEnable !== undefined) params.push(['uwb', 'rfForwardEnable', String(config.uwb.rfForwardEnable)]);
    if (config.uwb.rfForwardSensorId !== undefined) params.push(['uwb', 'rfForwardSensorId', String(config.uwb.rfForwardSensorId)]);
    if (config.uwb.rfForwardOrientation !== undefined) params.push(['uwb', 'rfForwardOrientation', String(config.uwb.rfForwardOrientation)]);
    if (config.uwb.rfForwardPreserveSrcIds !== undefined) params.push(['uwb', 'rfForwardPreserveSrcIds', String(config.uwb.rfForwardPreserveSrcIds)]);
    if (config.uwb.enableCovMatrix !== undefined) params.push(['uwb', 'enableCovMatrix', String(config.uwb.enableCovMatrix)]);
    if (config.uwb.rmseThreshold !== undefined) params.push(['uwb', 'rmseThreshold', String(config.uwb.rmseThreshold)]);
    // UWB Radio settings (TDoA mode only, expert mode)
    if (config.uwb.channel !== undefined) params.push(['uwb', 'channel', String(config.uwb.channel)]);
    if (config.uwb.dwMode !== undefined) params.push(['uwb', 'dwMode', String(config.uwb.dwMode)]);
    if (config.uwb.txPowerLevel !== undefined) params.push(['uwb', 'txPowerLevel', String(config.uwb.txPowerLevel)]);
    if (config.uwb.smartPowerEnable !== undefined) params.push(['uwb', 'smartPowerEnable', String(config.uwb.smartPowerEnable)]);
    // TDoA TDMA schedule (TDoA anchors only, expert mode)
    if (config.uwb.tdoaSlotCount !== undefined) params.push(['uwb', 'tdoaSlotCount', String(config.uwb.tdoaSlotCount)]);
    if (config.uwb.tdoaSlotDurationUs !== undefined) params.push(['uwb', 'tdoaSlotDurationUs', String(config.uwb.tdoaSlotDurationUs)]);
    if (config.uwb.tdoaAnchorTelemetryEnable !== undefined) params.push(['uwb', 'tdoaAnchorTelemetryEnable', String(config.uwb.tdoaAnchorTelemetryEnable)]);
    if (config.uwb.tdoaAnchorTelemetryIntervalMs !== undefined) params.push(['uwb', 'tdoaAnchorTelemetryIntervalMs', String(config.uwb.tdoaAnchorTelemetryIntervalMs)]);
    if (config.uwb.tdoaAnchorTelemetryPort !== undefined) params.push(['uwb', 'tdoaAnchorTelemetryPort', String(config.uwb.tdoaAnchorTelemetryPort)]);
    // ESP32S3-only; direct edits may still use it, but bulk config uploads must
    // not fail on ESP32 devices that do not advertise this parameter.
    // Dynamic anchor positioning (TDoA tags only)
    if (config.uwb.anchorLayout !== undefined) params.push(['uwb', 'anchorLayout', String(config.uwb.anchorLayout)]);
    if (config.uwb.anchorHeight !== undefined) params.push(['uwb', 'anchorHeight', String(config.uwb.anchorHeight)]);
    if (config.uwb.anchorPlaneSeparation !== undefined) params.push(['uwb', 'anchorPlaneSeparation', String(config.uwb.anchorPlaneSeparation)]);
    if (config.uwb.anchorPosLocked !== undefined) params.push(['uwb', 'anchorPosLocked', String(config.uwb.anchorPosLocked)]);
    if (config.uwb.distanceAvgSamples !== undefined) params.push(['uwb', 'distanceAvgSamples', String(config.uwb.distanceAvgSamples)]);
    if (config.uwb.dynamicAnchorPosEnabled !== undefined) params.push(['uwb', 'dynamicAnchorPosEnabled', String(config.uwb.dynamicAnchorPosEnabled)]);
    if (config.uwb.use2DEstimator !== undefined) params.push(['uwb', 'use2DEstimator', String(config.uwb.use2DEstimator)]);
    if (config.uwb.mode !== undefined) params.push(['uwb', 'mode', String(config.uwb.mode)]);
    if (config.uwb.uwbEnable !== undefined) params.push(['uwb', 'uwbEnable', String(config.uwb.uwbEnable)]);
  }

  // App params
  if (config.app) {
    if (config.app.led2Pin !== undefined) params.push(['app', 'led2Pin', String(config.app.led2Pin)]);
    if (config.app.led2State !== undefined) params.push(['app', 'led2State', String(config.app.led2State)]);
  }

  return params;
}
