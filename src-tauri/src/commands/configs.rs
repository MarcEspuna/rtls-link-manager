//! Configuration-related Tauri commands.

use crate::config_storage::ConfigStorageService;
use crate::error::AppError;
use crate::types::{DeviceConfig, LocalConfig, LocalConfigInfo};
use rtls_link_core::device::mavlink::send_command_parsed;
use rtls_link_core::protocol::commands::Commands;
use rtls_link_core::protocol::config_params::device_config_from_backup_value;
use std::sync::Arc;
use std::time::Duration;
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

/// Backup current config from a device and save it locally.
#[tauri::command]
pub async fn backup_device_config_to_local(
    ip: String,
    name: String,
    timeout_ms: Option<u64>,
    config_service: State<'_, Arc<ConfigStorageService>>,
) -> Result<bool, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    let response = send_command_parsed(&ip, Commands::backup_config(), timeout)
        .await
        .map_err(AppError::from)?;
    let json = response
        .json
        .ok_or_else(|| AppError::Json("No JSON found in backup-config response".to_string()))?;
    let config = device_config_from_backup_value(json).map_err(AppError::from)?;
    config_service.save(&name, config).await
}

#[cfg(test)]
mod tests {
    // Command tests require Tauri runtime mock
    // These are tested via integration tests instead
}
