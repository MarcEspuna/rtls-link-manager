import { describe, it, expect } from 'vitest';
import { calculateDeviceHealth } from '../../src/lib/healthStatus';
import { Device, DeviceRole } from '../types';

function makeDevice(overrides: Partial<Device> & { role: DeviceRole }): Device {
  return {
    ip: '192.168.1.100',
    id: 'test-device',
    mac: 'AA:BB:CC:DD:EE:FF',
    uwbShort: '1',
    mavSysId: 1,
    firmware: '1.0.0',
    ...overrides,
  };
}

describe('calculateDeviceHealth', () => {
  describe('anchor devices', () => {
    it('returns healthy for anchor role', () => {
      const device = makeDevice({ role: 'anchor' });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('healthy');
      expect(health.issues).toHaveLength(0);
    });

    it('returns healthy for anchor_tdoa role', () => {
      const device = makeDevice({ role: 'anchor_tdoa' });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('healthy');
      expect(health.issues).toHaveLength(0);
    });
  });

  describe('tag devices with no telemetry (old firmware)', () => {
    it('returns unknown for tag with no telemetry', () => {
      const device = makeDevice({ role: 'tag' });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('unknown');
      expect(health.issues).toContain('No telemetry data');
    });

    it('returns unknown for tag_tdoa with no telemetry', () => {
      const device = makeDevice({ role: 'tag_tdoa' });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('unknown');
      expect(health.issues).toContain('No telemetry data');
    });
  });

  describe('tag devices with telemetry', () => {
    it('returns healthy when all indicators are good', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 4,
        originSent: true,
        rfEnabled: false,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('healthy');
      expect(health.issues).toHaveLength(0);
    });

    it('returns degraded when not sending positions', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: false,
        anchorsSeen: 4,
        originSent: true,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('degraded');
      expect(health.issues).toContain('Not sending positions');
    });

    it('returns degraded when seeing fewer than 3 anchors', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 2,
        originSent: true,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('degraded');
      expect(health.issues).toContain('Only seeing 2 anchors');
    });

    it('returns warning when origin not sent', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 4,
        originSent: false,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('warning');
      expect(health.issues).toContain('Origin not sent to autopilot');
    });

    it('returns warning when rangefinder enabled but unhealthy', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 4,
        originSent: true,
        rfEnabled: true,
        rfHealthy: false,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('warning');
      expect(health.issues).toContain('Rangefinder unhealthy');
    });

    it('returns healthy when rangefinder enabled and healthy', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 4,
        originSent: true,
        rfEnabled: true,
        rfHealthy: true,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('healthy');
      expect(health.issues).toHaveLength(0);
    });

    it('returns healthy when seeing exactly 3 anchors', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 3,
        originSent: true,
      });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('healthy');
      expect(health.issues).toHaveLength(0);
    });

    it('uses singular "anchor" when seeing only 1', () => {
      const device = makeDevice({
        role: 'tag_tdoa',
        sendingPos: true,
        anchorsSeen: 1,
        originSent: true,
      });
      const health = calculateDeviceHealth(device);
      expect(health.issues).toContain('Only seeing 1 anchor');
    });
  });

  describe('calibration and unknown roles', () => {
    it('returns unknown for calibration role', () => {
      const device = makeDevice({ role: 'calibration' });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('unknown');
    });

    it('returns unknown for unknown role', () => {
      const device = makeDevice({ role: 'unknown' });
      const health = calculateDeviceHealth(device);
      expect(health.level).toBe('unknown');
    });
  });
});
