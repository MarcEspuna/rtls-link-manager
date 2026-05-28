import { describe, it, expect } from 'vitest';
import { Commands, isStructuredResponseCommand } from '../commands.js';

describe('Commands', () => {
  it('builds readParam command correctly', () => {
    expect(Commands.readParam('wifi', 'mode'))
      .toBe('read -group wifi -name mode');
  });

  it('builds readAll command with group', () => {
    expect(Commands.readAll('wifi'))
      .toBe('readall wifi');
  });

  it('builds writeParam command with value', () => {
    expect(Commands.writeParam('uwb', 'mode', 4))
      .toBe('write -group uwb -name mode -data "4"');
  });

  it('builds anchor stats command', () => {
    expect(Commands.tdoaAnchorStats()).toBe('tdoa-anchor-stats');
  });
});

describe('isStructuredResponseCommand', () => {
  it('identifies structured response commands', () => {
    expect(isStructuredResponseCommand('backup-config')).toBe(true);
    expect(isStructuredResponseCommand('toggle-led2')).toBe(true);
    expect(isStructuredResponseCommand('tdoa-anchor-stats')).toBe(true);
    expect(isStructuredResponseCommand('readall all')).toBe(false);
  });
});
