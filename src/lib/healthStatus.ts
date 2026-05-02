import type { DeviceHealth, HealthLevel } from '@shared/types';

export type { DeviceHealth, HealthLevel };

export const unknownHealth: DeviceHealth = {
  level: 'unknown',
  issues: ['No health data'],
};

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
