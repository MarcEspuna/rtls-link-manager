import { AnchorConfig } from './types';

export const MAX_CONFIGURABLE_ANCHORS = 8;

const normalizeShortAddr = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '0';
  const value = String(raw).trim();
  if (!value) return '0';
  if (/^\d{1,2}$/.test(value)) return value;

  if (/^[0-9a-fA-F]{4}$/.test(value)) {
    const hi = parseInt(value.slice(0, 2), 16);
    const lo = parseInt(value.slice(2, 4), 16);
    const chars = [hi, lo]
      .filter((b) => b !== 0)
      .map((b) => String.fromCharCode(b))
      .join('');
    const digits = chars.replace(/[^0-9]/g, '');
    return digits.replace(/^0+/, '') || '0';
  }

  return value;
};

const parseAnchorCoordinate = (raw: unknown): number => {
  if (raw === null || raw === undefined) return Number.NaN;
  const value = String(raw).trim();
  if (!value) return Number.NaN;
  return Number(value);
};

/**
 * Transform flat anchor fields from firmware backup to an anchors array.
 * Firmware stores: devId1, x1, y1, z1, devId2, x2, y2, z2, etc.
 * UI expects: anchors: [{id, x, y, z}, ...]
 */
export function flatToAnchors(uwb: Record<string, any>, anchorCount: number): AnchorConfig[] {
  const anchors: AnchorConfig[] = [];
  const count = Math.min(anchorCount || 0, MAX_CONFIGURABLE_ANCHORS);

  for (let i = 1; i <= count; i++) {
    const rawId = uwb[`devId${i}`];
    anchors.push({
      id: rawId === null || rawId === undefined || String(rawId).trim() === ''
        ? ''
        : normalizeShortAddr(rawId),
      x: parseAnchorCoordinate(uwb[`x${i}`]),
      y: parseAnchorCoordinate(uwb[`y${i}`]),
      z: parseAnchorCoordinate(uwb[`z${i}`]),
    });
  }

  return anchors;
}

/**
 * Transform anchors array to individual parameter write commands.
 * Returns array of {name, value} pairs to write to device.
 */
export function getAnchorWriteCommands(anchors: AnchorConfig[]): Array<{ name: string; value: string | number }> {
  const validationError = validateAnchorList(anchors);
  if (validationError) {
    throw new Error(validationError);
  }

  const commands: Array<{ name: string; value: string | number }> = [];

  // Write each anchor's fields
  for (let i = 0; i < anchors.length && i < MAX_CONFIGURABLE_ANCHORS; i++) {
    const n = i + 1;
    commands.push({ name: `devId${n}`, value: normalizeShortAddr(anchors[i].id) });
    commands.push({ name: `x${n}`, value: anchors[i].x });
    commands.push({ name: `y${n}`, value: anchors[i].y });
    commands.push({ name: `z${n}`, value: anchors[i].z });
  }

  // Firmware applies live static geometry when anchorCount is written, so keep
  // anchorCount last after the per-anchor fields are stored.
  commands.push({ name: 'anchorCount', value: Math.min(anchors.length, MAX_CONFIGURABLE_ANCHORS) });

  return commands;
}

export function normalizeUwbShortAddr(raw: unknown): string {
  return normalizeShortAddr(raw);
}

export function validateAnchorList(anchors: AnchorConfig[]): string | null {
  if (anchors.length === 0) {
    return 'Anchor geometry required when anchorCount is set';
  }

  if (anchors.length > MAX_CONFIGURABLE_ANCHORS) {
    return `Maximum ${MAX_CONFIGURABLE_ANCHORS} anchors supported`;
  }

  const seen = new Set<number>();
  for (const anchor of anchors) {
    if (anchor.id === null || anchor.id === undefined || String(anchor.id).trim() === '') {
      return `Anchor IDs must be 0-${MAX_CONFIGURABLE_ANCHORS - 1}`;
    }
    const normalizedId = normalizeShortAddr(anchor.id);
    if (!/^\d+$/.test(normalizedId)) {
      return `Anchor IDs must be 0-${MAX_CONFIGURABLE_ANCHORS - 1}`;
    }

    const id = Number(normalizedId);
    if (!Number.isInteger(id) || id < 0 || id >= MAX_CONFIGURABLE_ANCHORS) {
      return `Anchor IDs must be 0-${MAX_CONFIGURABLE_ANCHORS - 1}`;
    }

    if (seen.has(id)) {
      return 'Anchor IDs must be unique';
    }
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) {
      return 'Anchor coordinates must be finite numbers';
    }
    seen.add(id);
  }

  for (let expected = 0; expected < anchors.length; expected++) {
    if (!seen.has(expected)) {
      return 'Anchor IDs must be contiguous from 0';
    }
  }

  return null;
}

export function validateStaticTagAnchorList(anchors: AnchorConfig[], use2DEstimator: 0 | 1 = 1): string | null {
  const anchorError = validateAnchorList(anchors);
  if (anchorError) {
    return anchorError;
  }

  const use3DEstimator = use2DEstimator === 0;
  if (anchors.length < 4) {
    return `${use3DEstimator ? '3D' : '2D'} TAG_TDOA static geometry requires at least 4 anchors`;
  }
  if (use3DEstimator && !anchorsAreNonCoplanar3D(anchors)) {
    return '3D TAG_TDOA static geometry requires non-coplanar anchors';
  }

  return null;
}

export function anchorsAreNonCoplanar3D(anchors: Array<{ x: number; y: number; z: number }>): boolean {
  if (anchors.length < 4) return false;

  const p0 = anchors[0];
  const vec = (p: typeof p0) => ({ x: p.x - p0.x, y: p.y - p0.y, z: p.z - p0.z });
  const norm2 = (v: ReturnType<typeof vec>) => v.x * v.x + v.y * v.y + v.z * v.z;
  const cross = (a: ReturnType<typeof vec>, b: ReturnType<typeof vec>) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const dot = (a: ReturnType<typeof vec>, b: ReturnType<typeof vec>) => a.x * b.x + a.y * b.y + a.z * b.z;

  const v1 = anchors.slice(1).map(vec).find((v) => norm2(v) > 1e-6);
  if (!v1) return false;

  const normal = anchors.slice(1).map(vec).map((v) => cross(v1, v)).find((n) => norm2(n) > 1e-8);
  if (!normal) return false;

  const normalNorm = Math.sqrt(norm2(normal));
  const scale = Math.max(1, ...anchors.slice(1).map((p) => Math.sqrt(norm2(vec(p)))));
  const tolerance = Math.max(0.01, scale * 0.001);
  return anchors.slice(1).map(vec).some((v) => Math.abs(dot(normal, v)) / normalNorm > tolerance);
}
