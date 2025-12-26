import { useState, useCallback } from 'react';
import { isJsonCommand } from '@shared/commands';

interface UseDeviceWebSocketOptions {
  timeout?: number;
  proxyUrl?: string; // e.g. ws://localhost:3000/ws
}

export function useDeviceCommand(deviceIp: string, options: UseDeviceWebSocketOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCommand = useCallback(async <T = unknown>(command: string): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const directUrl = `ws://${deviceIp}/ws`;
      const proxyUrl = options.proxyUrl
        ? `${options.proxyUrl}?ip=${deviceIp}`
        : null;

      const run = (url: string) => new Promise<T>((resolve, reject) => {
        const ws = new WebSocket(url);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Command timeout'));
        }, options.timeout ?? 5000);

        ws.onopen = () => ws.send(command);

        ws.onmessage = (event) => {
          clearTimeout(timeout);
          ws.close();

          if (isJsonCommand(command)) {
            try {
              const raw = typeof event.data === 'string' ? event.data : String(event.data);
              const jsonStart = raw.indexOf('{');
              const payload = jsonStart !== -1 ? raw.substring(jsonStart) : raw;
              resolve(JSON.parse(payload) as T);
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
            return;
          }

          resolve(event.data as T);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket error'));
        };
      });

      return await run(directUrl).catch((err) => {
        if (!proxyUrl) throw err;
        return run(proxyUrl);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [deviceIp, options.timeout, options.proxyUrl]);

  return { sendCommand, loading, error };
}
