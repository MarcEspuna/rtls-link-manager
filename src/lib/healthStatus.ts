import { Device, isAnchorRole, isTagRole } from '@shared/types';

export type HealthLevel = 'healthy' | 'warning' | 'degraded' | 'unknown';

export interface DeviceHealth {
  level: HealthLevel;
  issues: string[];
}

/**
 * Calculate the health status of a device.
 * - Anchors: Always healthy if online (offline devices are pruned by TTL)
 * - Tags: Based on telemetry fields (sendingPos, anchorsSeen, originSent, rfHealthy)
 * - Unknown telemetry (undefined) = 'unknown' level, not warning
 */
export function calculateDeviceHealth(device: Device): DeviceHealth {
  // Anchors are simple - if we see them, they're healthy
  if (isAnchorRole(device.role)) {
    return { level: 'healthy', issues: [] };
  }

  // Tags need telemetry analysis
  if (isTagRole(device.role)) {
    return calculateTagHealth(device);
  }

  // Calibration or unknown roles
  return { level: 'unknown', issues: [] };
}

function calculateTagHealth(device: Device): DeviceHealth {
  const issues: string[] = [];
  let hasTelemetry = false;

  // Check if we have any telemetry data at all
  if (
    device.sendingPos !== undefined ||
    device.anchorsSeen !== undefined ||
    device.originSent !== undefined ||
    device.rfEnabled !== undefined
  ) {
    hasTelemetry = true;
  }

  // No telemetry = unknown (old firmware or not yet received)
  if (!hasTelemetry) {
    return { level: 'unknown', issues: ['No telemetry data'] };
  }

  // Check sendingPos - critical for tag operation
  if (device.sendingPos === false) {
    issues.push('Not sending positions');
  }

  // Check anchorsSeen - need at least 3 for 2D positioning
  if (device.anchorsSeen !== undefined && device.anchorsSeen < 3) {
    issues.push(`Only seeing ${device.anchorsSeen} anchor${device.anchorsSeen === 1 ? '' : 's'}`);
  }

  // Check originSent - needed for ArduPilot integration
  if (device.originSent === false) {
    issues.push('Origin not sent to autopilot');
  }

  // Check rangefinder health (only if enabled)
  if (device.rfEnabled === true && device.rfHealthy === false) {
    issues.push('Rangefinder unhealthy');
  }

  // Determine level based on issues
  if (issues.length === 0) {
    return { level: 'healthy', issues: [] };
  }

  // Not sending positions is the most critical
  if (device.sendingPos === false) {
    return { level: 'degraded', issues };
  }

  // Anchor count < 3 is concerning
  if (device.anchorsSeen !== undefined && device.anchorsSeen < 3) {
    return { level: 'degraded', issues };
  }

  // Other issues are warnings
  return { level: 'warning', issues };
}

/**
 * Get CSS class name for health level
 */
export function getHealthColorClass(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'healthHealthy';
    case 'warning':
      return 'healthWarning';
    case 'degraded':
      return 'healthDegraded';
    case 'unknown':
    default:
      return 'healthUnknown';
  }
}

/**
 * Get a human-readable label for health level
 */
export function getHealthLabel(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'Healthy';
    case 'warning':
      return 'Warning';
    case 'degraded':
      return 'Degraded';
    case 'unknown':
    default:
      return 'Unknown';
  }
}
