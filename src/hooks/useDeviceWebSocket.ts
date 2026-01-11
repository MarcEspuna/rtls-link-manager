import { useState, useCallback, useEffect, useRef } from 'react';
import { isJsonCommand } from '@shared/commands';

interface UseDeviceWebSocketOptions {
  timeout?: number;
  proxyUrl?: string; // e.g. ws://localhost:3000/ws
  mode?: 'single' | 'persistent';
}

export function useDeviceCommand(deviceIp: string, options: UseDeviceWebSocketOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef<Promise<WebSocket> | null>(null);
  const queueRef = useRef<Array<{
    command: string;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }>>([]);
  const processingRef = useRef(false);
  const currentRef = useRef<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const connectionUrlRef = useRef<string | null>(null);

  const timeoutMs = options.timeout ?? 5000;
  const mode = options.mode ?? 'single';

  const parseResponse = <T,>(command: string, raw: string): T => {
    if (!isJsonCommand(command)) {
      return raw as T;
    }
    const jsonStart = raw.indexOf('{');
    const payload = jsonStart !== -1 ? raw.substring(jsonStart) : raw;
    return JSON.parse(payload) as T;
  };

  const clearSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    wsRef.current = null;
    wsReadyRef.current = null;
    connectionUrlRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearSocket();
    };
  }, [clearSocket]);

  const setupSocketHandlers = useCallback((ws: WebSocket) => {
    ws.onmessage = (event) => {
      const current = currentRef.current;
      if (!current) return;
      clearTimeout(current.timeoutId);
      currentRef.current = null;
      const payload = typeof event.data === 'string' ? event.data : String(event.data);
      current.resolve(payload);
    };

    ws.onerror = () => {
      const current = currentRef.current;
      if (current) {
        clearTimeout(current.timeoutId);
        currentRef.current = null;
        current.reject(new Error('WebSocket error'));
      }
    };

    ws.onclose = () => {
      const current = currentRef.current;
      if (current) {
        clearTimeout(current.timeoutId);
        currentRef.current = null;
        current.reject(new Error('WebSocket closed'));
      }
      wsRef.current = null;
    };
  }, []);

  const openSocket = useCallback((url: string) => {
    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url);
      const cleanup = () => {
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
      };
      ws.onopen = () => {
        cleanup();
        setupSocketHandlers(ws);
        wsRef.current = ws;
        connectionUrlRef.current = url;
        resolve(ws);
      };
      ws.onerror = () => {
        cleanup();
        reject(new Error('WebSocket error'));
      };
      ws.onclose = () => {
        cleanup();
        reject(new Error('WebSocket closed'));
      };
    });
  }, [setupSocketHandlers]);

  const ensureSocket = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }
    if (wsReadyRef.current) {
      return wsReadyRef.current;
    }

    const directUrl = `ws://${deviceIp}/ws`;
    const proxyUrl = options.proxyUrl ? `${options.proxyUrl}?ip=${deviceIp}` : null;
    const candidates = connectionUrlRef.current
      ? [connectionUrlRef.current]
      : [directUrl, proxyUrl].filter(Boolean) as string[];

    wsReadyRef.current = (async () => {
      let lastError: Error | null = null;
      for (const url of candidates) {
        try {
          return await openSocket(url);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('WebSocket error');
        }
      }
      throw lastError ?? new Error('WebSocket connection failed');
    })();

    try {
      return await wsReadyRef.current;
    } finally {
      wsReadyRef.current = null;
    }
  }, [deviceIp, openSocket, options.proxyUrl]);

  const sendWithSocket = useCallback(async (command: string) => {
    const ws = await ensureSocket();
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        currentRef.current = null;
        reject(new Error('Command timeout'));
      }, timeoutMs);
      currentRef.current = { resolve, reject, timeoutId };
      try {
        ws.send(command);
      } catch (err) {
        clearTimeout(timeoutId);
        currentRef.current = null;
        reject(err instanceof Error ? err : new Error('Failed to send command'));
      }
    });
  }, [ensureSocket, timeoutMs]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current.shift();
        if (!item) break;
        let attempts = 0;
        while (attempts < 2) {
          try {
            const raw = await sendWithSocket(item.command);
            item.resolve(raw);
            break;
          } catch (err) {
            attempts += 1;
            clearSocket();
            if (attempts >= 2) {
              item.reject(err instanceof Error ? err : new Error('WebSocket error'));
            }
          }
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [clearSocket, sendWithSocket]);

  const enqueue = useCallback((command: string) => {
    return new Promise<string>((resolve, reject) => {
      queueRef.current.push({ command, resolve, reject });
      void processQueue();
    });
  }, [processQueue]);

  const sendCommand = useCallback(async <T = unknown>(command: string): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const raw = mode === 'persistent'
        ? await enqueue(command)
        : await (async () => {
          const directUrl = `ws://${deviceIp}/ws`;
          const proxyUrl = options.proxyUrl
            ? `${options.proxyUrl}?ip=${deviceIp}`
            : null;

          const run = (url: string) => new Promise<string>((resolve, reject) => {
            let settled = false;
            const ws = new WebSocket(url);
            const timeout = setTimeout(() => {
              ws.close();
              if (!settled) {
                settled = true;
                reject(new Error('Command timeout'));
              }
            }, timeoutMs);

            ws.onopen = () => ws.send(command);

            ws.onmessage = (event) => {
              clearTimeout(timeout);
              if (settled) return;
              settled = true;
              ws.close();

              const payload = typeof event.data === 'string' ? event.data : String(event.data);
              resolve(payload);
            };

            ws.onerror = () => {
              clearTimeout(timeout);
              if (!settled) {
                settled = true;
                reject(new Error('WebSocket error'));
              }
            };

            ws.onclose = () => {
              clearTimeout(timeout);
              if (!settled) {
                settled = true;
                reject(new Error('WebSocket closed'));
              }
            };
          });

          return await run(directUrl).catch((err) => {
            if (!proxyUrl) throw err;
            return run(proxyUrl);
          });
        })();
      return parseResponse<T>(command, raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [deviceIp, enqueue, mode, options.proxyUrl, parseResponse, timeoutMs]);

  const sendCommands = useCallback(async (commands: string[]): Promise<string[] | null> => {
    setLoading(true);
    setError(null);

    try {
      const results: string[] = [];
      for (const command of commands) {
        const raw = mode === 'persistent'
          ? await enqueue(command)
          : await (async () => {
            const directUrl = `ws://${deviceIp}/ws`;
            const proxyUrl = options.proxyUrl
              ? `${options.proxyUrl}?ip=${deviceIp}`
              : null;

            const run = (url: string) => new Promise<string>((resolve, reject) => {
              let settled = false;
              const ws = new WebSocket(url);
              const timeout = setTimeout(() => {
                ws.close();
                if (!settled) {
                  settled = true;
                  reject(new Error('Command timeout'));
                }
              }, timeoutMs);

              ws.onopen = () => ws.send(command);

              ws.onmessage = (event) => {
                clearTimeout(timeout);
                if (settled) return;
                settled = true;
                ws.close();

                const payload = typeof event.data === 'string' ? event.data : String(event.data);
                resolve(payload);
              };

              ws.onerror = () => {
                clearTimeout(timeout);
                if (!settled) {
                  settled = true;
                  reject(new Error('WebSocket error'));
                }
              };

              ws.onclose = () => {
                clearTimeout(timeout);
                if (!settled) {
                  settled = true;
                  reject(new Error('WebSocket closed'));
                }
              };
            });

            return await run(directUrl).catch((err) => {
              if (!proxyUrl) throw err;
              return run(proxyUrl);
            });
          })();
        results.push(raw);
      }
      return results;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [deviceIp, enqueue, mode, options.proxyUrl, timeoutMs]);

  const close = useCallback(() => {
    clearSocket();
  }, [clearSocket]);

  return { sendCommand, sendCommands, loading, error, close };
}
