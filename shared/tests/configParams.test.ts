import { describe, it, expect } from 'vitest';
import { configToParams } from '../configParams.js';
import { getAnchorWriteCommands } from '../anchors.js';
import type { DeviceConfig } from '../types.js';

describe('configToParams', () => {
  it('includes rangefinder forwarding parameters when provided', () => {
    const config: DeviceConfig = {
      wifi: { mode: 1, enableUartBridge: 1 },
      uwb: {
        mode: 4,
        uwbEnable: 0,
        devShortAddr: '1',
        anchors: [
          { id: '0', x: 0, y: 0, z: 0 },
          { id: '1', x: 1, y: 0, z: 0 },
        ],
        rfForwardEnable: 1,
        rfForwardSensorId: 7,
        rfForwardOrientation: 25,
        rfForwardPreserveSrcIds: 1,
        enableCovMatrix: 1,
        rmseThreshold: 0.8,
        outputBackend: 1,
        rtlsBeaconAgeBiasMs: 2,
        rtlsBeaconTdoaSigmaFloorM: 0.25,
        rtlsBeaconTdoaPhysicalGuardEnable: 1,
        rtlsBeaconTdoaPhysicalGuardMarginM: 1,
        tdoaAnchorTelemetryEnable: 1,
        tdoaAnchorTelemetryIntervalMs: 1000,
        tdoaAnchorTelemetryPort: 3335,
        tdoaMatcherPolicy: 1,
      },
      app: {},
    };

    const params = configToParams(config);

    expect(params).toContainEqual(['wifi', 'enableUartBridge', '1']);
    expect(params).toContainEqual(['uwb', 'uwbEnable', '0']);
    expect(params).toContainEqual(['uwb', 'rfForwardEnable', '1']);
    expect(params).toContainEqual(['uwb', 'rfForwardSensorId', '7']);
    expect(params).toContainEqual(['uwb', 'rfForwardOrientation', '25']);
    expect(params).toContainEqual(['uwb', 'rfForwardPreserveSrcIds', '1']);
    expect(params).toContainEqual(['uwb', 'enableCovMatrix', '1']);
    expect(params).toContainEqual(['uwb', 'rmseThreshold', '0.8']);
    expect(params).toContainEqual(['uwb', 'outputBackend', '1']);
    expect(params).toContainEqual(['uwb', 'rtlsBeaconAgeBiasMs', '2']);
    expect(params).toContainEqual(['uwb', 'rtlsBeaconTdoaSigmaFloorM', '0.25']);
    expect(params).toContainEqual(['uwb', 'rtlsBeaconTdoaPhysicalGuardEnable', '1']);
    expect(params).toContainEqual(['uwb', 'rtlsBeaconTdoaPhysicalGuardMarginM', '1']);
    expect(params).toContainEqual(['uwb', 'tdoaAnchorTelemetryEnable', '1']);
    expect(params).toContainEqual(['uwb', 'tdoaAnchorTelemetryIntervalMs', '1000']);
    expect(params).toContainEqual(['uwb', 'tdoaAnchorTelemetryPort', '3335']);
    expect(params).not.toContainEqual(['uwb', 'tdoaMatcherPolicy', '1']);
  });

  it('rejects oversized flattened anchor writes before upload', () => {
    const config: DeviceConfig = {
      wifi: {},
      uwb: {
        mode: 4,
        anchors: Array.from({ length: 9 }, (_, id) => ({ id: String(id), x: id, y: id + 1, z: id + 2 })),
      },
      app: {},
    };

    expect(() => configToParams(config)).toThrow('Maximum 8 anchors supported');
  });

  it('rejects invalid anchor write commands before upload', () => {
    expect(() => getAnchorWriteCommands([
      { id: '0', x: 0, y: 0, z: 0 },
      { id: '00', x: 1, y: 0, z: 0 },
    ])).toThrow('Anchor IDs must be unique');

    expect(() => getAnchorWriteCommands([
      { id: '8', x: 0, y: 0, z: 0 },
    ])).toThrow('Anchor IDs must be 0-7');

    expect(() => getAnchorWriteCommands([
      { id: '', x: 0, y: 0, z: 0 },
    ])).toThrow('Anchor IDs must be 0-7');

    expect(() => getAnchorWriteCommands([
      { id: '0', x: 0, y: 0, z: 0 },
      { id: '2', x: 1, y: 0, z: 0 },
    ])).toThrow('Anchor IDs must be contiguous from 0');
  });

  it('writes anchor geometry before anchorCount and skips positive count-only fallbacks', () => {
    const params = configToParams({
      wifi: {},
      uwb: {
        mode: 4,
        anchors: [
          { id: '0', x: 0, y: 0, z: 0 },
          { id: '1', x: 1, y: 0, z: 0 },
        ],
      },
      app: {},
    });

    expect(params).toContainEqual(['uwb', 'anchorCount', '2']);
    expect(params.findIndex(([, name]) => name === 'anchorCount'))
      .toBeGreaterThan(params.findIndex(([, name]) => name === 'devId2'));
    expect(params.findIndex(([, name]) => name === 'mode'))
      .toBeGreaterThan(params.findIndex(([, name]) => name === 'anchorCount'));

    expect(() => configToParams({
      wifi: {},
      uwb: { mode: 4, anchorCount: 5 },
      app: {},
    })).toThrow('Anchor geometry required when anchorCount is set');

    expect(() => configToParams({
      wifi: {},
      uwb: { mode: 4, anchorCount: 0 },
      app: {},
    })).toThrow('Anchor count must be positive when set');
  });

  it('requires anchor geometry for TAG_TDOA configs', () => {
    expect(() => configToParams({
      wifi: {},
      uwb: { mode: 4 },
      app: {},
    })).toThrow('Anchor geometry required for TAG_TDOA configs');
  });

  it('allows dynamic TAG_TDOA configs without writing static anchor geometry', () => {
    const params = configToParams({
      wifi: {},
      uwb: {
        mode: 4,
        dynamicAnchorPosEnabled: 1,
        use2DEstimator: 0,
        anchorPlaneSeparation: 2,
        anchorCount: 8,
      },
      app: {},
    });

    expect(params).toContainEqual(['uwb', 'dynamicAnchorPosEnabled', '1']);
    expect(params).toContainEqual(['uwb', 'use2DEstimator', '0']);
    expect(params).toContainEqual(['uwb', 'anchorPlaneSeparation', '2']);
    const paramIndex = (name: string) => params.findIndex(([, paramName]) => paramName === name);
    expect(paramIndex('anchorPlaneSeparation')).toBeLessThan(paramIndex('dynamicAnchorPosEnabled'));
    expect(paramIndex('dynamicAnchorPosEnabled')).toBeLessThan(paramIndex('use2DEstimator'));
    expect(params.some(([, name]) => name === 'anchorCount')).toBe(false);
    expect(params.some(([, name]) => name.startsWith('devId'))).toBe(false);
  });

  it('allows anchor-mode configs without tag anchor geometry', () => {
    const params = configToParams({
      wifi: {},
      uwb: { mode: 3 },
      app: {},
    });

    expect(params).toContainEqual(['uwb', 'mode', '3']);
    expect(params.some(([, name]) => name === 'anchorCount')).toBe(false);
  });

  it('allows anchor-mode backups with zero anchorCount and empty anchors', () => {
    const params = configToParams({
      wifi: {},
      uwb: { mode: 3, anchorCount: 0, anchors: [] },
      app: {},
    });

    expect(params).toContainEqual(['uwb', 'mode', '3']);
    expect(params.some(([, name]) => name === 'anchorCount')).toBe(false);
  });

  it('rejects anchorCount that does not match provided geometry', () => {
    expect(() => configToParams({
      wifi: {},
      uwb: {
        mode: 4,
        anchorCount: 5,
        anchors: [],
      },
      app: {},
    })).toThrow('Anchor geometry required when anchorCount is set');
  });

  it('rejects anchor writes with malformed coordinates', () => {
    expect(() => configToParams({
      wifi: {},
      uwb: {
        mode: 4,
        anchors: [
          { id: '0', x: Number.NaN, y: 0, z: 0 },
        ],
      },
      app: {},
    })).toThrow('Anchor coordinates must be finite numbers');
  });
});
