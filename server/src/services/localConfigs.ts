import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DeviceConfig, LocalConfig, LocalConfigInfo } from '../../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class LocalConfigService {
  // Explicit path resolved from __dirname (server/src/services -> server/configs)
  private readonly configDir = path.resolve(__dirname, '../../configs');

  /**
   * Strict name validation - alphanumeric, dash, underscore only.
   * Prevents path traversal attacks.
   */
  private validateName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length <= 64;
  }

  /**
   * Ensure the configs directory exists.
   */
  async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  /**
   * List all saved configurations.
   */
  async list(): Promise<LocalConfigInfo[]> {
    await this.ensureConfigDir();

    try {
      const files = await fs.readdir(this.configDir);
      const configs: LocalConfigInfo[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.configDir, file);
        const stat = await fs.stat(filePath);
        const name = file.replace('.json', '');

        // Validate name to skip any invalid files
        if (!this.validateName(name)) continue;

        configs.push({
          name,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      }

      // Sort by name
      return configs.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  /**
   * Read a specific configuration by name.
   */
  async read(name: string): Promise<LocalConfig | null> {
    if (!this.validateName(name)) {
      return null;
    }

    const filePath = path.join(this.configDir, `${name}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stat = await fs.stat(filePath);
      const config = JSON.parse(content) as DeviceConfig;

      return {
        name,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        config,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save a configuration with the given name.
   * Overwrites if exists.
   */
  async save(name: string, config: DeviceConfig): Promise<boolean> {
    if (!this.validateName(name)) {
      return false;
    }

    await this.ensureConfigDir();
    const filePath = path.join(this.configDir, `${name}.json`);

    try {
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error(`Failed to save config ${name}:`, err);
      return false;
    }
  }

  /**
   * Delete a configuration by name.
   */
  async delete(name: string): Promise<boolean> {
    if (!this.validateName(name)) {
      return false;
    }

    const filePath = path.join(this.configDir, `${name}.json`);

    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const localConfigService = new LocalConfigService();
