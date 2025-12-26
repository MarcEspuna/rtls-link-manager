import { FastifyPluginAsync } from 'fastify';
import { discoveryService } from '../services/discovery.js';

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  // Get cached devices (auto-prunes stale devices)
  app.get('/devices', async () => {
    return { devices: discoveryService.getDevices() };
  });

  // Clear device list
  app.delete('/devices', async () => {
    discoveryService.clearDevices();
    return { success: true };
  });

  // Get single device
  app.get('/devices/:ip', async (req) => {
    const { ip } = req.params as { ip: string };
    const device = discoveryService.getDevice(ip);
    if (!device) {
      return { error: 'Device not found' };
    }
    return { device };
  });
};
