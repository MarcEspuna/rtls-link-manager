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
  });
});
