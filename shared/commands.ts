export const Commands = {
  // Parameter commands
  readAll: (group?: string) =>
    group ? `readall ${group}` : 'readall all',

  readParam: (group: string, name: string) =>
    `read --group ${group} --name ${name}`,

  writeParam: (group: string, name: string, value: string | number) => {
    const safeValue = String(value).replace(/["\\]/g, '\\$&');
    return `write --group ${group} --name ${name} --data "${safeValue}"`;
  },

  // Config commands
  backupConfig: () => 'backup-config',
  saveConfig: () => 'save-config',
  loadConfig: () => 'load-config',
  listConfigs: () => 'list-configs',
  saveConfigAs: (name: string) => `save-config-as --name ${name}`,
  loadConfigNamed: (name: string) => `load-config-named --name ${name}`,
  deleteConfig: (name: string) => `delete-config --name ${name}`,

  // Control commands
  toggleLed: () => 'toggle-led2',
  getLedState: () => 'get-led2-state',
  reboot: () => 'reboot',
  start: () => 'start',
} as const;

// Commands that return JSON responses
export const JSON_COMMANDS = [
  'backup-config',
  'list-configs',
  'save-config-as',
  'load-config-named',
  'delete-config',
  'toggle-led2',
  'get-led2-state',
];

export function isJsonCommand(cmd: string): boolean {
  return JSON_COMMANDS.some(c => cmd.startsWith(c));
}
