//! Log receiver service implementation.
//!
//! Listens on a UDP port for JSON log messages from devices and emits
//! them to the frontend via Tauri events.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;

/// Default UDP port for receiving log messages
pub const LOG_RECEIVER_PORT: u16 = 3334;

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

/// State for tracking active log streams
#[derive(Debug, Default)]
pub struct LogStreamState {
    /// Set of device IPs we're actively streaming logs from
    pub active_streams: HashMap<String, bool>,
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
    /// and emits them to the frontend via Tauri events.
    pub async fn run(
        &self,
        stream_state: Arc<RwLock<LogStreamState>>,
        app_handle: AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = vec![0u8; 1024];

        // Debug: track packets received
        let mut packet_count: u64 = 0;

        loop {
            match self.socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    packet_count += 1;
                    let device_ip = addr.ip().to_string();

                    // Debug: print first few packets
                    if packet_count <= 5 {
                        let raw_str = String::from_utf8_lossy(&buf[..len]);
                        println!(
                            "[LogReceiver] Packet #{} from {}: {} bytes - {:?}",
                            packet_count, device_ip, len, raw_str
                        );
                    }

                    // Check if we're actively streaming from this device
                    {
                        let state = stream_state.read().await;
                        let is_active = state.active_streams.get(&device_ip).copied().unwrap_or(false);
                        if !is_active {
                            // Debug: print if we're skipping
                            if packet_count <= 5 {
                                println!("[LogReceiver] Skipping - device {} not in active streams", device_ip);
                            }
                            continue;
                        }
                    }

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

                        // Emit to frontend
                        let _ = app_handle.emit("device-log", &log_msg);
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
}
