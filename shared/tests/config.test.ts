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

  it('validates UWB runtime enable as boolean-like byte', () => {
    const result = validateConfig({
      uwb: { uwbEnable: 3 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('UWB runtime enable must be 0 or 1');
  });

  it('validates covariance enable as boolean-like byte', () => {
    const result = validateConfig({
      uwb: { enableCovMatrix: 3 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Covariance matrix enable must be 0 or 1');
  });

  it('requires a positive RMSE threshold', () => {
    const result = validateConfig({
      uwb: { rmseThreshold: 0 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RMSE threshold must be a positive number');
  });

  it('validates output backend as boolean-like byte', () => {
    const result = validateConfig({
      uwb: { outputBackend: 2 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Output backend must be 0 or 1');
  });

  it('validates RTLSLink beacon age bias range', () => {
    const result = validateConfig({
      uwb: { rtlsBeaconAgeBiasMs: 50 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RTLSLink beacon age bias must be an integer in 0-20 ms');
  });

  it('validates RTLSLink beacon TDoA physical guard settings', () => {
    const result = validateConfig({
      uwb: {
        rtlsBeaconTdoaPhysicalGuardEnable: 2,
        rtlsBeaconTdoaPhysicalGuardMarginM: -1,
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RTLSLink beacon TDoA physical guard enable must be 0 or 1');
    expect(result.errors).toContain('RTLSLink beacon TDoA physical guard margin must be >= 0 m');
  });

  it('validates TDoA matcher policy', () => {
    const result = validateConfig({
      uwb: { tdoaMatcherPolicy: 3 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('TDoA matcher policy must be 0 or 1');
  });

  it('validates TDoA anchor telemetry settings', () => {
    const result = validateConfig({
      uwb: {
        tdoaAnchorTelemetryEnable: 2,
        tdoaAnchorTelemetryIntervalMs: 100,
        tdoaAnchorTelemetryPort: 0,
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('TDoA anchor telemetry enable must be 0 or 1');
    expect(result.errors).toContain('TDoA anchor telemetry interval must be an integer in 250-60000 ms');
    expect(result.errors).toContain('TDoA anchor telemetry port must be an integer in 1-65535');
  });
});
