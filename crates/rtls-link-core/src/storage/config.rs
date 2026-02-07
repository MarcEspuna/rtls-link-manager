//! Configuration storage service.
//!
//! Provides file-based storage for device configurations.

use crate::error::StorageError;
use crate::types::{DeviceConfig, LocalConfig, LocalConfigInfo};
use regex::Regex;
use std::path::PathBuf;
use tokio::fs;

/// Regex for valid config names: alphanumeric, dash, underscore only
const NAME_PATTERN: &str = r"^[a-zA-Z0-9_-]+$";

/// Maximum name length
const MAX_NAME_LENGTH: usize = 64;

/// Configuration storage service.
///
/// Takes a `PathBuf` in the constructor so each consumer (Tauri, CLI) can
/// provide the correct storage path.
pub struct ConfigStorage {
    config_dir: PathBuf,
    name_regex: Regex,
}

impl ConfigStorage {
    /// Create a new ConfigStorage with the given directory.
    pub fn new(dir: PathBuf) -> Result<Self, StorageError> {
        std::fs::create_dir_all(&dir).map_err(StorageError::Io)?;

        Ok(Self {
            config_dir: dir,
            name_regex: Regex::new(NAME_PATTERN).unwrap(),
        })
    }

    fn validate_name(&self, name: &str) -> Result<(), StorageError> {
        if name.is_empty() {
            return Err(StorageError::InvalidName(
                "Name cannot be empty".to_string(),
            ));
        }

        if name.len() > MAX_NAME_LENGTH {
            return Err(StorageError::InvalidName(format!(
                "Name exceeds maximum length of {} characters",
                MAX_NAME_LENGTH
            )));
        }

        if !self.name_regex.is_match(name) {
            return Err(StorageError::InvalidName(format!(
                "Name '{}' contains invalid characters. Only alphanumeric, dash, and underscore allowed.",
                name
            )));
        }

        Ok(())
    }

    fn get_path(&self, name: &str) -> PathBuf {
        self.config_dir.join(format!("{}.json", name))
    }

    /// List all saved configurations.
    pub async fn list(&self) -> Result<Vec<LocalConfigInfo>, StorageError> {
        let mut configs = Vec::new();
        let mut entries = fs::read_dir(&self.config_dir)
            .await
            .map_err(StorageError::Io)?;

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            let name = match path.file_stem().and_then(|s| s.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if self.validate_name(&name).is_err() {
                continue;
            }

            let metadata = fs::metadata(&path).await.map_err(StorageError::Io)?;

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

        configs.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(configs)
    }

    /// Read a configuration by name.
    pub async fn read(&self, name: &str) -> Result<Option<LocalConfig>, StorageError> {
        self.validate_name(name)?;

        let path = self.get_path(name);

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path).await.map_err(StorageError::Io)?;
        let config: DeviceConfig =
            serde_json::from_str(&content).map_err(StorageError::Serialization)?;

        let metadata = fs::metadata(&path).await.map_err(StorageError::Io)?;

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
    pub async fn save(&self, name: &str, config: &DeviceConfig) -> Result<(), StorageError> {
        self.validate_name(name)?;

        let path = self.get_path(name);
        let content = serde_json::to_string_pretty(config).map_err(StorageError::Serialization)?;

        fs::write(&path, content).await.map_err(StorageError::Io)?;

        Ok(())
    }

    /// Delete a configuration.
    pub async fn delete(&self, name: &str) -> Result<(), StorageError> {
        self.validate_name(name)?;

        let path = self.get_path(name);

        if !path.exists() {
            return Err(StorageError::NotFound(name.to_string()));
        }

        fs::remove_file(&path).await.map_err(StorageError::Io)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AppConfig, UwbConfig, WifiConfig};

    fn create_test_storage() -> (ConfigStorage, tempfile::TempDir) {
        let temp_dir = tempfile::tempdir().unwrap();
        let storage = ConfigStorage::new(temp_dir.path().to_path_buf()).unwrap();
        (storage, temp_dir)
    }

    fn make_config() -> DeviceConfig {
        DeviceConfig {
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
        }
    }

    #[tokio::test]
    async fn test_save_and_read() {
        let (storage, _tmp) = create_test_storage();
        let config = make_config();

        storage.save("test-config", &config).await.unwrap();

        let loaded = storage.read("test-config").await.unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "test-config");
        assert_eq!(loaded.config.wifi.mode, 1);
    }

    #[tokio::test]
    async fn test_list() {
        let (storage, _tmp) = create_test_storage();
        let config = make_config();

        storage.save("alpha", &config).await.unwrap();
        storage.save("beta", &config).await.unwrap();

        let configs = storage.list().await.unwrap();
        assert_eq!(configs.len(), 2);
        assert_eq!(configs[0].name, "alpha");
        assert_eq!(configs[1].name, "beta");
    }

    #[tokio::test]
    async fn test_delete() {
        let (storage, _tmp) = create_test_storage();
        let config = make_config();

        storage.save("to-delete", &config).await.unwrap();
        assert!(storage.read("to-delete").await.unwrap().is_some());

        storage.delete("to-delete").await.unwrap();
        assert!(storage.read("to-delete").await.unwrap().is_none());
    }

    #[test]
    fn test_validate_name() {
        let (storage, _tmp) = create_test_storage();

        assert!(storage.validate_name("valid-name").is_ok());
        assert!(storage.validate_name("").is_err());
        assert!(storage.validate_name("../etc").is_err());
        assert!(storage.validate_name(&"a".repeat(65)).is_err());
    }
}
