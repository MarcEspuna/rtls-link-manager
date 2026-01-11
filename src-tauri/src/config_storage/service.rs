//! Local configuration storage service.
//!
//! This service provides file-based storage for device configurations
//! in the application data directory.

use crate::error::AppError;
use crate::types::{DeviceConfig, LocalConfig, LocalConfigInfo};
use regex::Regex;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::fs;

/// Regex for valid config names: alphanumeric, dash, underscore only
const CONFIG_NAME_PATTERN: &str = r"^[a-zA-Z0-9_-]+$";

/// Maximum config name length
const MAX_NAME_LENGTH: usize = 64;

/// Service for managing local configuration files.
pub struct ConfigStorageService {
    /// Directory where config files are stored
    config_dir: PathBuf,
    /// Compiled regex for name validation
    name_regex: Regex,
}

impl ConfigStorageService {
    /// Create a new ConfigStorageService.
    ///
    /// Initializes the config directory in the app data folder.
    pub fn new(app_handle: &AppHandle) -> Result<Self, AppError> {
        let config_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data dir: {}", e)))?
            .join("configs");

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&config_dir)?;

        println!("Config storage directory: {:?}", config_dir);

        Ok(Self {
            config_dir,
            name_regex: Regex::new(CONFIG_NAME_PATTERN).unwrap(),
        })
    }

    /// Validate a config name for security and format.
    ///
    /// Returns an error if the name contains path traversal characters,
    /// special characters, or exceeds the maximum length.
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

    /// Get the file path for a config name.
    fn get_config_path(&self, name: &str) -> PathBuf {
        self.config_dir.join(format!("{}.json", name))
    }

    /// List all saved configurations.
    pub async fn list(&self) -> Result<Vec<LocalConfigInfo>, AppError> {
        let mut configs = Vec::new();
        let mut entries = fs::read_dir(&self.config_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            // Only process .json files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            // Extract name from filename
            let name = match path.file_stem().and_then(|s| s.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            // Skip invalid names
            if self.validate_name(&name).is_err() {
                continue;
            }

            // Get file metadata for timestamps
            let metadata = fs::metadata(&path).await?;

            let created_at = metadata
                .created()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_default();

            let updated_at = metadata
                .modified()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_default();

            configs.push(LocalConfigInfo {
                name,
                created_at,
                updated_at,
            });
        }

        // Sort by name
        configs.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(configs)
    }

    /// Read a configuration by name.
    pub async fn read(&self, name: &str) -> Result<Option<LocalConfig>, AppError> {
        self.validate_name(name)?;

        let path = self.get_config_path(name);

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path).await?;
        let config: DeviceConfig = serde_json::from_str(&content)?;

        let metadata = fs::metadata(&path).await?;

        let created_at = metadata
            .created()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_default();

        let updated_at = metadata
            .modified()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_default();

        Ok(Some(LocalConfig {
            name: name.to_string(),
            created_at,
            updated_at,
            config,
        }))
    }

    /// Save a configuration.
    pub async fn save(&self, name: &str, config: DeviceConfig) -> Result<bool, AppError> {
        self.validate_name(name)?;

        let path = self.get_config_path(name);
        let content = serde_json::to_string_pretty(&config)?;

        fs::write(&path, content).await?;

        Ok(true)
    }

    /// Delete a configuration.
    pub async fn delete(&self, name: &str) -> Result<bool, AppError> {
        self.validate_name(name)?;

        let path = self.get_config_path(name);

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
    use tempfile::{tempdir, TempDir};

    /// Creates a test service with a temp directory.
    /// Returns both the service and the TempDir to keep the directory alive.
    fn create_test_service() -> (ConfigStorageService, TempDir) {
        let temp_dir = tempdir().unwrap();
        let config_dir = temp_dir.path().to_path_buf();
        std::fs::create_dir_all(&config_dir).unwrap();

        let service = ConfigStorageService {
            config_dir,
            name_regex: Regex::new(CONFIG_NAME_PATTERN).unwrap(),
        };

        (service, temp_dir)
    }

    #[test]
    fn test_validate_name_valid() {
        let (service, _temp_dir) = create_test_service();

        assert!(service.validate_name("my-config").is_ok());
        assert!(service.validate_name("my_config").is_ok());
        assert!(service.validate_name("MyConfig123").is_ok());
        assert!(service.validate_name("config-v1_final-2").is_ok());
    }

    #[test]
    fn test_validate_name_invalid() {
        let (service, _temp_dir) = create_test_service();

        // Path traversal attacks
        assert!(service.validate_name("../etc/passwd").is_err());
        assert!(service.validate_name("..\\windows\\system32").is_err());
        assert!(service.validate_name("config/../secret").is_err());

        // Special characters
        assert!(service.validate_name("config name").is_err());
        assert!(service.validate_name("config.json").is_err());
        assert!(service.validate_name("config/sub").is_err());
        assert!(service.validate_name("config;rm -rf").is_err());

        // Empty and too long
        assert!(service.validate_name("").is_err());
        assert!(service.validate_name(&"a".repeat(65)).is_err());
    }

    #[tokio::test]
    async fn test_save_and_read() {
        let (service, _temp_dir) = create_test_service();

        let config = DeviceConfig {
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
            },
            app: crate::types::AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        };

        // Save config
        let result = service.save("test-config", config.clone()).await;
        assert!(result.is_ok());
        assert!(result.unwrap());

        // Read it back
        let loaded = service.read("test-config").await.unwrap();
        assert!(loaded.is_some());

        let local_config = loaded.unwrap();
        assert_eq!(local_config.name, "test-config");
        assert_eq!(local_config.config.wifi.mode, 1);
        assert_eq!(local_config.config.uwb.mode, 4);
    }

    #[tokio::test]
    async fn test_list_configs() {
        let (service, _temp_dir) = create_test_service();

        let config = DeviceConfig {
            wifi: crate::types::WifiConfig {
                mode: 0,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: None,
                pswd_s_t: None,
                gcs_ip: None,
                udp_port: None,
                enable_web_server: None,
                enable_discovery: None,
                discovery_port: None,
            },
            uwb: crate::types::UwbConfig {
                mode: 0,
                dev_short_addr: "0".to_string(),
                anchor_count: None,
                anchors: None,
                origin_lat: None,
                origin_lon: None,
                origin_alt: None,
                mavlink_target_system_id: None,
                rotation_degrees: None,
                z_calc_mode: None,
            },
            app: crate::types::AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        };

        // Save multiple configs
        service.save("alpha", config.clone()).await.unwrap();
        service.save("beta", config.clone()).await.unwrap();
        service.save("gamma", config.clone()).await.unwrap();

        // List all
        let configs = service.list().await.unwrap();
        assert_eq!(configs.len(), 3);

        // Should be sorted alphabetically
        assert_eq!(configs[0].name, "alpha");
        assert_eq!(configs[1].name, "beta");
        assert_eq!(configs[2].name, "gamma");
    }

    #[tokio::test]
    async fn test_delete_config() {
        let (service, _temp_dir) = create_test_service();

        let config = DeviceConfig {
            wifi: crate::types::WifiConfig {
                mode: 0,
                ssid_a_p: None,
                pswd_a_p: None,
                ssid_s_t: None,
                pswd_s_t: None,
                gcs_ip: None,
                udp_port: None,
                enable_web_server: None,
                enable_discovery: None,
                discovery_port: None,
            },
            uwb: crate::types::UwbConfig {
                mode: 0,
                dev_short_addr: "0".to_string(),
                anchor_count: None,
                anchors: None,
                origin_lat: None,
                origin_lon: None,
                origin_alt: None,
                mavlink_target_system_id: None,
                rotation_degrees: None,
                z_calc_mode: None,
            },
            app: crate::types::AppConfig {
                led2_pin: None,
                led2_state: None,
            },
        };

        // Save and then delete
        service.save("to-delete", config).await.unwrap();
        assert!(service.read("to-delete").await.unwrap().is_some());

        service.delete("to-delete").await.unwrap();
        assert!(service.read("to-delete").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_delete_nonexistent() {
        let (service, _temp_dir) = create_test_service();

        let result = service.delete("nonexistent").await;
        assert!(result.is_err());
    }
}
