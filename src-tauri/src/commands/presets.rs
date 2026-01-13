//! Preset-related Tauri commands.

use crate::preset_storage::PresetStorageService;
use crate::types::{Preset, PresetInfo};
use std::sync::Arc;
use tauri::State;

/// List all saved presets.
#[tauri::command]
pub async fn list_presets(
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<Vec<PresetInfo>, String> {
    preset_service.list().await.map_err(|e| e.to_string())
}

/// Get a specific preset by name.
#[tauri::command]
pub async fn get_preset(
    name: String,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<Option<Preset>, String> {
    preset_service.read(&name).await.map_err(|e| e.to_string())
}

/// Save a preset.
#[tauri::command]
pub async fn save_preset(
    preset: Preset,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<bool, String> {
    preset_service.save(preset).await.map_err(|e| e.to_string())
}

/// Delete a preset.
#[tauri::command]
pub async fn delete_preset(
    name: String,
    preset_service: State<'_, Arc<PresetStorageService>>,
) -> Result<bool, String> {
    preset_service
        .delete(&name)
        .await
        .map_err(|e| e.to_string())
}
