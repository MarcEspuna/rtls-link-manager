//! Configuration-related Tauri commands.

use crate::config_storage::ConfigStorageService;
use crate::types::{DeviceConfig, LocalConfig, LocalConfigInfo};
use std::sync::Arc;
use tauri::State;

/// List all saved configurations.
#[tauri::command]
pub async fn list_configs(
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<Vec<LocalConfigInfo>, String> {
    config_service.list().await.map_err(|e| e.to_string())
}

/// Get a specific configuration by name.
#[tauri::command]
pub async fn get_config(
    name: String,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<Option<LocalConfig>, String> {
    config_service.read(&name).await.map_err(|e| e.to_string())
}

/// Save a configuration.
#[tauri::command]
pub async fn save_config(
    name: String,
    config: DeviceConfig,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<bool, String> {
    config_service
        .save(&name, config)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a configuration.
#[tauri::command]
pub async fn delete_config(
    name: String,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<bool, String> {
    config_service
        .delete(&name)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    // Command tests require Tauri runtime mock
    // These are tested via integration tests instead
}
