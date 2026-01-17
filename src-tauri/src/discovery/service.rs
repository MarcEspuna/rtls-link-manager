//! UDP discovery service for RTLS-Link devices.
//!
//! This service listens on UDP port 3333 for heartbeat packets from devices
//! and maintains a list of discovered devices with TTL-based pruning.

use crate::types::{Device, DeviceRole};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;
use tokio::time::timeout;

/// UDP port for device discovery
const DISCOVERY_PORT: u16 = 3333;

/// Time-to-live for devices (they're pruned if no heartbeat for this duration)
const DEVICE_TTL: Duration = Duration::from_secs(5);

/// Timeout for UDP receive - ensures pruning runs even without incoming packets
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(2);

/// Parse a heartbeat packet into a Device struct.
///
/// This is a standalone function to allow easy testing without requiring a socket.
pub fn parse_heartbeat(data: &[u8], ip: String) -> Result<Device, serde_json::Error> {
    let json: serde_json::Value = serde_json::from_slice(data)?;

    // Debug: print raw log_level value from heartbeat
    let log_level_raw = &json["log_level"];
    let log_level = json["log_level"].as_u64().map(|v| v as u8);
    println!(
        "[Heartbeat] {} - log_level raw: {:?}, parsed: {:?}, log_udp_enabled: {:?}",
        ip,
        log_level_raw,
        log_level,
        json["log_udp_enabled"]
    );

    Ok(Device {
        ip,
        id: json["id"].as_str().unwrap_or("").to_string(),
        role: DeviceRole::from_str(json["role"].as_str().unwrap_or("")),
        mac: json["mac"].as_str().unwrap_or("").to_string(),
        uwb_short: json["uwb_short"].as_str().unwrap_or("0").to_string(),
        mav_sys_id: json["mav_sysid"].as_u64().unwrap_or(0) as u8,
        firmware: json["fw"].as_str().unwrap_or("").to_string(),
        online: Some(true),
        last_seen: Some(chrono::Utc::now()),
        sending_pos: json["sending_pos"].as_bool(),
        anchors_seen: json["anchors_seen"].as_u64().map(|v| v as u8),
        origin_sent: json["origin_sent"].as_bool(),
        rf_enabled: json["rf_enabled"].as_bool(),
        rf_healthy: json["rf_healthy"].as_bool(),
        avg_rate_c_hz: json["avg_rate_cHz"].as_u64().map(|v| v as u16),
        min_rate_c_hz: json["min_rate_cHz"].as_u64().map(|v| v as u16),
        max_rate_c_hz: json["max_rate_cHz"].as_u64().map(|v| v as u16),
        log_level,
        log_udp_port: json["log_udp_port"].as_u64().map(|v| v as u16),
        log_serial_enabled: json["log_serial_enabled"].as_bool(),
        log_udp_enabled: json["log_udp_enabled"].as_bool(),
    })
}

/// Prune stale devices from a device map based on TTL.
pub fn prune_stale_devices(devices: &mut HashMap<String, (Device, Instant)>) {
    let now = Instant::now();
    devices.retain(|_, (_, last_seen)| now.duration_since(*last_seen) < DEVICE_TTL);
}

/// Discovery service that listens for device heartbeats.
pub struct DiscoveryService {
    socket: UdpSocket,
    devices: HashMap<String, (Device, Instant)>,
}

impl DiscoveryService {
    /// Create a new discovery service bound to UDP port 3333.
    pub async fn new() -> Result<Self, std::io::Error> {
        let socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)).await?;
        println!("UDP discovery listening on port {}", DISCOVERY_PORT);

        Ok(Self {
            socket,
            devices: HashMap::new(),
        })
    }

    /// Run the discovery service loop.
    ///
    /// This continuously receives UDP packets, parses device heartbeats,
    /// updates the shared state, and emits events to the frontend.
    /// Uses a timeout to ensure stale devices are pruned even when no packets arrive.
    pub async fn run(
        &mut self,
        devices_state: Arc<RwLock<HashMap<String, Device>>>,
        app_handle: AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = vec![0u8; 1024];

        loop {
            // Use timeout so we can prune stale devices even when no packets arrive
            let recv_result = timeout(RECEIVE_TIMEOUT, self.socket.recv_from(&mut buf)).await;

            match recv_result {
                Ok(Ok((len, addr))) => {
                    let ip = addr.ip().to_string();

                    if let Ok(device) = parse_heartbeat(&buf[..len], ip) {
                        // Update local cache with timestamp
                        self.devices
                            .insert(device.ip.clone(), (device.clone(), Instant::now()));
                    }
                }
                Ok(Err(ref e)) => {
                    eprintln!("UDP receive error: {}", e);
                }
                Err(_) => {
                    // Timeout - no packet received, continue to prune
                }
            }

            // Always prune stale devices (on packet receive OR timeout)
            let before_prune = self.devices.len();
            prune_stale_devices(&mut self.devices);
            let after_prune = self.devices.len();

            // Only emit update if devices changed (pruned or new device added)
            if before_prune != after_prune || matches!(recv_result, Ok(Ok(_))) {
                // Update shared state and emit event
                let mut device_list: Vec<Device> = {
                    let mut state = devices_state.write().await;
                    *state = self
                        .devices
                        .iter()
                        .map(|(ip, (dev, _))| (ip.clone(), dev.clone()))
                        .collect();
                    state.values().cloned().collect()
                };

                // Sort by IP for consistent UI ordering
                device_list.sort_by(|a, b| a.ip.cmp(&b.ip));

                let _ = app_handle.emit("devices-updated", &device_list);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_heartbeat() {
        let json = r#"{
            "id": "device1",
            "role": "tag",
            "mac": "AA:BB:CC:DD:EE:FF",
            "uwb_short": "1",
            "mav_sysid": 1,
            "fw": "1.0.0",
            "sending_pos": true,
            "anchors_seen": 3
        }"#;

        let device = parse_heartbeat(json.as_bytes(), "192.168.1.100".to_string()).unwrap();

        assert_eq!(device.ip, "192.168.1.100");
        assert_eq!(device.id, "device1");
        assert_eq!(device.role, DeviceRole::Tag);
        assert_eq!(device.mac, "AA:BB:CC:DD:EE:FF");
        assert_eq!(device.uwb_short, "1");
        assert_eq!(device.mav_sys_id, 1);
        assert_eq!(device.firmware, "1.0.0");
        assert_eq!(device.sending_pos, Some(true));
        assert_eq!(device.anchors_seen, Some(3));
    }

    #[test]
    fn test_parse_minimal_heartbeat() {
        // Minimal packet with only required fields
        let json = r#"{"id": "test", "role": "anchor"}"#;

        let device = parse_heartbeat(json.as_bytes(), "10.0.0.1".to_string()).unwrap();

        assert_eq!(device.ip, "10.0.0.1");
        assert_eq!(device.id, "test");
        assert_eq!(device.role, DeviceRole::Anchor);
        assert_eq!(device.sending_pos, None);
    }

    #[test]
    fn test_parse_heartbeat_invalid_json() {
        let invalid = b"not valid json";
        let result = parse_heartbeat(invalid, "1.2.3.4".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_prune_stale_devices() {
        let mut devices: HashMap<String, (Device, Instant)> = HashMap::new();

        // Add a fresh device
        devices.insert(
            "192.168.1.1".to_string(),
            (
                Device {
                    ip: "192.168.1.1".to_string(),
                    id: "fresh".to_string(),
                    role: DeviceRole::Tag,
                    mac: "".to_string(),
                    uwb_short: "1".to_string(),
                    mav_sys_id: 1,
                    firmware: "".to_string(),
                    online: Some(true),
                    last_seen: None,
                    sending_pos: None,
                    anchors_seen: None,
                    origin_sent: None,
                    rf_enabled: None,
                    rf_healthy: None,
                    avg_rate_c_hz: None,
                    min_rate_c_hz: None,
                    max_rate_c_hz: None,
                    log_level: None,
                    log_udp_port: None,
                    log_serial_enabled: None,
                    log_udp_enabled: None,
                },
                Instant::now(),
            ),
        );

        // Add a stale device (6 seconds old - beyond TTL)
        devices.insert(
            "192.168.1.2".to_string(),
            (
                Device {
                    ip: "192.168.1.2".to_string(),
                    id: "stale".to_string(),
                    role: DeviceRole::Anchor,
                    mac: "".to_string(),
                    uwb_short: "2".to_string(),
                    mav_sys_id: 2,
                    firmware: "".to_string(),
                    online: Some(true),
                    last_seen: None,
                    sending_pos: None,
                    anchors_seen: None,
                    origin_sent: None,
                    rf_enabled: None,
                    rf_healthy: None,
                    avg_rate_c_hz: None,
                    min_rate_c_hz: None,
                    max_rate_c_hz: None,
                    log_level: None,
                    log_udp_port: None,
                    log_serial_enabled: None,
                    log_udp_enabled: None,
                },
                Instant::now() - Duration::from_secs(6),
            ),
        );

        assert_eq!(devices.len(), 2);

        // Prune stale devices
        prune_stale_devices(&mut devices);

        assert_eq!(devices.len(), 1);
        assert!(devices.contains_key("192.168.1.1"));
        assert!(!devices.contains_key("192.168.1.2"));
    }

    #[test]
    fn test_all_device_roles() {
        let roles = [
            ("anchor", DeviceRole::Anchor),
            ("tag", DeviceRole::Tag),
            ("anchor_tdoa", DeviceRole::AnchorTdoa),
            ("tag_tdoa", DeviceRole::TagTdoa),
            ("calibration", DeviceRole::Calibration),
            ("unknown_role", DeviceRole::Unknown),
        ];

        for (role_str, expected_role) in roles {
            let json = format!(r#"{{"id": "test", "role": "{}"}}"#, role_str);
            let device = parse_heartbeat(json.as_bytes(), "1.1.1.1".to_string()).unwrap();
            assert_eq!(device.role, expected_role, "Failed for role: {}", role_str);
        }
    }
}
