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

  it('limits anchor count to 8', () => {
    const result = validateConfig({
      uwb: { anchorCount: 9 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Maximum 8 anchors supported');
  });

  it('requires geometry when anchorCount is positive', () => {
    const result = validateConfig({
      uwb: { anchorCount: 5 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor geometry required when anchorCount is set');
  });

  it('rejects zero anchorCount', () => {
    const result = validateConfig({
      uwb: { anchorCount: 0 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor count must be positive when set');
  });

  it('requires anchor geometry for TAG_TDOA configs', () => {
    const result = validateConfig({
      uwb: { mode: 4 } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor geometry required for TAG_TDOA configs');
  });

  it('allows dynamic TAG_TDOA configs without static anchor geometry', () => {
    const result = validateConfig({
      uwb: {
        mode: 4,
        dynamicAnchorPosEnabled: 1,
        use2DEstimator: 1,
        anchorCount: 8,
      } as any
    });
    expect(result.valid).toBe(true);
  });

  it('requires plane separation for dynamic 3D TAG_TDOA configs', () => {
    const result = validateConfig({
      uwb: {
        mode: 4,
        dynamicAnchorPosEnabled: 1,
        use2DEstimator: 0,
        anchorPlaneSeparation: 0,
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('3D dynamic anchors require a positive anchor plane separation');
  });

  it('rejects coplanar static geometry for 3D TAG_TDOA configs', () => {
    const result = validateConfig({
      uwb: {
        mode: 4,
        use2DEstimator: 0,
        anchors: [
          { id: '0', x: 0, y: 0, z: 0 },
          { id: '1', x: 3, y: 0, z: 0 },
          { id: '2', x: 3, y: 4, z: 0 },
          { id: '3', x: 0, y: 4, z: 0 },
        ],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('3D TAG_TDOA static geometry requires non-coplanar anchors');
  });

  it('accepts two-plane static geometry for 3D TAG_TDOA configs', () => {
    const result = validateConfig({
      uwb: {
        mode: 4,
        use2DEstimator: 0,
        anchors: [
          { id: '0', x: 0, y: 0, z: 0 },
          { id: '1', x: 3, y: 0, z: 0 },
          { id: '2', x: 3, y: 4, z: 0 },
          { id: '3', x: 0, y: 4, z: 0 },
          { id: '4', x: 0, y: 0, z: 2 },
          { id: '5', x: 3, y: 0, z: 2 },
          { id: '6', x: 3, y: 4, z: 2 },
          { id: '7', x: 0, y: 4, z: 2 },
        ],
      } as any
    });
    expect(result.valid).toBe(true);
  });

  it('allows anchor-mode configs without tag anchor geometry', () => {
    const result = validateConfig({
      uwb: { mode: 3 } as any
    });
    expect(result.valid).toBe(true);
  });

  it('allows anchor-mode backups with zero anchorCount and empty anchors', () => {
    const result = validateConfig({
      uwb: {
        mode: 3,
        anchorCount: 0,
        anchors: [],
      } as any
    });
    expect(result.valid).toBe(true);
  });

  it('rejects anchorCount that does not match provided geometry', () => {
    const result = validateConfig({
      uwb: {
        anchorCount: 5,
        anchors: [],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor geometry required when anchorCount is set');
  });

  it('rejects duplicate configured anchor IDs', () => {
    const result = validateConfig({
      uwb: {
        anchors: [
          { id: '1', x: 0, y: 0, z: 0 },
          { id: '01', x: 1, y: 0, z: 0 },
        ],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor IDs must be unique');
  });

  it('rejects anchor IDs outside firmware range', () => {
    const result = validateConfig({
      uwb: {
        anchors: [
          { id: '8', x: 0, y: 0, z: 0 },
        ],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor IDs must be 0-7');
  });

  it('rejects blank configured anchor IDs', () => {
    const result = validateConfig({
      uwb: {
        anchors: [
          { id: '', x: 0, y: 0, z: 0 },
        ],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor IDs must be 0-7');
  });

  it('rejects non-contiguous configured anchor IDs', () => {
    const result = validateConfig({
      uwb: {
        anchors: [
          { id: '0', x: 0, y: 0, z: 0 },
          { id: '2', x: 1, y: 0, z: 0 },
        ],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor IDs must be contiguous from 0');
  });

  it('rejects missing configured anchor coordinates', () => {
    const result = validateConfig({
      uwb: {
        anchors: [
          { id: '0', x: Number.NaN, y: 0, z: 0 },
        ],
      } as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Anchor coordinates must be finite numbers');
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
