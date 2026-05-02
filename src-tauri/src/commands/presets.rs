//! Preset-related Tauri commands.

use crate::error::AppError;
use crate::preset_storage::PresetStorageService;
use crate::types::{GpsOrigin, LocationData, Preset, PresetInfo, PresetType};
use rtls_link_core::device::websocket::send_command_parsed;
use rtls_link_core::protocol::commands::Commands;
use rtls_link_core::protocol::config_params::device_config_from_backup_value;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

/// List all saved presets.
#[tauri::command]
pub async fn list_presets(
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<Vec<PresetInfo>, AppError> {
    preset_service.list().await
}

/// Get a specific preset by name.
#[tauri::command]
pub async fn get_preset(
    name: String,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<Option<Preset>, AppError> {
    preset_service.read(&name).await
}

/// Save a preset.
#[tauri::command]
pub async fn save_preset(
    preset: Preset,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<bool, AppError> {
    preset_service.save(preset).await
}

/// Delete a preset.
#[tauri::command]
pub async fn delete_preset(
    name: String,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<bool, AppError> {
    preset_service.delete(&name).await
}

/// Backup current config from a device and save it as a preset.
#[tauri::command]
pub async fn backup_device_preset(
    ip: String,
    name: String,
    description: Option<String>,
    preset_type: PresetType,
    timeout_ms: Option<u64>,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<bool, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    let response = send_command_parsed(&ip, Commands::backup_config(), timeout)
        .await
        .map_err(AppError::from)?;
    let json = response
        .json
        .ok_or_else(|| AppError::Json("No JSON found in backup-config response".to_string()))?;
    let config = device_config_from_backup_value(json).map_err(AppError::from)?;
    let now = chrono::Utc::now().to_rfc3339();

    let preset = match preset_type {
        PresetType::Full => Preset {
            name,
            description,
            preset_type: PresetType::Full,
            config: Some(config),
            locations: None,
            created_at: now.clone(),
            updated_at: now,
        },
        PresetType::Locations => {
            let locations = LocationData {
                origin: GpsOrigin {
                    lat: config.uwb.origin_lat.unwrap_or(0.0),
                    lon: config.uwb.origin_lon.unwrap_or(0.0),
                    alt: config.uwb.origin_alt.unwrap_or(0.0),
                },
                rotation: config.uwb.rotation_degrees.unwrap_or(0.0),
                anchors: config.uwb.anchors.unwrap_or_default(),
            };
            Preset {
                name,
                description,
                preset_type: PresetType::Locations,
                config: None,
                locations: Some(locations),
                created_at: now.clone(),
                updated_at: now,
            }
        }
    };

    preset_service.save(preset).await
}
