//! Preset storage service.
//!
//! Provides file-based storage for presets (both full configs and location-only).

use crate::error::StorageError;
use crate::types::{Preset, PresetInfo, PresetType};
use regex::Regex;
use std::path::PathBuf;
use tokio::fs;

/// Regex for valid preset names: alphanumeric, dash, underscore only
const NAME_PATTERN: &str = r"^[a-zA-Z0-9_-]+$";

/// Maximum name length
const MAX_NAME_LENGTH: usize = 64;

/// Preset storage service.
///
/// Takes a `PathBuf` in the constructor so each consumer (Tauri, CLI) can
/// provide the correct storage path.
pub struct PresetStorage {
    preset_dir: PathBuf,
    name_regex: Regex,
}

impl PresetStorage {
    /// Create a new PresetStorage with the given directory.
    pub fn new(dir: PathBuf) -> Result<Self, StorageError> {
        std::fs::create_dir_all(&dir).map_err(StorageError::Io)?;

        Ok(Self {
            preset_dir: dir,
            name_regex: Regex::new(NAME_PATTERN).unwrap(),
        })
    }

    fn validate_name(&self, name: &str) -> Result<(), StorageError> {
        if name.is_empty() {
            return Err(StorageError::InvalidPresetName(
                "Name cannot be empty".to_string(),
            ));
        }

        if name.len() > MAX_NAME_LENGTH {
            return Err(StorageError::InvalidPresetName(format!(
                "Name exceeds maximum length of {} characters",
                MAX_NAME_LENGTH
            )));
        }

        if !self.name_regex.is_match(name) {
            return Err(StorageError::InvalidPresetName(format!(
                "Name '{}' contains invalid characters. Only alphanumeric, dash, and underscore allowed.",
                name
            )));
        }

        Ok(())
    }

    fn get_path(&self, name: &str) -> PathBuf {
        self.preset_dir.join(format!("{}.json", name))
    }

    /// List all saved presets.
    pub async fn list(&self) -> Result<Vec<PresetInfo>, StorageError> {
        let mut presets = Vec::new();
        let mut entries = fs::read_dir(&self.preset_dir)
            .await
            .map_err(StorageError::Io)?;

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            match fs::read_to_string(&path).await {
                Ok(content) => {
                    if let Ok(preset) = serde_json::from_str::<Preset>(&content) {
                        presets.push(PresetInfo {
                            name: preset.name,
                            preset_type: preset.preset_type,
                            description: preset.description,
                            created_at: preset.created_at,
                            updated_at: preset.updated_at,
                        });
                    }
                }
                Err(_) => continue,
            }
        }

        presets.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(presets)
    }

    /// Read a preset by name.
    pub async fn get(&self, name: &str) -> Result<Option<Preset>, StorageError> {
        self.validate_name(name)?;

        let path = self.get_path(name);

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path).await.map_err(StorageError::Io)?;
        let preset: Preset = serde_json::from_str(&content).map_err(StorageError::Serialization)?;

        Ok(Some(preset))
    }

    /// Save a preset.
    pub async fn save(&self, preset: &Preset) -> Result<(), StorageError> {
        self.validate_name(&preset.name)?;

        // Validate preset data based on type
        match preset.preset_type {
            PresetType::Full => {
                if preset.config.is_none() {
                    return Err(StorageError::InvalidPresetName(
                        "Full preset must include config data".to_string(),
                    ));
                }
            }
            PresetType::Locations => {
                if preset.locations.is_none() {
                    return Err(StorageError::InvalidPresetName(
                        "Locations preset must include location data".to_string(),
                    ));
                }
            }
        }

        let path = self.get_path(&preset.name);
        let content = serde_json::to_string_pretty(preset).map_err(StorageError::Serialization)?;

        fs::write(&path, content).await.map_err(StorageError::Io)?;

        Ok(())
    }

    /// Delete a preset.
    pub async fn delete(&self, name: &str) -> Result<(), StorageError> {
        self.validate_name(name)?;

        let path = self.get_path(name);

        if !path.exists() {
            return Err(StorageError::PresetNotFound(name.to_string()));
        }

        fs::remove_file(&path).await.map_err(StorageError::Io)?;

        Ok(())
    }

    /// Check if a preset exists.
    pub fn exists(&self, name: &str) -> bool {
        self.validate_name(name).is_ok() && self.get_path(name).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        AnchorConfig, AppConfig, DeviceConfig, GpsOrigin, LocationData, UwbConfig, WifiConfig,
    };

    fn create_test_storage() -> (PresetStorage, tempfile::TempDir) {
        let temp_dir = tempfile::tempdir().unwrap();
        let storage = PresetStorage::new(temp_dir.path().to_path_buf()).unwrap();
        (storage, temp_dir)
    }

    fn make_full_preset(name: &str) -> Preset {
        Preset {
            name: name.to_string(),
            description: Some("Test preset".to_string()),
            preset_type: PresetType::Full,
            config: Some(DeviceConfig {
                wifi: WifiConfig {
                    mode: 1,
                    ssid_a_p: None,
                    pswd_a_p: None,
                    ssid_s_t: Some("Test".to_string()),
                    pswd_s_t: None,
                    gcs_ip: None,
                    udp_port: None,
                    enable_web_server: None,
                    enable_discovery: None,
                    discovery_port: None,
                    log_udp_port: None,
                    log_serial_enabled: None,
                    log_udp_enabled: None,
                },
                uwb: UwbConfig {
                    mode: 4,
                    dev_short_addr: "1".to_string(),
                    anchor_count: None,
                    anchors: None,
                    origin_lat: None,
                    origin_lon: None,
                    origin_alt: None,
                    mavlink_target_system_id: None,
                    rotation_degrees: None,
                    z_calc_mode: None,
                    rf_forward_enable: None,
                    rf_forward_sensor_id: None,
                    rf_forward_orientation: None,
                    rf_forward_preserve_src_ids: None,
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
                },
                app: AppConfig {
                    led2_pin: None,
                    led2_state: None,
                },
            }),
            locations: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    fn make_location_preset(name: &str) -> Preset {
        Preset {
            name: name.to_string(),
            description: None,
            preset_type: PresetType::Locations,
            config: None,
            locations: Some(LocationData {
                origin: GpsOrigin {
                    lat: 41.4036,
                    lon: 2.1744,
                    alt: 100.0,
                },
                rotation: 0.0,
                anchors: vec![AnchorConfig {
                    id: "0".to_string(),
                    x: 0.0,
                    y: 0.0,
                    z: 1.5,
                }],
            }),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn test_save_and_read() {
        let (storage, _tmp) = create_test_storage();
        let preset = make_full_preset("test-full");

        storage.save(&preset).await.unwrap();

        let loaded = storage.get("test-full").await.unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "test-full");
        assert_eq!(loaded.preset_type, PresetType::Full);
    }

    #[tokio::test]
    async fn test_list() {
        let (storage, _tmp) = create_test_storage();

        storage.save(&make_full_preset("alpha")).await.unwrap();
        storage.save(&make_location_preset("beta")).await.unwrap();

        let presets = storage.list().await.unwrap();
        assert_eq!(presets.len(), 2);
        assert_eq!(presets[0].name, "alpha");
        assert_eq!(presets[1].name, "beta");
    }

    #[tokio::test]
    async fn test_delete() {
        let (storage, _tmp) = create_test_storage();

        storage.save(&make_full_preset("to-delete")).await.unwrap();
        assert!(storage.get("to-delete").await.unwrap().is_some());

        storage.delete("to-delete").await.unwrap();
        assert!(storage.get("to-delete").await.unwrap().is_none());
    }

    #[test]
    fn test_validate_name() {
        let (storage, _tmp) = create_test_storage();

        assert!(storage.validate_name("valid-name").is_ok());
        assert!(storage.validate_name("my_preset_1").is_ok());
        assert!(storage.validate_name("").is_err());
        assert!(storage.validate_name("../etc/passwd").is_err());
        assert!(storage.validate_name("name with spaces").is_err());
    }
}
