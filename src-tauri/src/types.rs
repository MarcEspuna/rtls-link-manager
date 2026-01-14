//! Type definitions for the RTLS Link Manager.
//!
//! These types mirror the TypeScript definitions in `shared/types.ts`.
//! They are serialized/deserialized using serde to ensure compatibility
//! with the frontend.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents a discovered RTLS-Link device.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Device IP address (primary identifier for runtime)
    pub ip: String,
    /// Device identifier string
    pub id: String,
    /// Operating mode/role
    pub role: DeviceRole,
    /// MAC address
    pub mac: String,
    /// UWB short address (1-2 digits)
    pub uwb_short: String,
    /// MAVLink system ID
    pub mav_sys_id: u8,
    /// Firmware version
    pub firmware: String,
    /// Whether the device is currently online
    #[serde(skip_serializing_if = "Option::is_none")]
    pub online: Option<bool>,
    /// Last seen timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<DateTime<Utc>>,
    /// Whether device is sending positions to ArduPilot
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_pos: Option<bool>,
    /// Number of unique anchors in measurement set
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchors_seen: Option<u8>,
    /// Whether GPS origin was sent to ArduPilot
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_sent: Option<bool>,
    /// Whether rangefinder mode is enabled (zCalcMode == RANGEFINDER)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_enabled: Option<bool>,
    /// Whether receiving non-stale rangefinder data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_healthy: Option<bool>,
    /// Average update rate in centi-Hz (e.g., 1000 = 10.0 Hz)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_rate_c_hz: Option<u16>,
    /// Min update rate in last 5s window (centi-Hz)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_rate_c_hz: Option<u16>,
    /// Max update rate in last 5s window (centi-Hz)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_rate_c_hz: Option<u16>,
}

/// Device operating role/mode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceRole {
    /// TWR Anchor mode (0)
    Anchor,
    /// TWR Tag mode (1)
    Tag,
    /// TDoA Anchor mode (3)
    AnchorTdoa,
    /// TDoA Tag mode (4)
    TagTdoa,
    /// Calibration mode (2)
    Calibration,
    /// Unknown/unrecognized mode
    Unknown,
}

impl DeviceRole {
    /// Parse a role string from device heartbeat
    pub fn from_str(s: &str) -> Self {
        match s {
            "anchor" => DeviceRole::Anchor,
            "tag" => DeviceRole::Tag,
            "anchor_tdoa" => DeviceRole::AnchorTdoa,
            "tag_tdoa" => DeviceRole::TagTdoa,
            "calibration" => DeviceRole::Calibration,
            _ => DeviceRole::Unknown,
        }
    }
}

/// Complete device configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConfig {
    /// WiFi configuration
    pub wifi: WifiConfig,
    /// UWB configuration
    pub uwb: UwbConfig,
    /// Application configuration
    pub app: AppConfig,
}

/// WiFi network configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiConfig {
    /// WiFi mode: 0 = AP, 1 = Station
    pub mode: u8,
    /// Access Point SSID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssid_a_p: Option<String>,
    /// Access Point password
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pswd_a_p: Option<String>,
    /// Station mode SSID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssid_s_t: Option<String>,
    /// Station mode password
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pswd_s_t: Option<String>,
    /// Ground Control Station IP
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gcs_ip: Option<String>,
    /// UDP port for MAVLink
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udp_port: Option<u16>,
    /// Enable web server (0 or 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_web_server: Option<u8>,
    /// Enable UDP discovery (0 or 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_discovery: Option<u8>,
    /// UDP discovery port
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discovery_port: Option<u16>,
}

/// UWB and positioning configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UwbConfig {
    /// UWB mode: 0=TWR_ANCHOR, 1=TWR_TAG, 2=CALIBRATION, 3=TDOA_ANCHOR, 4=TDOA_TAG
    pub mode: u8,
    /// Device's UWB short address
    pub dev_short_addr: String,
    /// Number of anchors
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_count: Option<u8>,
    /// Anchor configurations
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchors: Option<Vec<AnchorConfig>>,
    /// GPS origin latitude
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_lat: Option<f64>,
    /// GPS origin longitude
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_lon: Option<f64>,
    /// GPS origin altitude
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_alt: Option<f64>,
    /// MAVLink target system ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mavlink_target_system_id: Option<u8>,
    /// Coordinate rotation in degrees
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_degrees: Option<f64>,
    /// Z calculation mode: 0=None (TDoA Z), 1=Rangefinder, 2=UWB (reserved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_calc_mode: Option<u8>,
    /// UWB channel (1-7), default 2
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<u8>,
    /// DW1000 mode index (0-7), default 0 (SHORTDATA_FAST_ACCURACY)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dw_mode: Option<u8>,
    /// TX power level (0-3), default 3 (high)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_power_level: Option<u8>,
    /// Smart power enable (0=disabled, 1=enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub smart_power_enable: Option<u8>,
}

/// Single anchor configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchorConfig {
    /// Anchor UWB short address
    pub id: String,
    /// X position in meters
    pub x: f64,
    /// Y position in meters
    pub y: f64,
    /// Z position in meters
    pub z: f64,
}

/// Application-level configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// LED 2 GPIO pin
    #[serde(skip_serializing_if = "Option::is_none")]
    pub led2_pin: Option<u8>,
    /// LED 2 state (0 or 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub led2_state: Option<u8>,
}

/// Metadata for a locally stored configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfigInfo {
    /// Configuration name
    pub name: String,
    /// Creation timestamp (ISO 8601)
    pub created_at: String,
    /// Last update timestamp (ISO 8601)
    pub updated_at: String,
}

/// Full local configuration including device config.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfig {
    /// Configuration name
    pub name: String,
    /// Creation timestamp (ISO 8601)
    pub created_at: String,
    /// Last update timestamp (ISO 8601)
    pub updated_at: String,
    /// Device configuration data
    pub config: DeviceConfig,
}

// ==================== Unified Preset Types ====================

/// Type of preset: full device configuration or locations only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetType {
    /// Full device configuration
    Full,
    /// Locations only (anchors + origin + rotation)
    Locations,
}

/// GPS origin coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpsOrigin {
    /// Latitude in degrees
    pub lat: f64,
    /// Longitude in degrees
    pub lon: f64,
    /// Altitude in meters
    pub alt: f64,
}

/// Location data for a preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationData {
    /// GPS origin coordinates
    pub origin: GpsOrigin,
    /// Rotation in degrees
    pub rotation: f64,
    /// Anchor configurations
    pub anchors: Vec<AnchorConfig>,
}

/// Unified preset that can be either full config or locations only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    /// Preset name
    pub name: String,
    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Preset type
    #[serde(rename = "type")]
    pub preset_type: PresetType,
    /// Full device configuration (for type = Full)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<DeviceConfig>,
    /// Location data (for type = Locations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locations: Option<LocationData>,
    /// Creation timestamp (ISO 8601)
    pub created_at: String,
    /// Last update timestamp (ISO 8601)
    pub updated_at: String,
}

/// Metadata for a preset (without the full config data).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetInfo {
    /// Preset name
    pub name: String,
    /// Preset type
    #[serde(rename = "type")]
    pub preset_type: PresetType,
    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Creation timestamp (ISO 8601)
    pub created_at: String,
    /// Last update timestamp (ISO 8601)
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_serialization() {
        let device = Device {
            ip: "192.168.1.100".to_string(),
            id: "test-device".to_string(),
            role: DeviceRole::Tag,
            mac: "AA:BB:CC:DD:EE:FF".to_string(),
            uwb_short: "1".to_string(),
            mav_sys_id: 1,
            firmware: "1.0.0".to_string(),
            online: Some(true),
            last_seen: None,
            sending_pos: Some(true),
            anchors_seen: Some(3),
            origin_sent: None,
            rf_enabled: None,
            rf_healthy: None,
            avg_rate_c_hz: None,
            min_rate_c_hz: None,
            max_rate_c_hz: None,
        };

        let json = serde_json::to_string(&device).unwrap();
        assert!(json.contains("\"ip\":\"192.168.1.100\""));
        assert!(json.contains("\"role\":\"tag\""));
        assert!(json.contains("\"uwbShort\":\"1\""));
        assert!(json.contains("\"mavSysId\":1"));

        let deserialized: Device = serde_json::from_str(&json).unwrap();
        assert_eq!(device.ip, deserialized.ip);
        assert_eq!(device.role, deserialized.role);
    }

    #[test]
    fn test_device_role_from_str() {
        assert_eq!(DeviceRole::from_str("anchor"), DeviceRole::Anchor);
        assert_eq!(DeviceRole::from_str("tag"), DeviceRole::Tag);
        assert_eq!(DeviceRole::from_str("anchor_tdoa"), DeviceRole::AnchorTdoa);
        assert_eq!(DeviceRole::from_str("tag_tdoa"), DeviceRole::TagTdoa);
        assert_eq!(DeviceRole::from_str("calibration"), DeviceRole::Calibration);
        assert_eq!(DeviceRole::from_str("invalid"), DeviceRole::Unknown);
    }

    #[test]
    fn test_device_config_serialization() {
        let config = DeviceConfig {
            wifi: WifiConfig {
                mode: 1,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: Some("TestNetwork".to_string()),
                pswd_s_t: Some("password123".to_string()),
                gcs_ip: Some("192.168.1.1".to_string()),
                udp_port: Some(14550),
                enable_web_server: Some(1),
                enable_discovery: Some(1),
                discovery_port: Some(3333),
            },
            uwb: UwbConfig {
                mode: 4,
                dev_short_addr: "1".to_string(),
                anchor_count: Some(3),
                anchors: Some(vec![
                    AnchorConfig { id: "1".to_string(), x: 0.0, y: 0.0, z: 1.5 },
                    AnchorConfig { id: "2".to_string(), x: 3.0, y: 0.0, z: 1.5 },
                    AnchorConfig { id: "3".to_string(), x: 1.5, y: 2.6, z: 1.5 },
                ]),
                origin_lat: Some(41.4036),
                origin_lon: Some(2.1744),
                origin_alt: Some(100.0),
                mavlink_target_system_id: Some(1),
                rotation_degrees: Some(0.0),
                z_calc_mode: Some(1),
                channel: None,
                dw_mode: None,
                tx_power_level: None,
                smart_power_enable: None,
            },
            app: AppConfig {
                led2_pin: Some(2),
                led2_state: Some(0),
            },
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: DeviceConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(config.wifi.mode, deserialized.wifi.mode);
        assert_eq!(config.uwb.mode, deserialized.uwb.mode);
        assert_eq!(config.uwb.anchors.as_ref().unwrap().len(), 3);
    }

    #[test]
    fn test_local_config_info() {
        let info = LocalConfigInfo {
            name: "test-config".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-02T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"createdAt\":"));
        assert!(json.contains("\"updatedAt\":"));
    }
}
