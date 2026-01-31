//! Application state management.
//!
//! This module defines the shared state used across Tauri commands
//! and background services.

use crate::logging::service::LogStreamState;
use crate::types::Device;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Map of IP address -> Device for discovered devices.
    /// Protected by RwLock for concurrent access.
    pub devices: Arc<RwLock<HashMap<String, Device>>>,
    /// State for active log streams
    pub log_streams: Arc<RwLock<LogStreamState>>,
}

impl AppState {
    /// Create a new AppState with empty device map.
    pub fn new() -> Self {
        Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
            log_streams: Arc::new(RwLock::new(LogStreamState::default())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::DeviceRole;

    #[tokio::test]
    async fn test_app_state_devices() {
        let state = AppState::new();

        // Add a device
        {
            let mut devices = state.devices.write().await;
            devices.insert(
                "192.168.1.100".to_string(),
                Device {
                    ip: "192.168.1.100".to_string(),
                    id: "test".to_string(),
                    role: DeviceRole::Tag,
                    mac: "AA:BB:CC:DD:EE:FF".to_string(),
                    uwb_short: "1".to_string(),
                    mav_sys_id: 1,
                    firmware: "1.0.0".to_string(),
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
            );
        }

        // Read the device
        let devices = state.devices.read().await;
        assert_eq!(devices.len(), 1);
        assert!(devices.contains_key("192.168.1.100"));
    }
}
