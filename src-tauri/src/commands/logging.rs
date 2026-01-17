//! Logging-related Tauri commands.
//!
//! Commands for starting and stopping log streams from devices.

use crate::error::Error;
use crate::state::AppState;
use tauri::State;

/// Start streaming logs from a device
///
/// This adds the device IP to the active streams set, so incoming
/// log messages from this device will be forwarded to the frontend.
#[tauri::command]
pub async fn start_log_stream(
    device_ip: String,
    state: State<'_, AppState>,
) -> Result<(), Error> {
    let mut streams = state.log_streams.write().await;
    streams.active_streams.insert(device_ip.clone(), true);
    println!("Started log stream for device: {}", device_ip);
    Ok(())
}

/// Stop streaming logs from a device
///
/// Removes the device IP from the active streams set.
#[tauri::command]
pub async fn stop_log_stream(
    device_ip: String,
    state: State<'_, AppState>,
) -> Result<(), Error> {
    let mut streams = state.log_streams.write().await;
    streams.active_streams.remove(&device_ip);
    println!("Stopped log stream for device: {}", device_ip);
    Ok(())
}

/// Get list of devices currently being streamed
#[tauri::command]
pub async fn get_active_log_streams(
    state: State<'_, AppState>,
) -> Result<Vec<String>, Error> {
    let streams = state.log_streams.read().await;
    let active: Vec<String> = streams
        .active_streams
        .iter()
        .filter(|(_, &v)| v)
        .map(|(k, _)| k.clone())
        .collect();
    Ok(active)
}
