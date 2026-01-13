//! Unified preset storage service.
//!
//! This service provides file-based storage for presets (both full configs
//! and location-only presets) in the application data directory.

use crate::error::AppError;
use crate::types::{Preset, PresetInfo, PresetType};
use regex::Regex;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::fs;

/// Regex for valid preset names: alphanumeric, dash, underscore only
const PRESET_NAME_PATTERN: &str = r"^[a-zA-Z0-9_-]+$";

/// Maximum preset name length
const MAX_NAME_LENGTH: usize = 64;

/// Service for managing unified presets.
pub struct PresetStorageService {
    /// Directory where preset files are stored
    preset_dir: PathBuf,
    /// Compiled regex for name validation
    name_regex: Regex,
}

impl PresetStorageService {
    /// Create a new PresetStorageService.
    ///
    /// Initializes the preset directory in the app data folder.
    pub fn new(app_handle: &AppHandle) -> Result<Self, AppError> {
        let preset_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data dir: {}", e)))?
            .join("presets");

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&preset_dir)?;

        println!("Preset storage directory: {:?}", preset_dir);

        Ok(Self {
            preset_dir,
            name_regex: Regex::new(PRESET_NAME_PATTERN).unwrap(),
        })
    }

    /// Validate a preset name for security and format.
    fn validate_name(&self, name: &str) -> Result<(), AppError> {
        if name.is_empty() {
            return Err(AppError::InvalidName("Name cannot be empty".to_string()));
        }

        if name.len() > MAX_NAME_LENGTH {
            return Err(AppError::InvalidName(format!(
                "Name exceeds maximum length of {} characters",
                MAX_NAME_LENGTH
            )));
        }

        if !self.name_regex.is_match(name) {
            return Err(AppError::InvalidName(format!(
                "Name '{}' contains invalid characters. Only alphanumeric, dash, and underscore allowed.",
                name
            )));
        }

        Ok(())
    }

    /// Get the file path for a preset name.
    fn get_preset_path(&self, name: &str) -> PathBuf {
        self.preset_dir.join(format!("{}.json", name))
    }

    /// List all saved presets.
    pub async fn list(&self) -> Result<Vec<PresetInfo>, AppError> {
        let mut presets = Vec::new();
        let mut entries = fs::read_dir(&self.preset_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            // Only process .json files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            // Read and parse preset to get metadata
            match fs::read_to_string(&path).await {
                Ok(content) => {
                    match serde_json::from_str::<Preset>(&content) {
                        Ok(preset) => {
                            presets.push(PresetInfo {
                                name: preset.name,
                                preset_type: preset.preset_type,
                                description: preset.description,
                                created_at: preset.created_at,
                                updated_at: preset.updated_at,
                            });
                        }
                        Err(_) => continue, // Skip invalid files
                    }
                }
                Err(_) => continue,
            }
        }

        // Sort by name
        presets.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(presets)
    }

    /// Read a preset by name.
    pub async fn read(&self, name: &str) -> Result<Option<Preset>, AppError> {
        self.validate_name(name)?;

        let path = self.get_preset_path(name);

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path).await?;
        let preset: Preset = serde_json::from_str(&content)?;

        Ok(Some(preset))
    }

    /// Save a preset.
    pub async fn save(&self, preset: Preset) -> Result<bool, AppError> {
        self.validate_name(&preset.name)?;

        // Validate preset data based on type
        match preset.preset_type {
            PresetType::Full => {
                if preset.config.is_none() {
                    return Err(AppError::InvalidName(
                        "Full preset must include config data".to_string(),
                    ));
                }
            }
            PresetType::Locations => {
                if preset.locations.is_none() {
                    return Err(AppError::InvalidName(
                        "Locations preset must include location data".to_string(),
                    ));
                }
            }
        }

        let path = self.get_preset_path(&preset.name);
        let content = serde_json::to_string_pretty(&preset)?;

        fs::write(&path, content).await?;

        Ok(true)
    }

    /// Delete a preset.
    pub async fn delete(&self, name: &str) -> Result<bool, AppError> {
        self.validate_name(name)?;

        let path = self.get_preset_path(name);

        if !path.exists() {
            return Err(AppError::NotFound(name.to_string()));
        }

        fs::remove_file(&path).await?;

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        AnchorConfig, AppConfig, DeviceConfig, GpsOrigin, LocationData, UwbConfig, WifiConfig,
    };
    use tempfile::{tempdir, TempDir};

    fn create_test_service() -> (PresetStorageService, TempDir) {
        let temp_dir = tempdir().unwrap();
        let preset_dir = temp_dir.path().to_path_buf();
        std::fs::create_dir_all(&preset_dir).unwrap();

        let service = PresetStorageService {
            preset_dir,
            name_regex: Regex::new(PRESET_NAME_PATTERN).unwrap(),
        };

        (service, temp_dir)
    }

    fn create_test_full_preset(name: &str) -> Preset {
        Preset {
            name: name.to_string(),
            description: Some("Test preset".to_string()),
            preset_type: PresetType::Full,
            config: Some(DeviceConfig {
                wifi: WifiConfig {
                    mode: 1,
                    ssid_a_p: None,
                    pswd_a_p: None,
                    ssid_s_t: Some("TestNetwork".to_string()),
                    pswd_s_t: Some("password".to_string()),
                    gcs_ip: None,
                    udp_port: None,
                    enable_web_server: None,
                    enable_discovery: None,
                    discovery_port: None,
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

    fn create_test_location_preset(name: &str) -> Preset {
        Preset {
            name: name.to_string(),
            description: Some("Location preset".to_string()),
            preset_type: PresetType::Locations,
            config: None,
            locations: Some(LocationData {
                origin: GpsOrigin {
                    lat: 41.4036,
                    lon: 2.1744,
                    alt: 100.0,
                },
                rotation: 0.0,
                anchors: vec![
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
                ],
            }),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn test_save_and_read_full_preset() {
        let (service, _temp_dir) = create_test_service();
        let preset = create_test_full_preset("test-full");

        let result = service.save(preset.clone()).await;
        assert!(result.is_ok());

        let loaded = service.read("test-full").await.unwrap();
        assert!(loaded.is_some());

        let loaded_preset = loaded.unwrap();
        assert_eq!(loaded_preset.name, "test-full");
        assert_eq!(loaded_preset.preset_type, PresetType::Full);
        assert!(loaded_preset.config.is_some());
    }

    #[tokio::test]
    async fn test_save_and_read_location_preset() {
        let (service, _temp_dir) = create_test_service();
        let preset = create_test_location_preset("test-location");

        let result = service.save(preset.clone()).await;
        assert!(result.is_ok());

        let loaded = service.read("test-location").await.unwrap();
        assert!(loaded.is_some());

        let loaded_preset = loaded.unwrap();
        assert_eq!(loaded_preset.name, "test-location");
        assert_eq!(loaded_preset.preset_type, PresetType::Locations);
        assert!(loaded_preset.locations.is_some());
        assert_eq!(loaded_preset.locations.unwrap().anchors.len(), 2);
    }

    #[tokio::test]
    async fn test_list_presets() {
        let (service, _temp_dir) = create_test_service();

        service
            .save(create_test_full_preset("alpha-full"))
            .await
            .unwrap();
        service
            .save(create_test_location_preset("beta-loc"))
            .await
            .unwrap();

        let presets = service.list().await.unwrap();
        assert_eq!(presets.len(), 2);
        assert_eq!(presets[0].name, "alpha-full");
        assert_eq!(presets[0].preset_type, PresetType::Full);
        assert_eq!(presets[1].name, "beta-loc");
        assert_eq!(presets[1].preset_type, PresetType::Locations);
    }

    #[tokio::test]
    async fn test_delete_preset() {
        let (service, _temp_dir) = create_test_service();
        let preset = create_test_full_preset("to-delete");

        service.save(preset).await.unwrap();
        assert!(service.read("to-delete").await.unwrap().is_some());

        service.delete("to-delete").await.unwrap();
        assert!(service.read("to-delete").await.unwrap().is_none());
    }
}
