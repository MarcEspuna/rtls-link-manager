//! Logging-related Tauri commands.
//!
//! Commands for starting and stopping log streams from devices,
//! and for retrieving buffered logs.

use crate::error::AppError;
use crate::logging::service::LogMessage;
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
) -> Result<(), AppError> {
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
) -> Result<(), AppError> {
    let mut streams = state.log_streams.write().await;
    streams.active_streams.remove(&device_ip);
    println!("Stopped log stream for device: {}", device_ip);
    Ok(())
}

/// Get list of devices currently being streamed
#[tauri::command]
pub async fn get_active_log_streams(
    state: State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    let streams = state.log_streams.read().await;
    let active: Vec<String> = streams
        .active_streams
        .iter()
        .filter(|(_, &v)| v)
        .map(|(k, _)| k.clone())
        .collect();
    Ok(active)
}

/// Get buffered logs for a device
///
/// Returns all logs currently buffered for the specified device.
/// Logs are buffered even when the log terminal is not open.
#[tauri::command]
pub async fn get_buffered_logs(
    device_ip: String,
    state: State<'_, AppState>,
) -> Result<Vec<LogMessage>, AppError> {
    let streams = state.log_streams.read().await;
    let logs = streams.get_logs(&device_ip);
    println!("Retrieved {} buffered logs for device: {}", logs.len(), device_ip);
    Ok(logs)
}

/// Clear buffered logs for a device
///
/// Removes all buffered logs for the specified device.
#[tauri::command]
pub async fn clear_buffered_logs(
    device_ip: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut streams = state.log_streams.write().await;
    streams.clear_logs(&device_ip);
    println!("Cleared buffered logs for device: {}", device_ip);
    Ok(())
}
