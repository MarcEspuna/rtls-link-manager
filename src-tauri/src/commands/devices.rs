//! Device-related Tauri commands.

use crate::state::AppState;
use crate::types::Device;
use tauri::State;

/// Get all discovered devices.
#[tauri::command]
pub async fn get_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let devices = state.devices.read().await;
    Ok(devices.values().cloned().collect())
}

/// Get a specific device by IP address.
#[tauri::command]
pub async fn get_device(ip: String, state: State<'_, AppState>) -> Result<Option<Device>, String> {
    let devices = state.devices.read().await;
    Ok(devices.get(&ip).cloned())
}

/// Clear all discovered devices.
#[tauri::command]
pub async fn clear_devices(state: State<'_, AppState>) -> Result<(), String> {
    let mut devices = state.devices.write().await;
    devices.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    // Command tests require Tauri runtime mock
    // These are tested via integration tests instead
}
