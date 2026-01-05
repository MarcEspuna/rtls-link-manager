import dgram from 'dgram';
import { Device } from '../../../shared/types.js';

export class DiscoveryService {
  private devices: Map<string, Device> = new Map();
  private socket: dgram.Socket | null = null;
  private readonly TTL_MS = 5 * 1000; // 5 seconds (heartbeat timeout)
  private readonly PORT = 3333;

  start(): void {
    if (this.socket) return; // Already running

    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        const device = this.parseDeviceResponse(data, rinfo.address);
        this.devices.set(device.ip, device);
        console.log(`Heartbeat from ${device.id} (${device.ip})`);
      } catch (err) {
        console.error('Invalid heartbeat packet:', err);
      }
    });

    this.socket.on('error', (err) => {
      console.error('Discovery socket error:', err);
    });

    this.socket.bind(this.PORT, () => {
      console.log(`Listening for device heartbeats on port ${this.PORT}`);
    });
  }

  stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  getDevices(): Device[] {
    this.pruneStaleDevices();
    return Array.from(this.devices.values());
  }

  getDevice(ip: string): Device | undefined {
    this.pruneStaleDevices();
    return this.devices.get(ip);
  }

  clearDevices(): void {
    this.devices.clear();
  }

  private pruneStaleDevices(): void {
    const now = Date.now();
    for (const [ip, device] of this.devices) {
      if (device.lastSeen && now - device.lastSeen.getTime() > this.TTL_MS) {
        console.log(`Pruning stale device: ${device.id} (${ip})`);
        this.devices.delete(ip);
      }
    }
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
      // Telemetry fields - undefined if not present (old firmware)
      sendingPos: data.sending_pos,
      anchorsSeen: data.anchors_seen,
      originSent: data.origin_sent,
      rfEnabled: data.rf_enabled,
      rfHealthy: data.rf_healthy,
    };
  }
}

// Singleton instance that starts on import
export const discoveryService = new DiscoveryService();
discoveryService.start();
