import { describe, it, expect } from 'vitest';
import { Commands, isJsonCommand } from '../commands.js';

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
});

describe('isJsonCommand', () => {
  it('identifies JSON commands', () => {
    expect(isJsonCommand('backup-config')).toBe(true);
    expect(isJsonCommand('toggle-led2')).toBe(true);
    expect(isJsonCommand('readall all')).toBe(false);
  });
});
