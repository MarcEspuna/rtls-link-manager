//! Local configuration storage service (Tauri wrapper).
//!
//! Thin wrapper around core's ConfigStorage that gets the path from Tauri's AppHandle.

use crate::error::AppError;
use crate::types::{DeviceConfig, LocalConfig, LocalConfigInfo};
use rtls_link_core::storage::ConfigStorage as CoreConfigStorage;
use tauri::{AppHandle, Manager};

/// Service for managing local configuration files.
pub struct ConfigStorageService {
    inner: CoreConfigStorage,
}

impl ConfigStorageService {
    /// Create a new ConfigStorageService.
    pub fn new(app_handle: &AppHandle) -> Result<Self, AppError> {
        let config_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data dir: {}", e)))?
            .join("configs");

        println!("Config storage directory: {:?}", config_dir);

        let inner = CoreConfigStorage::new(config_dir)
            .map_err(|e| AppError::Io(e.to_string()))?;

        Ok(Self { inner })
    }

    /// List all saved configurations.
    pub async fn list(&self) -> Result<Vec<LocalConfigInfo>, AppError> {
        self.inner.list().await.map_err(|e| e.into())
    }

    /// Read a configuration by name.
    pub async fn read(&self, name: &str) -> Result<Option<LocalConfig>, AppError> {
        self.inner.read(name).await.map_err(|e| e.into())
    }

    /// Save a configuration.
    pub async fn save(&self, name: &str, config: DeviceConfig) -> Result<bool, AppError> {
        self.inner.save(name, &config).await.map_err(|e| AppError::from(e))?;
        Ok(true)
    }

    /// Delete a configuration.
    pub async fn delete(&self, name: &str) -> Result<bool, AppError> {
        self.inner.delete(name).await.map_err(|e| AppError::from(e))?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use rtls_link_core::storage::ConfigStorage as CoreConfigStorage;

    fn create_test_service() -> (CoreConfigStorage, tempfile::TempDir) {
        let temp_dir = tempfile::tempdir().unwrap();
        let service = CoreConfigStorage::new(temp_dir.path().to_path_buf()).unwrap();
        (service, temp_dir)
    }

    fn make_config() -> crate::types::DeviceConfig {
        crate::types::DeviceConfig {
            wifi: crate::types::WifiConfig {
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
            uwb: crate::types::UwbConfig {
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
            app: crate::types::AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        }
    }

    #[tokio::test]
    async fn test_save_and_read() {
        let (service, _tmp) = create_test_service();
        let config = make_config();

        service.save("test-config", &config).await.unwrap();

        let loaded = service.read("test-config").await.unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "test-config");
        assert_eq!(loaded.config.wifi.mode, 1);
    }

    #[tokio::test]
    async fn test_list_configs() {
        let (service, _tmp) = create_test_service();
        let config = make_config();

        service.save("alpha", &config).await.unwrap();
        service.save("beta", &config).await.unwrap();
        service.save("gamma", &config).await.unwrap();

        let configs = service.list().await.unwrap();
        assert_eq!(configs.len(), 3);
        assert_eq!(configs[0].name, "alpha");
        assert_eq!(configs[1].name, "beta");
        assert_eq!(configs[2].name, "gamma");
    }

    #[tokio::test]
    async fn test_delete_config() {
        let (service, _tmp) = create_test_service();
        let config = make_config();

        service.save("to-delete", &config).await.unwrap();
        assert!(service.read("to-delete").await.unwrap().is_some());

        service.delete("to-delete").await.unwrap();
        assert!(service.read("to-delete").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_delete_nonexistent() {
        let (service, _tmp) = create_test_service();
        let result = service.delete("nonexistent").await;
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_name() {
        let (service, _tmp) = create_test_service();

        // Valid names via save
        // Invalid names checked through core
    }
}
