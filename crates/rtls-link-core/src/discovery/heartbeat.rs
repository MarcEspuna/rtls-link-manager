//! Heartbeat parsing and device pruning utilities.

use crate::health::calculate_device_health;
use crate::mavlink::rtlslink::{
    MavMessage, RtlsDeviceRole, RtlsDeviceStatusFlags, RTLS_DEVICE_STATUS_DATA,
};
use crate::mavlink::{peek_reader::PeekReader, read_v2_msg};
use crate::types::{Device, DeviceRole, DynamicAnchorPosition};
use std::collections::HashMap;
use std::io::Cursor;
use std::time::{Duration, Instant};

/// Default TTL for devices (pruned if no heartbeat for this duration)
pub const DEVICE_TTL: Duration = Duration::from_secs(5);

/// Parse a heartbeat packet into a Device struct.
pub fn parse_heartbeat(data: &[u8], ip: String) -> Result<Device, serde_json::Error> {
    if let Ok(device) = parse_mavlink_status(data, &ip) {
        return Ok(device);
    }

    let json: serde_json::Value = serde_json::from_slice(data)?;

    // Parse optional dynamic anchor positions
    let dynamic_anchors = json["dyn_anchors"].as_array().map(|arr| {
        arr.iter()
            .filter_map(|v| {
                Some(DynamicAnchorPosition {
                    id: v["id"].as_u64()? as u8,
                    x: v["x"].as_f64()?,
                    y: v["y"].as_f64()?,
                    z: v["z"].as_f64()?,
                })
            })
            .collect()
    });

    let mut device = Device {
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
        uwb_enabled: json["uwb_enabled"].as_bool(),
        rf_forward_enabled: json["rf_forward_enabled"].as_bool(),
        rf_enabled: json["rf_enabled"].as_bool(),
        rf_healthy: json["rf_healthy"].as_bool(),
        avg_rate_c_hz: json["avg_rate_cHz"].as_u64().map(|v| v as u16),
        min_rate_c_hz: json["min_rate_cHz"].as_u64().map(|v| v as u16),
        max_rate_c_hz: json["max_rate_cHz"].as_u64().map(|v| v as u16),
        log_level: json["log_level"].as_u64().map(|v| v as u8),
        log_udp_port: json["log_udp_port"].as_u64().map(|v| v as u16),
        log_serial_enabled: json["log_serial_enabled"].as_bool(),
        log_udp_enabled: json["log_udp_enabled"].as_bool(),
        dynamic_anchors,
        health: None,
    };
    device.health = Some(calculate_device_health(&device));
    Ok(device)
}

fn parse_mavlink_status(data: &[u8], source_ip: &str) -> Result<Device, String> {
    let cursor = Cursor::new(data);
    let mut reader = PeekReader::new(cursor);
    let (_, message) = read_v2_msg::<MavMessage, _>(&mut reader).map_err(|err| err.to_string())?;

    match message {
        MavMessage::RTLS_DEVICE_STATUS(status) => Ok(device_from_status(status, source_ip)),
        _ => Err("Not an RTLS device status frame".to_string()),
    }
}

fn device_from_status(status: RTLS_DEVICE_STATUS_DATA, source_ip: &str) -> Device {
    let short_addr = status.short_addr.to_str().unwrap_or("0").to_string();
    let device_type = status.device_type.to_str().unwrap_or("").to_string();
    let dynamic_anchors = if status
        .flags
        .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_DYNAMIC_ANCHORS_ENABLED)
    {
        let count = usize::from(status.dynamic_anchor_count.min(4));
        let anchors = (0..count)
            .map(|index| DynamicAnchorPosition {
                id: status.dynamic_anchor_id[index],
                x: f64::from(status.dynamic_anchor_x_mm[index]) / 1000.0,
                y: f64::from(status.dynamic_anchor_y_mm[index]) / 1000.0,
                z: f64::from(status.dynamic_anchor_z_mm[index]) / 1000.0,
            })
            .collect::<Vec<_>>();
        Some(anchors)
    } else {
        None
    };

    let mut device = Device {
        ip: source_ip.to_string(),
        id: if short_addr.is_empty() {
            device_type
        } else {
            short_addr.clone()
        },
        role: match status.role {
            RtlsDeviceRole::RTLS_DEVICE_ROLE_ANCHOR_TDOA => DeviceRole::AnchorTdoa,
            RtlsDeviceRole::RTLS_DEVICE_ROLE_TAG_TDOA => DeviceRole::TagTdoa,
            _ => DeviceRole::Unknown,
        },
        mac: format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            status.mac[0],
            status.mac[1],
            status.mac[2],
            status.mac[3],
            status.mac[4],
            status.mac[5]
        ),
        uwb_short: short_addr,
        mav_sys_id: status.mavlink_target_system,
        firmware: status.firmware_version.to_str().unwrap_or("").to_string(),
        online: Some(true),
        last_seen: Some(chrono::Utc::now()),
        sending_pos: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_SENDING_POSITION),
        ),
        anchors_seen: Some(status.anchors_seen),
        origin_sent: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_ORIGIN_SENT),
        ),
        uwb_enabled: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_UWB_ENABLED),
        ),
        rf_forward_enabled: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_RF_FORWARD_ENABLED),
        ),
        rf_enabled: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_RANGEFINDER_ENABLED),
        ),
        rf_healthy: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_RANGEFINDER_HEALTHY),
        ),
        avg_rate_c_hz: Some(status.avg_rate_chz),
        min_rate_c_hz: Some(status.min_rate_chz),
        max_rate_c_hz: Some(status.max_rate_chz),
        log_level: Some(status.log_level),
        log_udp_port: Some(status.log_udp_port),
        log_serial_enabled: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_LOG_SERIAL_ENABLED),
        ),
        log_udp_enabled: Some(
            status
                .flags
                .contains(RtlsDeviceStatusFlags::RTLS_DEVICE_STATUS_FLAG_LOG_UDP_ENABLED),
        ),
        dynamic_anchors,
        health: None,
    };
    device.health = Some(calculate_device_health(&device));
    device
}

/// Prune stale devices from a device map based on TTL.
pub fn prune_stale_devices(devices: &mut HashMap<String, (Device, Instant)>) {
    let now = Instant::now();
    devices.retain(|_, (_, last_seen)| now.duration_since(*last_seen) < DEVICE_TTL);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_heartbeat() {
        let json = r#"{
            "id": "device1",
            "role": "tag_tdoa",
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
        assert_eq!(device.role, DeviceRole::TagTdoa);
        assert_eq!(device.sending_pos, Some(true));
        assert_eq!(device.anchors_seen, Some(3));
    }

    #[test]
    fn test_parse_minimal_heartbeat() {
        let json = r#"{"id": "test", "role": "anchor_tdoa"}"#;
        let device = parse_heartbeat(json.as_bytes(), "10.0.0.1".to_string()).unwrap();

        assert_eq!(device.ip, "10.0.0.1");
        assert_eq!(device.id, "test");
        assert_eq!(device.role, DeviceRole::AnchorTdoa);
        assert_eq!(device.sending_pos, None);
    }

    #[test]
    fn test_parse_heartbeat_invalid_json() {
        let invalid = b"not valid json";
        let result = parse_heartbeat(invalid, "1.2.3.4".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_heartbeat_with_log_fields() {
        let json = r#"{
            "id": "device1",
            "role": "tag_tdoa",
            "log_level": 3,
            "log_udp_port": 3334,
            "log_serial_enabled": true,
            "log_udp_enabled": false
        }"#;

        let device = parse_heartbeat(json.as_bytes(), "10.0.0.1".to_string()).unwrap();
        assert_eq!(device.log_level, Some(3));
        assert_eq!(device.log_udp_port, Some(3334));
        assert_eq!(device.log_serial_enabled, Some(true));
        assert_eq!(device.log_udp_enabled, Some(false));
    }

    #[test]
    fn test_prune_stale_devices() {
        let mut devices: HashMap<String, (Device, Instant)> = HashMap::new();

        let fresh_device = Device {
            ip: "192.168.1.1".to_string(),
            id: "fresh".to_string(),
            role: DeviceRole::TagTdoa,
            mac: "".to_string(),
            uwb_short: "1".to_string(),
            mav_sys_id: 1,
            firmware: "".to_string(),
            online: Some(true),
            last_seen: None,
            sending_pos: None,
            anchors_seen: None,
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

        devices.insert(
            "192.168.1.1".to_string(),
            (fresh_device.clone(), Instant::now()),
        );

        let mut stale = fresh_device;
        stale.ip = "192.168.1.2".to_string();
        stale.id = "stale".to_string();
        devices.insert(
            "192.168.1.2".to_string(),
            (stale, Instant::now() - Duration::from_secs(6)),
        );

        assert_eq!(devices.len(), 2);
        prune_stale_devices(&mut devices);
        assert_eq!(devices.len(), 1);
        assert!(devices.contains_key("192.168.1.1"));
    }

    #[test]
    fn test_all_device_roles() {
        let roles = [
            ("anchor", DeviceRole::Unknown),
            ("tag", DeviceRole::Unknown),
            ("anchor_tdoa", DeviceRole::AnchorTdoa),
            ("tag_tdoa", DeviceRole::TagTdoa),
            ("calibration", DeviceRole::Unknown),
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
