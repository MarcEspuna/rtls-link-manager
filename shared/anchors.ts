import { AnchorConfig } from './types';

/**
 * Transform flat anchor fields from firmware backup to an anchors array.
 * Firmware stores: devId1, x1, y1, z1, devId2, x2, y2, z2, etc.
 * UI expects: anchors: [{id, x, y, z}, ...]
 */
export function flatToAnchors(uwb: Record<string, any>, anchorCount: number): AnchorConfig[] {
  const anchors: AnchorConfig[] = [];
  const count = Math.min(anchorCount || 0, 6);

  for (let i = 1; i <= count; i++) {
    anchors.push({
      id: uwb[`devId${i}`] || '0000',
      x: parseFloat(uwb[`x${i}`]) || 0,
      y: parseFloat(uwb[`y${i}`]) || 0,
      z: parseFloat(uwb[`z${i}`]) || 0,
    });
  }

  return anchors;
}

/**
 * Transform anchors array to individual parameter write commands.
 * Returns array of {name, value} pairs to write to device.
 */
export function getAnchorWriteCommands(anchors: AnchorConfig[]): Array<{ name: string; value: string | number }> {
  const commands: Array<{ name: string; value: string | number }> = [];

  // Write each anchor's fields
  for (let i = 0; i < anchors.length && i < 6; i++) {
    const n = i + 1;
    commands.push({ name: `devId${n}`, value: anchors[i].id });
    commands.push({ name: `x${n}`, value: anchors[i].x });
    commands.push({ name: `y${n}`, value: anchors[i].y });
    commands.push({ name: `z${n}`, value: anchors[i].z });
  }

  // Update anchor count
  commands.push({ name: 'anchorCount', value: anchors.length });

  return commands;
}
