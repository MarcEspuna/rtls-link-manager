import { describe, it, expect } from 'vitest';
import { validateConfig } from '../config.js';

describe('validateConfig', () => {
  it('requires ssidST for station mode', () => {
    const result = validateConfig({
      wifi: { mode: 1 }  // Station mode without SSID
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Station mode requires ssidST');
  });

  it('limits anchor count to 6', () => {
    const result = validateConfig({
      uwb: { anchorCount: 8 } as any
    });
    expect(result.valid).toBe(false);
  });

  it('validates rangefinder forwarding sensor ID byte range', () => {
    const result = validateConfig({
      uwb: { rfForwardSensorId: 300 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rangefinder sensor ID must be an integer in 0-255');
  });
});
