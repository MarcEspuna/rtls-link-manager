//! Configuration-related Tauri commands.

use crate::config_storage::ConfigStorageService;
use crate::error::AppError;
use crate::types::{DeviceConfig, LocalConfig, LocalConfigInfo};
use std::sync::Arc;
use tauri::State;

/// List all saved configurations.
#[tauri::command]
pub async fn list_configs(
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<Vec<LocalConfigInfo>, AppError> {
    config_service.list().await
}

/// Get a specific configuration by name.
#[tauri::command]
pub async fn get_config(
    name: String,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<Option<LocalConfig>, AppError> {
    config_service.read(&name).await
}

/// Save a configuration.
#[tauri::command]
pub async fn save_config(
    name: String,
    config: DeviceConfig,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<bool, AppError> {
    config_service.save(&name, config).await
}

/// Delete a configuration.
#[tauri::command]
pub async fn delete_config(
    name: String,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<bool, AppError> {
    config_service.delete(&name).await
}

#[cfg(test)]
mod tests {
    // Command tests require Tauri runtime mock
    // These are tested via integration tests instead
}
