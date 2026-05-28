//! Configuration to parameter conversion.
//!
//! Converts DeviceConfig to an array of [group, name, value] tuples
//! for uploading to devices via write commands.
//!
//! IMPORTANT: devShortAddr is intentionally skipped to preserve device identity.

use crate::types::{AnchorConfig, DeviceConfig, LocationData};

const MAX_CONFIGURABLE_ANCHORS: usize = 8;

/// Parse a firmware `backup-config` payload into a DeviceConfig.
///
/// Firmware stores anchor geometry as flat `uwb.devIdN/xN/yN/zN` fields.
/// The manager stores anchors as `uwb.anchors`, so rebuild that array before
/// saving or uploading the config again.
pub fn device_config_from_backup_value(
    value: serde_json::Value,
) -> serde_json::Result<DeviceConfig> {
    let mut config: DeviceConfig = serde_json::from_value(value.clone())?;
    rebuild_flat_anchors(&mut config, &value).map_err(backup_parse_error)?;
    Ok(config)
}

fn backup_parse_error(message: String) -> serde_json::Error {
    <serde_json::Error as serde::de::Error>::custom(message)
}

fn rebuild_flat_anchors(
    config: &mut DeviceConfig,
    value: &serde_json::Value,
) -> Result<(), String> {
    if let Some(anchors) = config
        .uwb
        .anchors
        .as_ref()
        .filter(|anchors| !anchors.is_empty())
    {
        if let Some(count) = config.uwb.anchor_count {
            if count == 0 {
                return Err("Anchor count must be positive when set".to_string());
            }
            if count as usize > MAX_CONFIGURABLE_ANCHORS {
                return Err(format!(
                    "Maximum {} anchors supported",
                    MAX_CONFIGURABLE_ANCHORS
                ));
            }
            if count > 0 && anchors.len() != count as usize {
                return Err("Anchor geometry required when anchorCount is set".to_string());
            }
        }
        valid_anchor_entries(anchors)?;
        return Ok(());
    }

    let Some(uwb) = value.get("uwb").and_then(|v| v.as_object()) else {
        return Ok(());
    };

    let explicit_count = config
        .uwb
        .anchor_count
        .map(usize::from)
        .or_else(|| value_to_usize(uwb.get("anchorCount")));
    if explicit_count == Some(0) {
        return Err("Anchor count must be positive when set".to_string());
    }

    let count = explicit_count.unwrap_or(0);
    if count > MAX_CONFIGURABLE_ANCHORS {
        return Err(format!(
            "Maximum {} anchors supported",
            MAX_CONFIGURABLE_ANCHORS
        ));
    }

    if count == 0 {
        if has_flat_anchor_fields(uwb) {
            return Err("Anchor count required when anchor geometry is present".to_string());
        }
        return Ok(());
    }

    let mut anchors = Vec::with_capacity(count);
    for idx in 1..=count {
        let id = normalize_anchor_config_id_value(uwb.get(&format!("devId{}", idx)))
            .ok_or_else(|| format!("Invalid or missing anchor id devId{}", idx))?;
        let x = value_to_f64(uwb.get(&format!("x{}", idx)))
            .filter(|v| v.is_finite())
            .ok_or_else(|| format!("Invalid or missing anchor coordinate x{}", idx))?;
        let y = value_to_f64(uwb.get(&format!("y{}", idx)))
            .filter(|v| v.is_finite())
            .ok_or_else(|| format!("Invalid or missing anchor coordinate y{}", idx))?;
        let z = value_to_f64(uwb.get(&format!("z{}", idx)))
            .filter(|v| v.is_finite())
            .ok_or_else(|| format!("Invalid or missing anchor coordinate z{}", idx))?;

        anchors.push(AnchorConfig { id, x, y, z });
    }

    valid_anchor_entries(&anchors)?;
    config.uwb.anchors = Some(anchors);
    Ok(())
}

fn value_to_usize(value: Option<&serde_json::Value>) -> Option<usize> {
    value
        .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
        .and_then(|v| usize::try_from(v).ok())
}

fn has_flat_anchor_fields(uwb: &serde_json::Map<String, serde_json::Value>) -> bool {
    (1..=MAX_CONFIGURABLE_ANCHORS).any(|idx| {
        uwb.contains_key(&format!("devId{}", idx))
            || uwb.contains_key(&format!("x{}", idx))
            || uwb.contains_key(&format!("y{}", idx))
            || uwb.contains_key(&format!("z{}", idx))
    })
}

fn value_to_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    value.and_then(|v| {
        v.as_f64()
            .or_else(|| v.as_i64().map(|n| n as f64))
            .or_else(|| v.as_str()?.trim().parse().ok())
    })
}

fn normalize_anchor_config_id(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    if raw.len() <= 2 && raw.chars().all(|c| c.is_ascii_digit()) {
        let id = raw.parse::<usize>().ok()?;
        return (id < MAX_CONFIGURABLE_ANCHORS).then(|| id.to_string());
    }

    if raw.len() == 4 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
        let hi = u8::from_str_radix(&raw[0..2], 16).ok()?;
        let lo = u8::from_str_radix(&raw[2..4], 16).ok()?;
        let digits: String = [hi, lo]
            .into_iter()
            .filter(|b| *b != 0)
            .filter_map(|b| {
                let c = char::from(b);
                c.is_ascii_digit().then_some(c)
            })
            .collect();
        let normalized = digits.trim_start_matches('0');
        let id = if normalized.is_empty() {
            0
        } else {
            normalized.parse::<usize>().ok()?
        };
        return (id < MAX_CONFIGURABLE_ANCHORS).then(|| id.to_string());
    }

    None
}

fn normalize_anchor_config_id_value(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    let raw = value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string());
    normalize_anchor_config_id(&raw)
}

type ParamTuple = (String, String, String);

fn valid_anchor_entries(anchors: &[AnchorConfig]) -> Result<Vec<(String, &AnchorConfig)>, String> {
    if anchors.len() > MAX_CONFIGURABLE_ANCHORS {
        return Err(format!(
            "Maximum {} anchors supported",
            MAX_CONFIGURABLE_ANCHORS
        ));
    }

    let mut seen = [false; MAX_CONFIGURABLE_ANCHORS];
    let mut valid = Vec::new();

    for anchor in anchors {
        let id = normalize_anchor_config_id(&anchor.id)
            .ok_or_else(|| "Anchor IDs must be 0-7".to_string())?;
        let index = id
            .parse::<usize>()
            .map_err(|_| "Anchor IDs must be 0-7".to_string())?;
        if index >= MAX_CONFIGURABLE_ANCHORS || seen[index] {
            return Err(if index >= MAX_CONFIGURABLE_ANCHORS {
                "Anchor IDs must be 0-7".to_string()
            } else {
                "Anchor IDs must be unique".to_string()
            });
        }

        if !anchor.x.is_finite() || !anchor.y.is_finite() || !anchor.z.is_finite() {
            return Err("Anchor coordinates must be finite numbers".to_string());
        }

        seen[index] = true;
        valid.push((id, anchor));
    }

    if !(0..valid.len()).all(|index| seen[index]) {
        return Err("Anchor IDs must be contiguous from 0".to_string());
    }

    Ok(valid)
}

fn append_anchor_params(
    params: &mut Vec<ParamTuple>,
    anchors: &[AnchorConfig],
) -> Result<(), String> {
    let anchors = valid_anchor_entries(anchors)?;
    if anchors.is_empty() {
        return Err("Anchor geometry required when anchorCount is set".to_string());
    }

    for (i, (anchor_id, anchor)) in anchors.iter().enumerate() {
        let idx = i + 1; // 1-indexed in firmware
        params.push((
            "uwb".to_string(),
            format!("devId{}", idx),
            anchor_id.clone(),
        ));
        params.push(("uwb".to_string(), format!("x{}", idx), anchor.x.to_string()));
        params.push(("uwb".to_string(), format!("y{}", idx), anchor.y.to_string()));
        params.push(("uwb".to_string(), format!("z{}", idx), anchor.z.to_string()));
    }
    params.push((
        "uwb".to_string(),
        "anchorCount".to_string(),
        anchors.len().to_string(),
    ));
    Ok(())
}

/// Convert a DeviceConfig to parameter tuples.
///
/// Each tuple is (group, name, value).
/// Note: devShortAddr is intentionally skipped to preserve device identity.
pub fn config_to_params(config: &DeviceConfig) -> Result<Vec<ParamTuple>, String> {
    let mut params = Vec::new();

    // WiFi params
    params.push((
        "wifi".to_string(),
        "mode".to_string(),
        config.wifi.mode.to_string(),
    ));

    if let Some(ref v) = config.wifi.ssid_a_p {
        params.push(("wifi".to_string(), "ssidAP".to_string(), v.clone()));
    }
    if let Some(ref v) = config.wifi.pswd_a_p {
        params.push(("wifi".to_string(), "pswdAP".to_string(), v.clone()));
    }
    if let Some(ref v) = config.wifi.ssid_s_t {
        params.push(("wifi".to_string(), "ssidST".to_string(), v.clone()));
    }
    if let Some(ref v) = config.wifi.pswd_s_t {
        params.push(("wifi".to_string(), "pswdST".to_string(), v.clone()));
    }
    if let Some(ref v) = config.wifi.gcs_ip {
        params.push(("wifi".to_string(), "gcsIp".to_string(), v.clone()));
    }
    if let Some(v) = config.wifi.udp_port {
        params.push(("wifi".to_string(), "udpPort".to_string(), v.to_string()));
    }
    if let Some(v) = config.wifi.enable_web_server {
        params.push((
            "wifi".to_string(),
            "enableWebServer".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.wifi.enable_uart_bridge {
        params.push((
            "wifi".to_string(),
            "enableUartBridge".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.wifi.enable_discovery {
        params.push((
            "wifi".to_string(),
            "enableDiscovery".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.wifi.discovery_port {
        params.push((
            "wifi".to_string(),
            "discoveryPort".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.wifi.log_udp_port {
        params.push(("wifi".to_string(), "logUdpPort".to_string(), v.to_string()));
    }
    if let Some(v) = config.wifi.log_serial_enabled {
        params.push((
            "wifi".to_string(),
            "logSerialEnabled".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.wifi.log_udp_enabled {
        params.push((
            "wifi".to_string(),
            "logUdpEnabled".to_string(),
            v.to_string(),
        ));
    }

    // UWB params
    params.push((
        "uwb".to_string(),
        "mode".to_string(),
        config.uwb.mode.to_string(),
    ));
    if let Some(v) = config.uwb.uwb_enable {
        params.push(("uwb".to_string(), "uwbEnable".to_string(), v.to_string()));
    }
    // NOTE: devShortAddr intentionally skipped - preserved per-device

    // Flatten anchors array to devId1/x1/y1/z1, devId2/x2/y2/z2, etc.
    if let Some(ref anchors) = config.uwb.anchors {
        if let Some(count) = config.uwb.anchor_count {
            if count == 0 {
                return Err("Anchor count must be positive when set".to_string());
            }
            if anchors.len() != count as usize {
                return Err("Anchor geometry required when anchorCount is set".to_string());
            }
        }
        append_anchor_params(&mut params, anchors)?;
    } else if let Some(v) = config.uwb.anchor_count {
        if v == 0 {
            return Err("Anchor count must be positive when set".to_string());
        }
        return Err("Anchor geometry required when anchorCount is set".to_string());
    }

    if let Some(v) = config.uwb.origin_lat {
        params.push(("uwb".to_string(), "originLat".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.origin_lon {
        params.push(("uwb".to_string(), "originLon".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.origin_alt {
        params.push(("uwb".to_string(), "originAlt".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.mavlink_target_system_id {
        params.push((
            "uwb".to_string(),
            "mavlinkTargetSystemId".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.output_backend {
        params.push((
            "uwb".to_string(),
            "outputBackend".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.rtls_beacon_age_bias_ms {
        params.push((
            "uwb".to_string(),
            "rtlsBeaconAgeBiasMs".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.rotation_degrees {
        params.push((
            "uwb".to_string(),
            "rotationDegrees".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.z_calc_mode {
        params.push(("uwb".to_string(), "zCalcMode".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.rf_forward_enable {
        params.push((
            "uwb".to_string(),
            "rfForwardEnable".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.rf_forward_sensor_id {
        params.push((
            "uwb".to_string(),
            "rfForwardSensorId".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.rf_forward_orientation {
        params.push((
            "uwb".to_string(),
            "rfForwardOrientation".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.rf_forward_preserve_src_ids {
        params.push((
            "uwb".to_string(),
            "rfForwardPreserveSrcIds".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.enable_cov_matrix {
        params.push((
            "uwb".to_string(),
            "enableCovMatrix".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.rmse_threshold {
        params.push((
            "uwb".to_string(),
            "rmseThreshold".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.channel {
        params.push(("uwb".to_string(), "channel".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.dw_mode {
        params.push(("uwb".to_string(), "dwMode".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.tx_power_level {
        params.push(("uwb".to_string(), "txPowerLevel".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.smart_power_enable {
        params.push((
            "uwb".to_string(),
            "smartPowerEnable".to_string(),
            v.to_string(),
        ));
    }
    // TDoA TDMA schedule (TDoA anchors only)
    if let Some(v) = config.uwb.tdoa_slot_count {
        params.push((
            "uwb".to_string(),
            "tdoaSlotCount".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.tdoa_slot_duration_us {
        params.push((
            "uwb".to_string(),
            "tdoaSlotDurationUs".to_string(),
            v.to_string(),
        ));
    }
    // Dynamic anchor positioning (TDoA tags only)
    if let Some(v) = config.uwb.dynamic_anchor_pos_enabled {
        params.push((
            "uwb".to_string(),
            "dynamicAnchorPosEnabled".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.anchor_layout {
        params.push(("uwb".to_string(), "anchorLayout".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.anchor_height {
        params.push(("uwb".to_string(), "anchorHeight".to_string(), v.to_string()));
    }
    if let Some(v) = config.uwb.anchor_pos_locked {
        params.push((
            "uwb".to_string(),
            "anchorPosLocked".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.distance_avg_samples {
        params.push((
            "uwb".to_string(),
            "distanceAvgSamples".to_string(),
            v.to_string(),
        ));
    }
    if let Some(v) = config.uwb.use_2d_estimator {
        params.push((
            "uwb".to_string(),
            "use2DEstimator".to_string(),
            v.to_string(),
        ));
    }

    // App params
    if let Some(v) = config.app.led2_pin {
        params.push(("app".to_string(), "led2Pin".to_string(), v.to_string()));
    }
    if let Some(v) = config.app.led2_state {
        params.push(("app".to_string(), "led2State".to_string(), v.to_string()));
    }

    Ok(params)
}

/// Convert LocationData to parameter tuples.
///
/// This is used for location-only presets and only includes:
/// - Origin (lat, lon, alt)
/// - Rotation
/// - Anchors
pub fn location_to_params(location: &LocationData) -> Result<Vec<ParamTuple>, String> {
    let mut params = Vec::new();

    // Origin
    params.push((
        "uwb".to_string(),
        "originLat".to_string(),
        location.origin.lat.to_string(),
    ));
    params.push((
        "uwb".to_string(),
        "originLon".to_string(),
        location.origin.lon.to_string(),
    ));
    params.push((
        "uwb".to_string(),
        "originAlt".to_string(),
        location.origin.alt.to_string(),
    ));

    // Rotation
    params.push((
        "uwb".to_string(),
        "rotationDegrees".to_string(),
        location.rotation.to_string(),
    ));

    // Anchors
    if location.anchors.is_empty() {
        return Err("Location preset must include anchor geometry".to_string());
    }
    append_anchor_params(&mut params, &location.anchors)?;

    Ok(params)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AnchorConfig, AppConfig, GpsOrigin, UwbConfig, WifiConfig};

    fn minimal_device_config(
        anchor_count: Option<u8>,
        anchors: Option<Vec<AnchorConfig>>,
    ) -> DeviceConfig {
        DeviceConfig {
            wifi: WifiConfig {
                mode: 1,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: None,
                pswd_s_t: None,
                gcs_ip: None,
                udp_port: None,
                enable_web_server: None,
                enable_uart_bridge: None,
                enable_discovery: None,
                discovery_port: None,
                log_udp_port: None,
                log_serial_enabled: None,
                log_udp_enabled: None,
            },
            uwb: UwbConfig {
                mode: 4,
                uwb_enable: None,
                dev_short_addr: "1".to_string(),
                anchor_count,
                anchors,
                origin_lat: None,
                origin_lon: None,
                origin_alt: None,
                mavlink_target_system_id: None,
                output_backend: None,
                rtls_beacon_age_bias_ms: None,
                rotation_degrees: None,
                z_calc_mode: None,
                rf_forward_enable: None,
                rf_forward_sensor_id: None,
                rf_forward_orientation: None,
                rf_forward_preserve_src_ids: None,
                enable_cov_matrix: None,
                rmse_threshold: None,
                channel: None,
                dw_mode: None,
                tx_power_level: None,
                smart_power_enable: None,
                tdoa_slot_count: None,
                tdoa_slot_duration_us: None,
                dynamic_anchor_pos_enabled: None,
                anchor_layout: None,
                anchor_height: None,
                anchor_pos_locked: None,
                distance_avg_samples: None,
                use_2d_estimator: None,
            },
            app: AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        }
    }

    #[test]
    fn test_config_to_params_basic() {
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
                enable_discovery: Some(1),
                discovery_port: Some(3333),
                log_udp_port: None,
                log_serial_enabled: None,
                log_udp_enabled: None,
            },
            uwb: UwbConfig {
                mode: 4,
                uwb_enable: Some(1),
                dev_short_addr: "1".to_string(), // Should be skipped
                anchor_count: None,
                anchors: Some(vec![
                    AnchorConfig {
                        id: "0".to_string(),
                        x: 0.0,
                        y: 0.0,
                        z: 1.5,
                    },
                    AnchorConfig {
                        id: "1".to_string(),
                        x: 3.0,
                        y: 0.0,
                        z: 1.5,
                    },
                ]),
                origin_lat: Some(41.4036),
                origin_lon: Some(2.1744),
                origin_alt: Some(100.0),
                mavlink_target_system_id: Some(1),
                output_backend: Some(1),
                rtls_beacon_age_bias_ms: Some(2),
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
                dynamic_anchor_pos_enabled: None,
                anchor_layout: None,
                anchor_height: None,
                anchor_pos_locked: None,
                distance_avg_samples: None,
                use_2d_estimator: None,
            },
            app: AppConfig {
                led2_pin: Some(2),
                led2_state: Some(0),
            },
        };

        let params = config_to_params(&config).unwrap();

        // Check that devShortAddr is NOT in the params
        assert!(!params.iter().any(|(_, n, _)| n == "devShortAddr"));

        // Check that anchors are flattened
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "anchorCount" && v == "2"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId1" && v == "0"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "x1" && v == "0"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId2" && v == "1"));

        // Check other params
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "wifi" && n == "mode" && v == "1"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "wifi" && n == "ssidST" && v == "TestNetwork"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "wifi" && n == "enableUartBridge" && v == "1"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "uwbEnable" && v == "1"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "rfForwardEnable" && v == "1"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "rfForwardSensorId" && v == "7"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "rfForwardOrientation" && v == "25"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "rfForwardPreserveSrcIds" && v == "1"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "enableCovMatrix" && v == "1"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "rmseThreshold" && v == "0.8"));
    }

    #[test]
    fn device_config_from_backup_value_rebuilds_flat_anchors() {
        let raw = serde_json::json!({
            "wifi": {
                "mode": 1,
                "ssidST": "field-router"
            },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 2,
                "devId1": "3030",
                "x1": "1.5",
                "y1": 2.0,
                "z1": "-0.5",
                "devId2": 1,
                "x2": 3,
                "y2": "4.25",
                "z2": 0
            },
            "app": {}
        });

        let config = device_config_from_backup_value(raw).unwrap();
        let anchors = config.uwb.anchors.as_ref().unwrap();

        assert_eq!(anchors.len(), 2);
        assert_eq!(anchors[0].id, "0");
        assert_eq!(anchors[0].x, 1.5);
        assert_eq!(anchors[0].y, 2.0);
        assert_eq!(anchors[0].z, -0.5);
        assert_eq!(anchors[1].id, "1");
        assert_eq!(anchors[1].x, 3.0);
        assert_eq!(anchors[1].y, 4.25);
        assert_eq!(anchors[1].z, 0.0);

        let params = config_to_params(&config).unwrap();
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId1" && v == "0"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "x2" && v == "3"));
    }

    #[test]
    fn device_config_from_backup_value_rebuilds_eight_flat_anchors() {
        let mut uwb = serde_json::json!({
            "mode": 4,
            "devShortAddr": "7",
            "anchorCount": 8
        });
        let map = uwb.as_object_mut().unwrap();
        for idx in 1..=8 {
            map.insert(
                format!("devId{}", idx),
                serde_json::json!((idx - 1).to_string()),
            );
            map.insert(format!("x{}", idx), serde_json::json!(idx as f64));
            map.insert(format!("y{}", idx), serde_json::json!((idx as f64) + 0.5));
            map.insert(format!("z{}", idx), serde_json::json!(-(idx as f64)));
        }

        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": uwb,
            "app": {}
        });

        let config = device_config_from_backup_value(raw).unwrap();
        let anchors = config.uwb.anchors.as_ref().unwrap();

        assert_eq!(anchors.len(), 8);
        assert_eq!(anchors[7].id, "7");
        assert_eq!(anchors[7].x, 8.0);
        assert_eq!(anchors[7].y, 8.5);
        assert_eq!(anchors[7].z, -8.0);

        let params = config_to_params(&config).unwrap();
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "anchorCount" && v == "8"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId8" && v == "7"));
    }

    #[test]
    fn device_config_from_backup_value_preserves_existing_anchor_array() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 1,
                "anchors": [{ "id": "0", "x": 9.0, "y": 8.0, "z": 7.0 }],
                "devId1": "1",
                "x1": 1.0,
                "y1": 2.0,
                "z1": 3.0
            },
            "app": {}
        });

        let config = device_config_from_backup_value(raw).unwrap();
        let anchors = config.uwb.anchors.as_ref().unwrap();

        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].id, "0");
        assert_eq!(anchors[0].x, 9.0);
    }

    #[test]
    fn device_config_from_backup_value_rejects_incomplete_flat_anchors() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 2,
                "devId1": "0",
                "x1": 1.0,
                "y1": 2.0,
                "z1": 3.0,
                "devId2": "1",
                "x2": 4.0,
                "y2": 5.0
            },
            "app": {}
        });

        let err = device_config_from_backup_value(raw)
            .unwrap_err()
            .to_string();

        assert!(err.contains("Invalid or missing anchor coordinate z2"));
    }

    #[test]
    fn device_config_from_backup_value_rejects_malformed_flat_anchors() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 2,
                "devId1": "0",
                "x1": 1.0,
                "y1": 2.0,
                "z1": 3.0,
                "devId2": "0",
                "x2": "NaN",
                "y2": 5.0,
                "z2": 6.0
            },
            "app": {}
        });

        let err = device_config_from_backup_value(raw)
            .unwrap_err()
            .to_string();

        assert!(err.contains("Invalid or missing anchor coordinate x2"));
    }

    #[test]
    fn device_config_from_backup_value_rejects_duplicate_flat_anchor_ids() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 2,
                "devId1": "0",
                "x1": 1.0,
                "y1": 2.0,
                "z1": 3.0,
                "devId2": "0",
                "x2": 4.0,
                "y2": 5.0,
                "z2": 6.0
            },
            "app": {}
        });

        let err = device_config_from_backup_value(raw)
            .unwrap_err()
            .to_string();

        assert!(err.contains("Anchor IDs must be unique"));
    }

    #[test]
    fn device_config_from_backup_value_rejects_too_many_flat_anchors() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 9
            },
            "app": {}
        });

        let err = device_config_from_backup_value(raw)
            .unwrap_err()
            .to_string();

        assert!(err.contains("Maximum 8 anchors supported"));
    }

    #[test]
    fn device_config_from_backup_value_rejects_zero_anchor_count() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "anchorCount": 0
            },
            "app": {}
        });

        let err = device_config_from_backup_value(raw)
            .unwrap_err()
            .to_string();

        assert!(err.contains("Anchor count must be positive when set"));
    }

    #[test]
    fn device_config_from_backup_value_rejects_flat_anchors_without_count() {
        let raw = serde_json::json!({
            "wifi": { "mode": 1 },
            "uwb": {
                "mode": 4,
                "devShortAddr": "7",
                "devId1": "0",
                "x1": 1.0,
                "y1": 2.0,
                "z1": 3.0
            },
            "app": {}
        });

        let err = device_config_from_backup_value(raw)
            .unwrap_err()
            .to_string();

        assert!(err.contains("Anchor count required when anchor geometry is present"));
    }

    #[test]
    fn config_to_params_normalizes_contiguous_anchor_ids_before_writing() {
        let config = DeviceConfig {
            wifi: WifiConfig {
                mode: 1,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: None,
                pswd_s_t: None,
                gcs_ip: None,
                udp_port: None,
                enable_web_server: None,
                enable_uart_bridge: None,
                enable_discovery: None,
                discovery_port: None,
                log_udp_port: None,
                log_serial_enabled: None,
                log_udp_enabled: None,
            },
            uwb: UwbConfig {
                mode: 4,
                uwb_enable: None,
                dev_short_addr: "1".to_string(),
                anchor_count: None,
                anchors: Some(vec![
                    AnchorConfig {
                        id: "0".to_string(),
                        x: 0.0,
                        y: 0.0,
                        z: 0.0,
                    },
                    AnchorConfig {
                        id: "3031".to_string(),
                        x: 1.0,
                        y: 0.0,
                        z: 0.0,
                    },
                ]),
                origin_lat: None,
                origin_lon: None,
                origin_alt: None,
                mavlink_target_system_id: None,
                output_backend: None,
                rtls_beacon_age_bias_ms: None,
                rotation_degrees: None,
                z_calc_mode: None,
                rf_forward_enable: None,
                rf_forward_sensor_id: None,
                rf_forward_orientation: None,
                rf_forward_preserve_src_ids: None,
                enable_cov_matrix: None,
                rmse_threshold: None,
                channel: None,
                dw_mode: None,
                tx_power_level: None,
                smart_power_enable: None,
                tdoa_slot_count: None,
                tdoa_slot_duration_us: None,
                dynamic_anchor_pos_enabled: None,
                anchor_layout: None,
                anchor_height: None,
                anchor_pos_locked: None,
                distance_avg_samples: None,
                use_2d_estimator: None,
            },
            app: AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        };

        let params = config_to_params(&config).unwrap();

        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "anchorCount" && v == "2"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId1" && v == "0"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId2" && v == "1"));
        let anchor_count_pos = params
            .iter()
            .position(|(g, n, _)| g == "uwb" && n == "anchorCount")
            .unwrap();
        let dev_id_2_pos = params
            .iter()
            .position(|(g, n, _)| g == "uwb" && n == "devId2")
            .unwrap();
        assert!(anchor_count_pos > dev_id_2_pos);
    }

    #[test]
    fn location_to_params_normalizes_contiguous_anchor_ids_before_writing() {
        let location = LocationData {
            origin: GpsOrigin {
                lat: 1.0,
                lon: 2.0,
                alt: 3.0,
            },
            rotation: 0.0,
            anchors: vec![
                AnchorConfig {
                    id: "0".to_string(),
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                AnchorConfig {
                    id: "1".to_string(),
                    x: 1.0,
                    y: 0.0,
                    z: 0.0,
                },
            ],
        };

        let params = location_to_params(&location).unwrap();

        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "anchorCount" && v == "2"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId1" && v == "0"));
        assert!(params
            .iter()
            .any(|(g, n, v)| g == "uwb" && n == "devId2" && v == "1"));
        let anchor_count_pos = params
            .iter()
            .position(|(g, n, _)| g == "uwb" && n == "anchorCount")
            .unwrap();
        let dev_id_2_pos = params
            .iter()
            .position(|(g, n, _)| g == "uwb" && n == "devId2")
            .unwrap();
        assert!(anchor_count_pos > dev_id_2_pos);
    }

    #[test]
    fn config_to_params_rejects_positive_count_without_geometry() {
        let config = DeviceConfig {
            wifi: WifiConfig {
                mode: 1,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: None,
                pswd_s_t: None,
                gcs_ip: None,
                udp_port: None,
                enable_web_server: None,
                enable_uart_bridge: None,
                enable_discovery: None,
                discovery_port: None,
                log_udp_port: None,
                log_serial_enabled: None,
                log_udp_enabled: None,
            },
            uwb: UwbConfig {
                mode: 4,
                uwb_enable: None,
                dev_short_addr: "1".to_string(),
                anchor_count: Some(5),
                anchors: None,
                origin_lat: None,
                origin_lon: None,
                origin_alt: None,
                mavlink_target_system_id: None,
                output_backend: None,
                rtls_beacon_age_bias_ms: None,
                rotation_degrees: None,
                z_calc_mode: None,
                rf_forward_enable: None,
                rf_forward_sensor_id: None,
                rf_forward_orientation: None,
                rf_forward_preserve_src_ids: None,
                enable_cov_matrix: None,
                rmse_threshold: None,
                channel: None,
                dw_mode: None,
                tx_power_level: None,
                smart_power_enable: None,
                tdoa_slot_count: None,
                tdoa_slot_duration_us: None,
                dynamic_anchor_pos_enabled: None,
                anchor_layout: None,
                anchor_height: None,
                anchor_pos_locked: None,
                distance_avg_samples: None,
                use_2d_estimator: None,
            },
            app: AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        };

        assert_eq!(
            config_to_params(&config).unwrap_err(),
            "Anchor geometry required when anchorCount is set"
        );
    }

    #[test]
    fn config_to_params_rejects_zero_count_without_geometry() {
        let config = minimal_device_config(Some(0), None);

        assert_eq!(
            config_to_params(&config).unwrap_err(),
            "Anchor count must be positive when set"
        );
    }

    #[test]
    fn config_to_params_rejects_zero_count_with_geometry() {
        let config = minimal_device_config(
            Some(0),
            Some(vec![AnchorConfig {
                id: "0".to_string(),
                x: 0.0,
                y: 0.0,
                z: 0.0,
            }]),
        );

        assert_eq!(
            config_to_params(&config).unwrap_err(),
            "Anchor count must be positive when set"
        );
    }

    #[test]
    fn config_to_params_rejects_empty_anchor_geometry() {
        let config = minimal_device_config(None, Some(vec![]));

        assert_eq!(
            config_to_params(&config).unwrap_err(),
            "Anchor geometry required when anchorCount is set"
        );
    }

    #[test]
    fn config_to_params_rejects_count_mismatched_geometry() {
        let config = DeviceConfig {
            wifi: WifiConfig {
                mode: 1,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: None,
                pswd_s_t: None,
                gcs_ip: None,
                udp_port: None,
                enable_web_server: None,
                enable_uart_bridge: None,
                enable_discovery: None,
                discovery_port: None,
                log_udp_port: None,
                log_serial_enabled: None,
                log_udp_enabled: None,
            },
            uwb: UwbConfig {
                mode: 4,
                uwb_enable: None,
                dev_short_addr: "1".to_string(),
                anchor_count: Some(5),
                anchors: Some(vec![]),
                origin_lat: None,
                origin_lon: None,
                origin_alt: None,
                mavlink_target_system_id: None,
                output_backend: None,
                rtls_beacon_age_bias_ms: None,
                rotation_degrees: None,
                z_calc_mode: None,
                rf_forward_enable: None,
                rf_forward_sensor_id: None,
                rf_forward_orientation: None,
                rf_forward_preserve_src_ids: None,
                enable_cov_matrix: None,
                rmse_threshold: None,
                channel: None,
                dw_mode: None,
                tx_power_level: None,
                smart_power_enable: None,
                tdoa_slot_count: None,
                tdoa_slot_duration_us: None,
                dynamic_anchor_pos_enabled: None,
                anchor_layout: None,
                anchor_height: None,
                anchor_pos_locked: None,
                distance_avg_samples: None,
                use_2d_estimator: None,
            },
            app: AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        };

        assert_eq!(
            config_to_params(&config).unwrap_err(),
            "Anchor geometry required when anchorCount is set"
        );
    }

    #[test]
    fn non_contiguous_anchor_ids_are_rejected() {
        let location = LocationData {
            origin: GpsOrigin {
                lat: 1.0,
                lon: 2.0,
                alt: 3.0,
            },
            rotation: 0.0,
            anchors: vec![
                AnchorConfig {
                    id: "0".to_string(),
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                AnchorConfig {
                    id: "2".to_string(),
                    x: 3.0,
                    y: 0.0,
                    z: 0.0,
                },
            ],
        };

        assert_eq!(
            location_to_params(&location).unwrap_err(),
            "Anchor IDs must be contiguous from 0"
        );
    }

    #[test]
    fn location_to_params_rejects_missing_anchor_geometry() {
        let location = LocationData {
            origin: GpsOrigin {
                lat: 1.0,
                lon: 2.0,
                alt: 3.0,
            },
            rotation: 0.0,
            anchors: vec![],
        };

        assert_eq!(
            location_to_params(&location).unwrap_err(),
            "Location preset must include anchor geometry"
        );
    }
}
