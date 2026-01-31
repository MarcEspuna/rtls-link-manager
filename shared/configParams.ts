import { DeviceConfig } from './types.js';

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
    if (config.wifi.enableDiscovery !== undefined) params.push(['wifi', 'enableDiscovery', String(config.wifi.enableDiscovery)]);
    if (config.wifi.discoveryPort !== undefined) params.push(['wifi', 'discoveryPort', String(config.wifi.discoveryPort)]);
    // Logging parameters
    if (config.wifi.logUdpPort !== undefined) params.push(['wifi', 'logUdpPort', String(config.wifi.logUdpPort)]);
    if (config.wifi.logSerialEnabled !== undefined) params.push(['wifi', 'logSerialEnabled', String(config.wifi.logSerialEnabled)]);
    if (config.wifi.logUdpEnabled !== undefined) params.push(['wifi', 'logUdpEnabled', String(config.wifi.logUdpEnabled)]);
  }

  // UWB params
  if (config.uwb) {
    if (config.uwb.mode !== undefined) params.push(['uwb', 'mode', String(config.uwb.mode)]);
    // NOTE: devShortAddr intentionally skipped - preserved per-device

    // Flatten anchors array to devId1/x1/y1/z1, devId2/x2/y2/z2, etc.
    if (config.uwb.anchors && config.uwb.anchors.length > 0) {
      params.push(['uwb', 'anchorCount', String(config.uwb.anchors.length)]);
      config.uwb.anchors.forEach((anchor, i) => {
        const idx = i + 1; // 1-indexed in firmware
        params.push(['uwb', `devId${idx}`, anchor.id]);
        params.push(['uwb', `x${idx}`, String(anchor.x)]);
        params.push(['uwb', `y${idx}`, String(anchor.y)]);
        params.push(['uwb', `z${idx}`, String(anchor.z)]);
      });
    } else if (config.uwb.anchorCount !== undefined) {
      params.push(['uwb', 'anchorCount', String(config.uwb.anchorCount)]);
    }

    if (config.uwb.originLat !== undefined) params.push(['uwb', 'originLat', String(config.uwb.originLat)]);
    if (config.uwb.originLon !== undefined) params.push(['uwb', 'originLon', String(config.uwb.originLon)]);
    if (config.uwb.originAlt !== undefined) params.push(['uwb', 'originAlt', String(config.uwb.originAlt)]);
    if (config.uwb.mavlinkTargetSystemId !== undefined) params.push(['uwb', 'mavlinkTargetSystemId', String(config.uwb.mavlinkTargetSystemId)]);
    if (config.uwb.rotationDegrees !== undefined) params.push(['uwb', 'rotationDegrees', String(config.uwb.rotationDegrees)]);
    if (config.uwb.zCalcMode !== undefined) params.push(['uwb', 'zCalcMode', String(config.uwb.zCalcMode)]);
    // UWB Radio settings (TDoA mode only, expert mode)
    if (config.uwb.channel !== undefined) params.push(['uwb', 'channel', String(config.uwb.channel)]);
    if (config.uwb.dwMode !== undefined) params.push(['uwb', 'dwMode', String(config.uwb.dwMode)]);
    if (config.uwb.txPowerLevel !== undefined) params.push(['uwb', 'txPowerLevel', String(config.uwb.txPowerLevel)]);
    if (config.uwb.smartPowerEnable !== undefined) params.push(['uwb', 'smartPowerEnable', String(config.uwb.smartPowerEnable)]);
    // TDoA TDMA schedule (TDoA anchors only, expert mode)
    if (config.uwb.tdoaSlotCount !== undefined) params.push(['uwb', 'tdoaSlotCount', String(config.uwb.tdoaSlotCount)]);
    if (config.uwb.tdoaSlotDurationUs !== undefined) params.push(['uwb', 'tdoaSlotDurationUs', String(config.uwb.tdoaSlotDurationUs)]);
    // Dynamic anchor positioning (TDoA tags only)
    if (config.uwb.dynamicAnchorPosEnabled !== undefined) params.push(['uwb', 'dynamicAnchorPosEnabled', String(config.uwb.dynamicAnchorPosEnabled)]);
    if (config.uwb.anchorLayout !== undefined) params.push(['uwb', 'anchorLayout', String(config.uwb.anchorLayout)]);
    if (config.uwb.anchorHeight !== undefined) params.push(['uwb', 'anchorHeight', String(config.uwb.anchorHeight)]);
    if (config.uwb.anchorPosLocked !== undefined) params.push(['uwb', 'anchorPosLocked', String(config.uwb.anchorPosLocked)]);
    if (config.uwb.distanceAvgSamples !== undefined) params.push(['uwb', 'distanceAvgSamples', String(config.uwb.distanceAvgSamples)]);
  }

  // App params
  if (config.app) {
    if (config.app.led2Pin !== undefined) params.push(['app', 'led2Pin', String(config.app.led2Pin)]);
    if (config.app.led2State !== undefined) params.push(['app', 'led2State', String(config.app.led2State)]);
  }

  return params;
}
