import { describe, it, expect } from 'vitest';
import { configToParams } from '../configParams.js';
import type { DeviceConfig } from '../types.js';

describe('configToParams', () => {
  it('includes rangefinder forwarding parameters when provided', () => {
    const config: DeviceConfig = {
      wifi: { mode: 1, enableUartBridge: 1 },
      uwb: {
        mode: 4,
        uwbEnable: 0,
        devShortAddr: '1',
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
});
