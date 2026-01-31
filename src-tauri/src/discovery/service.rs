//! UDP discovery service for RTLS-Link devices (Tauri wrapper).
//!
//! This service uses the core heartbeat parser and adds Tauri event emission.

use crate::types::Device;
use rtls_link_core::discovery::heartbeat::{parse_heartbeat, prune_stale_devices};
use rtls_link_core::discovery::service::{create_reusable_socket, DISCOVERY_PORT};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;
use tokio::time::timeout;

/// Timeout for UDP receive - ensures pruning runs even without incoming packets
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(2);

/// Discovery service that listens for device heartbeats and emits Tauri events.
pub struct DiscoveryService {
    socket: UdpSocket,
    devices: HashMap<String, (Device, Instant)>,
}

impl DiscoveryService {
    /// Create a new discovery service bound to UDP port 3333.
    pub async fn new() -> Result<Self, std::io::Error> {
        let std_socket = create_reusable_socket(DISCOVERY_PORT)?;
        let socket = UdpSocket::from_std(std_socket)?;
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
    pub async fn run(
        &mut self,
        devices_state: Arc<RwLock<HashMap<String, Device>>>,
        app_handle: AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = vec![0u8; 1024];

        loop {
            let recv_result = timeout(RECEIVE_TIMEOUT, self.socket.recv_from(&mut buf)).await;

            match recv_result {
                Ok(Ok((len, addr))) => {
                    let ip = addr.ip().to_string();

                    if let Ok(device) = parse_heartbeat(&buf[..len], ip) {
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

            let before_prune = self.devices.len();
            prune_stale_devices(&mut self.devices);
            let after_prune = self.devices.len();

            if before_prune != after_prune || matches!(recv_result, Ok(Ok(_))) {
                let mut device_list: Vec<Device> = {
                    let mut state = devices_state.write().await;
                    *state = self
                        .devices
                        .iter()
                        .map(|(ip, (dev, _))| (ip.clone(), dev.clone()))
                        .collect();
                    state.values().cloned().collect()
                };

                device_list.sort_by(|a, b| a.ip.cmp(&b.ip));

                let _ = app_handle.emit("devices-updated", &device_list);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::DeviceRole;

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
                    dynamic_anchors: None,
                },
                Instant::now(),
            ),
        );

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
                    dynamic_anchors: None,
                },
                Instant::now() - Duration::from_secs(6),
            ),
        );

        assert_eq!(devices.len(), 2);
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

    #[test]
    fn test_parse_heartbeat_with_dynamic_anchors() {
        let json = r#"{
            "id": "tag1",
            "role": "tag_tdoa",
            "mac": "AA:BB:CC:DD:EE:FF",
            "uwb_short": "1",
            "mav_sysid": 1,
            "fw": "1.0.0",
            "dyn_anchors": [
                {"id": 0, "x": 0.00, "y": 0.00, "z": -2.00},
                {"id": 1, "x": 5.00, "y": 0.00, "z": -2.00},
                {"id": 2, "x": 5.00, "y": 3.00, "z": -2.00},
                {"id": 3, "x": 0.00, "y": 3.00, "z": -2.00}
            ]
        }"#;

        let device = parse_heartbeat(json.as_bytes(), "192.168.1.100".to_string()).unwrap();

        assert_eq!(device.role, DeviceRole::TagTdoa);
        assert!(device.dynamic_anchors.is_some());

        let anchors = device.dynamic_anchors.unwrap();
        assert_eq!(anchors.len(), 4);
        assert_eq!(anchors[0].id, 0);
        assert_eq!(anchors[0].x, 0.0);
        assert_eq!(anchors[0].y, 0.0);
        assert_eq!(anchors[0].z, -2.0);
        assert_eq!(anchors[1].id, 1);
        assert_eq!(anchors[1].x, 5.0);
        assert_eq!(anchors[3].id, 3);
        assert_eq!(anchors[3].y, 3.0);
    }

    #[test]
    fn test_parse_heartbeat_without_dynamic_anchors() {
        let json = r#"{"id": "anchor1", "role": "anchor_tdoa"}"#;

        let device = parse_heartbeat(json.as_bytes(), "10.0.0.1".to_string()).unwrap();

        assert_eq!(device.role, DeviceRole::AnchorTdoa);
        assert!(device.dynamic_anchors.is_none());
    }
}
