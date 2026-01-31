import { useState, useCallback } from 'react';
import { isJsonCommand } from '@shared/commands';
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

  const parseResponse = <T,>(command: string, raw: string): T => {
    if (!isJsonCommand(command)) {
      return raw as T;
    }
    const jsonStart = raw.indexOf('{');
    const payload = jsonStart !== -1 ? raw.substring(jsonStart) : raw;
    return JSON.parse(payload) as T;
  };

  const sendCommand = useCallback(async <T = unknown>(command: string): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const raw = await sendDeviceCommand(deviceIp, command, timeoutMs);
      return parseResponse<T>(command, raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [deviceIp, timeoutMs]);

  const sendCommandsBatch = useCallback(async (commands: string[]): Promise<string[] | null> => {
    setLoading(true);
    setError(null);

    try {
      const results = await sendDeviceCommands(deviceIp, commands, timeoutMs);
      return results;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [deviceIp, timeoutMs]);

  // No-op close for API compatibility with useDeviceWebSocket
  const close = useCallback(() => {}, []);

  return { sendCommand, sendCommands: sendCommandsBatch, loading, error, close };
}
