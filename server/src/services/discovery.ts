import dgram from 'dgram';
import { Device, DiscoveryOptions } from '../../../shared/types.js';

const DISCOVER_COMMAND = 'RTLS_DISCOVER';
const DEFAULT_OPTIONS: DiscoveryOptions = {
  broadcastAddress: '192.168.0.255',
  port: 3333,
  timeout: 2000,
};

export class DiscoveryService {
  private devices: Map<string, Device> = new Map();

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getDevice(ip: string): Device | undefined {
    return this.devices.get(ip);
  }

  async discover(options: Partial<DiscoveryOptions> = {}): Promise<Device[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const discovered: Device[] = [];
    const seen = new Set<string>();

    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');

      socket.on('message', (msg, rinfo) => {
        if (seen.has(rinfo.address)) return;
        seen.add(rinfo.address);

        try {
          const data = JSON.parse(msg.toString());
          const device = this.parseDeviceResponse(data, rinfo.address);
          discovered.push(device);
          this.devices.set(device.ip, device);
        } catch (e) {
          // Invalid JSON, skip
        }
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(
          DISCOVER_COMMAND,
          opts.port,
          opts.broadcastAddress,
          (err) => {
             if (err) console.error('Error sending discovery packet:', err);
          }
        );
      });

      setTimeout(() => {
        try {
            socket.close();
        } catch (e) {
            // ignore if already closed
        }
        resolve(discovered);
      }, opts.timeout);
    });
  }

  private parseDeviceResponse(data: any, ip: string): Device {
    return {
      ip,
      id: data.id ?? 'unknown',
      role: data.role ?? 'unknown',
      mac: data.mac ?? '',
      uwbShort: data.uwb_short ?? '',
      mavSysId: data.mav_sysid ?? 0,
      firmware: data.fw ?? '',
      online: true,
      lastSeen: new Date(),
    };
  }
}
