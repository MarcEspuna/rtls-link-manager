//! Unified preset storage service (Tauri wrapper).
//!
//! Thin wrapper around core's PresetStorage that gets the path from Tauri's AppHandle.

use crate::error::AppError;
use crate::types::{Preset, PresetInfo};
use rtls_link_core::storage::PresetStorage as CorePresetStorage;
use tauri::{AppHandle, Manager};

/// Service for managing unified presets.
pub struct PresetStorageService {
    inner: CorePresetStorage,
}

impl PresetStorageService {
    /// Create a new PresetStorageService.
    pub fn new(app_handle: &AppHandle) -> Result<Self, AppError> {
        let preset_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data dir: {}", e)))?
            .join("presets");

        println!("Preset storage directory: {:?}", preset_dir);

        let inner = CorePresetStorage::new(preset_dir)
            .map_err(|e| AppError::Io(e.to_string()))?;

        Ok(Self { inner })
    }

    /// List all saved presets.
    pub async fn list(&self) -> Result<Vec<PresetInfo>, AppError> {
        self.inner.list().await.map_err(|e| e.into())
    }

    /// Read a preset by name.
    pub async fn read(&self, name: &str) -> Result<Option<Preset>, AppError> {
        self.inner.get(name).await.map_err(|e| e.into())
    }

    /// Save a preset.
    pub async fn save(&self, preset: Preset) -> Result<bool, AppError> {
        self.inner.save(&preset).await.map_err(|e| AppError::from(e))?;
        Ok(true)
    }

    /// Delete a preset.
    pub async fn delete(&self, name: &str) -> Result<bool, AppError> {
        self.inner.delete(name).await.map_err(|e| AppError::from(e))?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use crate::types::{
        AnchorConfig, AppConfig, DeviceConfig, GpsOrigin, LocationData, PresetType, UwbConfig,
        WifiConfig,
    };
    use rtls_link_core::storage::PresetStorage as CorePresetStorage;

    fn create_test_service() -> (CorePresetStorage, tempfile::TempDir) {
        let temp_dir = tempfile::tempdir().unwrap();
        let service = CorePresetStorage::new(temp_dir.path().to_path_buf()).unwrap();
        (service, temp_dir)
    }

    fn create_test_full_preset(name: &str) -> crate::types::Preset {
        crate::types::Preset {
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
                    channel: None,
                    dw_mode: None,
                    tx_power_level: None,
                    smart_power_enable: None,
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

    fn create_test_location_preset(name: &str) -> crate::types::Preset {
        crate::types::Preset {
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

        service.save(&preset).await.unwrap();

        let loaded = service.get("test-full").await.unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "test-full");
        assert_eq!(loaded.preset_type, PresetType::Full);
    }

    #[tokio::test]
    async fn test_save_and_read_location_preset() {
        let (service, _temp_dir) = create_test_service();
        let preset = create_test_location_preset("test-location");

        service.save(&preset).await.unwrap();

        let loaded = service.get("test-location").await.unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "test-location");
        assert_eq!(loaded.preset_type, PresetType::Locations);
        assert_eq!(loaded.locations.unwrap().anchors.len(), 2);
    }

    #[tokio::test]
    async fn test_list_presets() {
        let (service, _temp_dir) = create_test_service();

        service.save(&create_test_full_preset("alpha-full")).await.unwrap();
        service.save(&create_test_location_preset("beta-loc")).await.unwrap();

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

        service.save(&preset).await.unwrap();
        assert!(service.get("to-delete").await.unwrap().is_some());

        service.delete("to-delete").await.unwrap();
        assert!(service.get("to-delete").await.unwrap().is_none());
    }
}
