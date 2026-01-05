import { FastifyPluginAsync } from 'fastify';
import { localConfigService } from '../services/localConfigs.js';
import { DeviceConfig } from '../../../shared/types.js';

// Helper to validate config name format
const isValidName = (name: string) => /^[a-zA-Z0-9_-]+$/.test(name) && name.length <= 64;

export const configRoutes: FastifyPluginAsync = async (app) => {
  // List all local configs
  app.get('/configs', async () => {
    const configs = await localConfigService.list();
    return { configs };
  });

  // Get a specific local config
  app.get('/configs/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!isValidName(name)) {
      return reply.code(400).send({ error: 'Invalid config name' });
    }
    const config = await localConfigService.read(name);
    if (!config) {
      return reply.code(404).send({ error: 'Config not found' });
    }
    return { config };
  });

  // Save/update a local config
  app.put('/configs/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!isValidName(name)) {
      return reply.code(400).send({ error: 'Invalid config name' });
    }
    const config = req.body as DeviceConfig;
    if (!config) {
      return reply.code(400).send({ error: 'Config body required' });
    }

    const success = await localConfigService.save(name, config);
    if (!success) {
      return reply.code(500).send({ error: 'Failed to save config' });
    }
    return { success: true };
  });

  // Delete a local config
  app.delete('/configs/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!isValidName(name)) {
      return reply.code(400).send({ error: 'Invalid config name' });
    }
    const success = await localConfigService.delete(name);
    if (!success) {
      return reply.code(404).send({ error: 'Config not found' });
    }
    return { success: true };
  });
};
