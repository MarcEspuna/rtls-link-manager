//! Preset-related Tauri commands.

use crate::error::AppError;
use crate::preset_storage::PresetStorageService;
use crate::types::{Preset, PresetInfo};
use std::sync::Arc;
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
