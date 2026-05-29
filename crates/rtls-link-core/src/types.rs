//! Shared type definitions for RTLS-Link.
//!
//! These types are the canonical definitions used by both the Tauri desktop app
//! and the CLI tool. They mirror the TypeScript definitions in `shared/types.ts`
//! and are serialized/deserialized using serde.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::health::DeviceHealth;

// ==================== Device Types ====================

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
    /// Whether runtime UWB backend is enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uwb_enabled: Option<bool>,
    /// Whether rangefinder forwarding is enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_forward_enabled: Option<bool>,
    /// Whether rangefinder functionality is active
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
    /// Compiled log level (0=NONE, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG, 5=VERBOSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_level: Option<u8>,
    /// UDP port for log streaming
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_udp_port: Option<u16>,
    /// Whether Serial logging is enabled at runtime
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_serial_enabled: Option<bool>,
    /// Whether UDP log streaming is enabled at runtime
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_udp_enabled: Option<bool>,
    /// Dynamic anchor positions (calculated from inter-anchor ToF)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic_anchors: Option<Vec<DynamicAnchorPosition>>,
    /// Backend-calculated health summary.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health: Option<DeviceHealth>,
}

/// Dynamic anchor position from inter-anchor ToF measurements.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicAnchorPosition {
    /// Anchor ID (0-7)
    pub id: u8,
    /// X position in meters
    pub x: f64,
    /// Y position in meters
    pub y: f64,
    /// Z position in meters
    pub z: f64,
}

/// Device operating role/mode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceRole {
    /// TDoA Anchor mode (3)
    AnchorTdoa,
    /// TDoA Tag mode (4)
    TagTdoa,
    /// Unknown/unrecognized mode
    Unknown,
}

impl DeviceRole {
    /// Parse a role string from device heartbeat
    pub fn from_str(s: &str) -> Self {
        match s {
            "anchor_tdoa" => DeviceRole::AnchorTdoa,
            "tag_tdoa" => DeviceRole::TagTdoa,
            _ => DeviceRole::Unknown,
        }
    }

    /// Check if role is an anchor type
    pub fn is_anchor(&self) -> bool {
        matches!(self, DeviceRole::AnchorTdoa)
    }

    /// Check if role is a tag type
    pub fn is_tag(&self) -> bool {
        matches!(self, DeviceRole::TagTdoa)
    }

    /// Get display name
    pub fn display_name(&self) -> &'static str {
        match self {
            DeviceRole::AnchorTdoa => "Anchor (TDoA)",
            DeviceRole::TagTdoa => "Tag (TDoA)",
            DeviceRole::Unknown => "Unknown",
        }
    }
}

impl std::fmt::Display for DeviceRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

// ==================== Configuration Types ====================

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
    /// Enable UART bridge (0 or 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_uart_bridge: Option<u8>,
    /// UDP port for log streaming
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_udp_port: Option<u16>,
    /// Whether Serial logging is enabled at runtime
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_serial_enabled: Option<u8>,
    /// Whether UDP log streaming is enabled at runtime
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_udp_enabled: Option<u8>,
}

/// UWB and positioning configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UwbConfig {
    /// UWB mode: 3=TDOA_ANCHOR, 4=TDOA_TAG
    pub mode: u8,
    /// Runtime UWB backend enable (0=disabled, 1=enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uwb_enable: Option<u8>,
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
    /// Output backend: 0=MAVLink, 1=RTLSLink Beacon
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_backend: Option<u8>,
    /// Safety bias added to RTLSLink TDoA age estimates, in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtls_beacon_age_bias_ms: Option<u8>,
    /// Minimum TDoA one-sigma error reported to ArduPilot, in meters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtls_beacon_tdoa_sigma_floor_m: Option<f64>,
    /// Drop physically impossible TDoA samples (0=disabled, 1=enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtls_beacon_tdoa_physical_guard_enable: Option<u8>,
    /// Extra allowed TDoA range-difference beyond anchor baseline, in meters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtls_beacon_tdoa_physical_guard_margin_m: Option<f64>,
    /// Coordinate rotation in degrees
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_degrees: Option<f64>,
    /// Z calculation mode: 0=None (TDoA Z), 1=Rangefinder, 2=UWB (reserved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_calc_mode: Option<u8>,
    /// Enable rangefinder DISTANCE_SENSOR forwarding (0=disabled, 1=enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_forward_enable: Option<u8>,
    /// Rangefinder sensor ID override (0-254 override, 255=preserve source)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_forward_sensor_id: Option<u8>,
    /// Rangefinder orientation override (MAVLink enum, 255=preserve source)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_forward_orientation: Option<u8>,
    /// Preserve source sysid/compid when forwarding (0=no, 1=yes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rf_forward_preserve_src_ids: Option<u8>,
    /// Send position covariance matrix to ArduPilot (0=disabled, 1=enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_cov_matrix: Option<u8>,
    /// RMSE threshold for position validity in meters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rmse_threshold: Option<f64>,
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
    /// TDoA TDMA active slots per frame (2-8), 0=legacy (8)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tdoa_slot_count: Option<u8>,
    /// TDoA TDMA slot duration in microseconds, 0=legacy (~2ms)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tdoa_slot_duration_us: Option<u16>,
    /// Periodic TDoA anchor stats UDP telemetry enable (0=disabled, 1=enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tdoa_anchor_telemetry_enable: Option<u8>,
    /// TDoA anchor stats UDP telemetry interval in milliseconds (250-60000)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tdoa_anchor_telemetry_interval_ms: Option<u16>,
    /// UDP destination port for TDoA anchor stats telemetry
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tdoa_anchor_telemetry_port: Option<u16>,
    /// TDoA tag matcher policy: 0=Youngest, 1=Random
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tdoa_matcher_policy: Option<u8>,
    /// Dynamic anchor positioning enable (0=static, 1=dynamic)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic_anchor_pos_enabled: Option<u8>,
    /// Anchor layout for dynamic position calculation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_layout: Option<u8>,
    /// Lower-plane anchor height (NED: Z = -height)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_height: Option<f64>,
    /// Vertical distance between lower and upper dynamic anchor planes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_plane_separation: Option<f64>,
    /// Bitmask: bit N = anchor N position locked
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_pos_locked: Option<u32>,
    /// Number of distance samples to average (default: 50)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_avg_samples: Option<u16>,
    /// Position estimator mode: 0=3D, 1=2D (XY with fixed Z, default)
    #[serde(
        rename = "use2DEstimator",
        alias = "use2dEstimator",
        skip_serializing_if = "Option::is_none"
    )]
    pub use_2d_estimator: Option<u8>,
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
    /// LED 2 GPIO pin (65535 = unset)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub led2_pin: Option<u16>,
    /// LED 2 state (0 or 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub led2_state: Option<u8>,
}

// ==================== Local Config Storage Types ====================

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

// ==================== Preset Types ====================

/// Type of preset: full device configuration or locations only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetType {
    /// Full device configuration
    Full,
    /// Locations only (anchors + origin + rotation)
    Locations,
}

impl std::fmt::Display for PresetType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PresetType::Full => write!(f, "full"),
            PresetType::Locations => write!(f, "locations"),
        }
    }
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
#[serde(rename_all = "camelCase")]
pub struct LocationData {
    /// GPS origin coordinates
    pub origin: GpsOrigin,
    /// Rotation in degrees
    pub rotation: f64,
    /// Anchor configurations
    pub anchors: Vec<AnchorConfig>,
    /// Position estimator mode for TAG_TDOA uploads: 0=3D, 1=2D.
    #[serde(
        default,
        rename = "use2DEstimator",
        alias = "use2dEstimator",
        skip_serializing_if = "Option::is_none"
    )]
    pub use_2d_estimator: Option<u8>,
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

// ==================== Log Types ====================

/// Log level for filtering
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Verbose = 5,
    Debug = 4,
    Info = 3,
    Warn = 2,
    Error = 1,
    None = 0,
}

impl LogLevel {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "verbose" | "v" => Some(LogLevel::Verbose),
            "debug" | "d" => Some(LogLevel::Debug),
            "info" | "i" => Some(LogLevel::Info),
            "warn" | "warning" | "w" => Some(LogLevel::Warn),
            "error" | "e" => Some(LogLevel::Error),
            "none" | "n" => Some(LogLevel::None),
            _ => None,
        }
    }

    pub fn from_u8(level: u8) -> Self {
        match level {
            5 => LogLevel::Verbose,
            4 => LogLevel::Debug,
            3 => LogLevel::Info,
            2 => LogLevel::Warn,
            1 => LogLevel::Error,
            _ => LogLevel::None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Verbose => "VERBOSE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
            LogLevel::None => "NONE",
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// A single log message from a device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogMessage {
    /// Source device IP
    pub ip: String,
    /// Log level
    pub level: LogLevel,
    /// Log tag/component
    pub tag: String,
    /// Log message content
    pub message: String,
    /// Timestamp (if provided by device)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_serialization() {
        let device = Device {
            ip: "192.168.1.100".to_string(),
            id: "test-device".to_string(),
            role: DeviceRole::TagTdoa,
            mac: "AA:BB:CC:DD:EE:FF".to_string(),
            uwb_short: "1".to_string(),
            mav_sys_id: 1,
            firmware: "1.0.0".to_string(),
            online: Some(true),
            last_seen: None,
            sending_pos: Some(true),
            anchors_seen: Some(3),
            origin_sent: None,
            uwb_enabled: None,
            rf_forward_enabled: None,
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
            health: None,
        };

        let json = serde_json::to_string(&device).unwrap();
        assert!(json.contains("\"ip\":\"192.168.1.100\""));
        assert!(json.contains("\"role\":\"tag_tdoa\""));
        assert!(json.contains("\"uwbShort\":\"1\""));
        assert!(json.contains("\"mavSysId\":1"));

        let deserialized: Device = serde_json::from_str(&json).unwrap();
        assert_eq!(device.ip, deserialized.ip);
        assert_eq!(device.role, deserialized.role);
    }

    #[test]
    fn test_device_role_from_str() {
        assert_eq!(DeviceRole::from_str("anchor"), DeviceRole::Unknown);
        assert_eq!(DeviceRole::from_str("tag"), DeviceRole::Unknown);
        assert_eq!(DeviceRole::from_str("anchor_tdoa"), DeviceRole::AnchorTdoa);
        assert_eq!(DeviceRole::from_str("tag_tdoa"), DeviceRole::TagTdoa);
        assert_eq!(DeviceRole::from_str("calibration"), DeviceRole::Unknown);
        assert_eq!(DeviceRole::from_str("invalid"), DeviceRole::Unknown);
    }

    #[test]
    fn test_device_role_helpers() {
        assert!(DeviceRole::AnchorTdoa.is_anchor());
        assert!(!DeviceRole::TagTdoa.is_anchor());

        assert!(DeviceRole::TagTdoa.is_tag());
        assert!(!DeviceRole::AnchorTdoa.is_tag());
    }

    #[test]
    fn test_device_role_display() {
        assert_eq!(format!("{}", DeviceRole::AnchorTdoa), "Anchor (TDoA)");
        assert_eq!(format!("{}", DeviceRole::TagTdoa), "Tag (TDoA)");
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
                enable_uart_bridge: Some(1),
                log_udp_port: None,
                log_serial_enabled: None,
                log_udp_enabled: None,
            },
            uwb: UwbConfig {
                mode: 4,
                uwb_enable: Some(1),
                dev_short_addr: "1".to_string(),
                anchor_count: Some(3),
                anchors: Some(vec![
                    AnchorConfig {
                        id: "1".to_string(),
                        x: 0.0,
                        y: 0.0,
                        z: 1.5,
                    },
                    AnchorConfig {
                        id: "2".to_string(),
                        x: 3.0,
                        y: 0.0,
                        z: 1.5,
                    },
                    AnchorConfig {
                        id: "3".to_string(),
                        x: 1.5,
                        y: 2.6,
                        z: 1.5,
                    },
                ]),
                origin_lat: Some(41.4036),
                origin_lon: Some(2.1744),
                origin_alt: Some(100.0),
                mavlink_target_system_id: Some(1),
                output_backend: Some(1),
                rtls_beacon_age_bias_ms: Some(2),
                rtls_beacon_tdoa_sigma_floor_m: Some(0.25),
                rtls_beacon_tdoa_physical_guard_enable: Some(1),
                rtls_beacon_tdoa_physical_guard_margin_m: Some(1.0),
                rotation_degrees: Some(0.0),
                z_calc_mode: Some(1),
                rf_forward_enable: Some(1),
                rf_forward_sensor_id: Some(7),
                rf_forward_orientation: Some(25),
                rf_forward_preserve_src_ids: Some(1),
                enable_cov_matrix: Some(1),
                rmse_threshold: Some(0.8),
                channel: None,
                dw_mode: None,
                tx_power_level: None,
                smart_power_enable: None,
                tdoa_slot_count: None,
                tdoa_slot_duration_us: None,
                tdoa_anchor_telemetry_enable: Some(1),
                tdoa_anchor_telemetry_interval_ms: Some(1000),
                tdoa_anchor_telemetry_port: Some(3335),
                tdoa_matcher_policy: Some(1),
                dynamic_anchor_pos_enabled: None,
                anchor_layout: None,
                anchor_height: None,
                anchor_plane_separation: None,
                anchor_pos_locked: None,
                distance_avg_samples: None,
                use_2d_estimator: None,
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
    fn test_use_2d_estimator_wire_name_for_device_config() {
        let uwb: UwbConfig =
            serde_json::from_str(r#"{"mode":4,"devShortAddr":"1","use2DEstimator":0}"#).unwrap();
        assert_eq!(uwb.use_2d_estimator, Some(0));

        let alias_uwb: UwbConfig =
            serde_json::from_str(r#"{"mode":4,"devShortAddr":"1","use2dEstimator":1}"#).unwrap();
        assert_eq!(alias_uwb.use_2d_estimator, Some(1));

        let json = serde_json::to_string(&uwb).unwrap();
        assert!(json.contains("\"use2DEstimator\":0"));
        assert!(!json.contains("use2dEstimator"));
    }

    #[test]
    fn test_use_2d_estimator_wire_name_for_location_presets() {
        let location: LocationData = serde_json::from_str(
            r#"{"origin":{"lat":0.0,"lon":0.0,"alt":0.0},"rotation":0.0,"anchors":[],"use2DEstimator":0}"#,
        )
        .unwrap();
        assert_eq!(location.use_2d_estimator, Some(0));

        let alias_location: LocationData = serde_json::from_str(
            r#"{"origin":{"lat":0.0,"lon":0.0,"alt":0.0},"rotation":0.0,"anchors":[],"use2dEstimator":1}"#,
        )
        .unwrap();
        assert_eq!(alias_location.use_2d_estimator, Some(1));

        let json = serde_json::to_string(&location).unwrap();
        assert!(json.contains("\"use2DEstimator\":0"));
        assert!(!json.contains("use2dEstimator"));
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

    #[test]
    fn test_preset_type_display() {
        assert_eq!(format!("{}", PresetType::Full), "full");
        assert_eq!(format!("{}", PresetType::Locations), "locations");
    }

    #[test]
    fn test_log_level() {
        assert_eq!(LogLevel::from_str("info"), Some(LogLevel::Info));
        assert_eq!(LogLevel::from_str("WARNING"), Some(LogLevel::Warn));
        assert_eq!(LogLevel::from_str("invalid"), None);

        assert_eq!(LogLevel::from_u8(3), LogLevel::Info);
        assert_eq!(LogLevel::from_u8(99), LogLevel::None);

        assert_eq!(LogLevel::Info.as_str(), "INFO");
        assert_eq!(format!("{}", LogLevel::Error), "ERROR");
    }
}
