import { useState, useCallback } from 'react';
import { sendDeviceCommand, sendDeviceCommands } from '../lib/tauri-api';

interface UseDeviceCommandOptions {
  timeout?: number;
}

/**
 * React hook for sending commands to devices via the Tauri backend.
 *
 * Replaces useDeviceWebSocket — all device communication now goes through
 * the Rust backend instead of direct browser WebSocket connections.
 */
export function useDeviceCommand(deviceIp: string, options: UseDeviceCommandOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutMs = options.timeout ?? 5000;

  const sendCommand = useCallback(async <T = unknown>(command: string): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await sendDeviceCommand(deviceIp, command, timeoutMs);
      return (response.json ?? response.raw) as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [deviceIp, timeoutMs]);

  const sendCommandsBatch = useCallback(async (commands: string[]): Promise<string[]> => {
    setLoading(true);
    setError(null);

    try {
      const results = await sendDeviceCommands(deviceIp, commands, timeoutMs);
      return results.map((r) => r.raw);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [deviceIp, timeoutMs]);

  // No-op close for API compatibility with useDeviceWebSocket
  const close = useCallback(() => {}, []);

  return { sendCommand, sendCommands: sendCommandsBatch, loading, error, close };
}
