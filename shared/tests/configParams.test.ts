import { describe, it, expect } from 'vitest';
import { configToParams } from '../configParams.js';
import type { DeviceConfig } from '../types.js';

describe('configToParams', () => {
  it('includes rangefinder forwarding parameters when provided', () => {
    const config: DeviceConfig = {
      wifi: { mode: 1 },
      uwb: {
        mode: 4,
        devShortAddr: '1',
        rfForwardEnable: 1,
        rfForwardSensorId: 7,
        rfForwardOrientation: 25,
        rfForwardPreserveSrcIds: 1,
      },
      app: {},
    };

    const params = configToParams(config);

    expect(params).toContainEqual(['uwb', 'rfForwardEnable', '1']);
    expect(params).toContainEqual(['uwb', 'rfForwardSensorId', '7']);
    expect(params).toContainEqual(['uwb', 'rfForwardOrientation', '25']);
    expect(params).toContainEqual(['uwb', 'rfForwardPreserveSrcIds', '1']);
  });
});
