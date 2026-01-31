import { useState, useEffect, useRef, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { LogMessage } from '@shared/types';
import styles from './LogTerminal.module.css';

interface LogTerminalProps {
  deviceIp: string;
  onClose: () => void;
}

// Log level colors for terminal display
const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: '#ff6b6b',
  WARN: '#ffd43b',
  INFO: '#69db7c',
  DEBUG: '#74c0fc',
  VERBOSE: '#b197fc',
};

export function LogTerminal({ deviceIp, onClose }: LogTerminalProps) {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<Set<string>>(
    new Set(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'])
  );
  const [tagFilter, setTagFilter] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Initialize: fetch buffered logs AND start stream
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // First, start the stream so we don't miss any new logs
        await invoke('start_log_stream', { deviceIp });

        // Then fetch any buffered logs
        const buffered = await invoke<LogMessage[]>('get_buffered_logs', { deviceIp });

        if (isMounted) {
          if (buffered.length > 0) {
            setLogs(buffered);
          }
          setIsStreaming(true);
        }
      } catch (e) {
        console.error('Failed to initialize log stream:', e);
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      invoke('stop_log_stream', { deviceIp }).catch(console.error);
    };
  }, [deviceIp]);

  // Listen for log events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<LogMessage>('device-log', (event) => {
        // Only accept logs from our device
        if (event.payload.deviceIp !== deviceIp) return;
        if (isPaused) return;

        setLogs((prev) => {
          // Avoid duplicates by checking if the log already exists
          // (buffered logs might overlap with real-time events)
          const lastLog = prev[prev.length - 1];
          if (
            lastLog &&
            lastLog.ts === event.payload.ts &&
            lastLog.msg === event.payload.msg
          ) {
            return prev;
          }

          // Keep last 1000 logs to prevent memory issues
          const newLogs = [...prev, event.payload];
          if (newLogs.length > 1000) {
            return newLogs.slice(-1000);
          }
          return newLogs;
        });
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [deviceIp, isPaused]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (terminalRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  }, []);

  // Toggle level filter
  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (!levelFilter.has(log.lvl)) return false;
    if (tagFilter && !log.tag.toLowerCase().includes(tagFilter.toLowerCase()))
      return false;
    if (
      searchText &&
      !log.msg.toLowerCase().includes(searchText.toLowerCase())
    )
      return false;
    return true;
  });

  // Get unique tags for dropdown
  const uniqueTags = Array.from(new Set(logs.map((l) => l.tag))).sort();

  const clearLogs = async () => {
    setLogs([]);
    // Also clear the backend buffer
    try {
      await invoke('clear_buffered_logs', { deviceIp });
    } catch (e) {
      console.error('Failed to clear buffered logs:', e);
    }
  };

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.container}>
        <div className={styles.header}>
        <h3>Log Terminal - {deviceIp}</h3>
        <div className={styles.controls}>
          <button
            className={isPaused ? styles.paused : undefined}
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={clearLogs}>Clear</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.levelFilters}>
          {['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'].map((level) => (
            <label
              key={level}
              className={styles.levelCheckbox}
              style={{
                color: levelFilter.has(level)
                  ? LOG_LEVEL_COLORS[level]
                  : '#666',
              }}
            >
              <input
                type="checkbox"
                checked={levelFilter.has(level)}
                onChange={() => toggleLevel(level)}
              />
              {level}
            </label>
          ))}
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className={styles.tagSelect}
        >
          <option value="">All Tags</option>
          {uniqueTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div
        ref={terminalRef}
        className={styles.terminal}
        onScroll={handleScroll}
      >
        {filteredLogs.map((log, idx) => (
          <div key={idx} className={styles.logLine}>
            <span className={styles.timestamp}>
              [{(log.ts / 1000).toFixed(3)}]
            </span>
            <span
              className={styles.level}
              style={{ color: LOG_LEVEL_COLORS[log.lvl] || '#888' }}
            >
              [{log.lvl}]
            </span>
            <span className={styles.tag}>[{log.tag}]</span>
            <span className={styles.message}>{log.msg}</span>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className={styles.empty}>
            {isStreaming
              ? 'Waiting for logs...'
              : 'Connecting to device...'}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span>
          {filteredLogs.length} / {logs.length} logs
        </span>
        <span>
          {isStreaming ? (isPaused ? 'Paused' : 'Streaming') : 'Connecting...'}
        </span>
      </div>
      </div>
    </>
  );
}
