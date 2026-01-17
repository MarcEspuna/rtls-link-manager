//! Log receiver service implementation.
//!
//! Listens on a UDP port for JSON log messages from devices and emits
//! them to the frontend via Tauri events. Buffers logs per device so
//! they can be retrieved even if the log terminal wasn't open.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;

/// Default UDP port for receiving log messages
pub const LOG_RECEIVER_PORT: u16 = 3334;

/// Maximum number of logs to buffer per device
const MAX_LOGS_PER_DEVICE: usize = 500;

/// A log message received from a device
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogMessage {
    /// Device IP address (source of the log)
    pub device_ip: String,
    /// Timestamp in milliseconds (from device)
    pub ts: u64,
    /// Log level string (ERROR, WARN, INFO, DEBUG, VERBOSE)
    pub lvl: String,
    /// Tag/module name
    pub tag: String,
    /// Log message content
    pub msg: String,
    /// Receive timestamp (local)
    pub received_at: u64,
}

/// Raw JSON format from device
#[derive(Debug, Deserialize)]
struct RawLogMessage {
    ts: u64,
    lvl: String,
    tag: String,
    msg: String,
}

/// State for tracking active log streams and buffered logs
#[derive(Debug, Default)]
pub struct LogStreamState {
    /// Set of device IPs we're actively streaming logs from (for UI display)
    pub active_streams: HashMap<String, bool>,
    /// Buffered logs per device (ring buffer)
    pub log_buffers: HashMap<String, VecDeque<LogMessage>>,
}

impl LogStreamState {
    /// Add a log message to the device's buffer
    pub fn add_log(&mut self, device_ip: &str, log: LogMessage) {
        let buffer = self.log_buffers
            .entry(device_ip.to_string())
            .or_insert_with(|| VecDeque::with_capacity(MAX_LOGS_PER_DEVICE));

        // Remove oldest if at capacity
        if buffer.len() >= MAX_LOGS_PER_DEVICE {
            buffer.pop_front();
        }

        buffer.push_back(log);
    }

    /// Get buffered logs for a device
    pub fn get_logs(&self, device_ip: &str) -> Vec<LogMessage> {
        self.log_buffers
            .get(device_ip)
            .map(|b| b.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Clear buffered logs for a device
    pub fn clear_logs(&mut self, device_ip: &str) {
        if let Some(buffer) = self.log_buffers.get_mut(device_ip) {
            buffer.clear();
        }
    }

    /// Check if a device stream is active
    pub fn is_active(&self, device_ip: &str) -> bool {
        self.active_streams.get(device_ip).copied().unwrap_or(false)
    }
}

/// Log receiver service that listens for device logs over UDP
pub struct LogReceiverService {
    socket: UdpSocket,
}

impl LogReceiverService {
    /// Create a new log receiver service bound to the specified port
    pub async fn new(port: u16) -> Result<Self, std::io::Error> {
        let socket = UdpSocket::bind(("0.0.0.0", port)).await?;
        println!("Log receiver listening on UDP port {}", port);
        Ok(Self { socket })
    }

    /// Run the log receiver loop
    ///
    /// Continuously receives UDP packets, parses JSON log messages,
    /// buffers them per device, and emits to frontend if stream is active.
    pub async fn run(
        &self,
        stream_state: Arc<RwLock<LogStreamState>>,
        app_handle: AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = vec![0u8; 1024];

        loop {
            match self.socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let device_ip = addr.ip().to_string();

                    // Try to parse the log message
                    if let Ok(raw) = serde_json::from_slice::<RawLogMessage>(&buf[..len]) {
                        let log_msg = LogMessage {
                            device_ip: device_ip.clone(),
                            ts: raw.ts,
                            lvl: raw.lvl,
                            tag: raw.tag,
                            msg: raw.msg,
                            received_at: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0),
                        };

                        // Always buffer the log
                        let mut state = stream_state.write().await;
                        state.add_log(&device_ip, log_msg.clone());

                        // Only emit to frontend if stream is active
                        if state.is_active(&device_ip) {
                            drop(state); // Release lock before emitting
                            let _ = app_handle.emit("device-log", &log_msg);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Log receiver UDP error: {}", e);
                }
            }
        }
    }
}

/// Parse a log message from raw bytes
pub fn parse_log_message(data: &[u8], addr: SocketAddr) -> Option<LogMessage> {
    let raw: RawLogMessage = serde_json::from_slice(data).ok()?;

    Some(LogMessage {
        device_ip: addr.ip().to_string(),
        ts: raw.ts,
        lvl: raw.lvl,
        tag: raw.tag,
        msg: raw.msg,
        received_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    #[test]
    fn test_parse_log_message() {
        let json = r#"{"ts":12345,"lvl":"INFO","tag":"app.cpp","msg":"Hello world"}"#;
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 100)), 3334);

        let msg = parse_log_message(json.as_bytes(), addr).unwrap();

        assert_eq!(msg.device_ip, "192.168.1.100");
        assert_eq!(msg.ts, 12345);
        assert_eq!(msg.lvl, "INFO");
        assert_eq!(msg.tag, "app.cpp");
        assert_eq!(msg.msg, "Hello world");
    }

    #[test]
    fn test_parse_log_message_with_escaped_chars() {
        let json = r#"{"ts":100,"lvl":"DEBUG","tag":"test","msg":"Line1\\nLine2"}"#;
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 3334);

        let msg = parse_log_message(json.as_bytes(), addr).unwrap();

        assert_eq!(msg.msg, "Line1\\nLine2");
    }

    #[test]
    fn test_parse_invalid_json() {
        let invalid = b"not valid json";
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(1, 2, 3, 4)), 3334);

        let result = parse_log_message(invalid, addr);
        assert!(result.is_none());
    }

    #[test]
    fn test_log_buffer() {
        let mut state = LogStreamState::default();
        let device_ip = "192.168.1.100";

        // Add some logs
        for i in 0..10 {
            state.add_log(device_ip, LogMessage {
                device_ip: device_ip.to_string(),
                ts: i as u64,
                lvl: "INFO".to_string(),
                tag: "test".to_string(),
                msg: format!("Message {}", i),
                received_at: 0,
            });
        }

        let logs = state.get_logs(device_ip);
        assert_eq!(logs.len(), 10);
        assert_eq!(logs[0].ts, 0);
        assert_eq!(logs[9].ts, 9);
    }

    #[test]
    fn test_log_buffer_max_size() {
        let mut state = LogStreamState::default();
        let device_ip = "192.168.1.100";

        // Add more than MAX_LOGS_PER_DEVICE logs
        for i in 0..(MAX_LOGS_PER_DEVICE + 100) {
            state.add_log(device_ip, LogMessage {
                device_ip: device_ip.to_string(),
                ts: i as u64,
                lvl: "INFO".to_string(),
                tag: "test".to_string(),
                msg: format!("Message {}", i),
                received_at: 0,
            });
        }

        let logs = state.get_logs(device_ip);
        assert_eq!(logs.len(), MAX_LOGS_PER_DEVICE);
        // Should have the newest logs (100 to 599)
        assert_eq!(logs[0].ts, 100);
    }
}
