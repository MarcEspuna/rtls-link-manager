import { FastifyPluginAsync } from 'fastify';
import { DiscoveryService } from '../services/discovery.js';

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  const discovery = new DiscoveryService();

  // Get cached devices
  app.get('/devices', async () => {
    return { devices: discovery.getDevices() };
  });

  // Trigger new discovery
  app.post('/devices/discover', async (req) => {
    const {
      broadcast = '192.168.0.255',
      port = 3333,
      timeout = 2000,
    } = (req.body as any) || {};
    const devices = await discovery.discover({
      broadcastAddress: broadcast,
      port,
      timeout,
    });
    return { devices };
  });

  // Get single device
  app.get('/devices/:ip', async (req) => {
    const { ip } = req.params as { ip: string };
    const device = discovery.getDevice(ip);
    if (!device) {
      return { error: 'Device not found' };
    }
    return { device };
  });
};
