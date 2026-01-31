//! Device communication commands.
//!
//! Provides Tauri commands for sending WebSocket commands to devices
//! and uploading firmware via OTA. This routes all device communication
//! through the Rust backend instead of direct browser connections.

use std::path::PathBuf;
use std::time::Duration;

use crate::error::AppError;
use rtls_link_core::device::ota::{upload_firmware, upload_firmware_bulk, OtaProgressHandler};
use rtls_link_core::device::websocket::{
    send_command_parsed, DeviceCommandResponse, DeviceConnection,
};
use tauri::{AppHandle, Emitter};

/// Progress handler that emits Tauri events for OTA progress tracking.
struct TauriOtaProgress {
    app_handle: AppHandle,
}

impl OtaProgressHandler for TauriOtaProgress {
    fn on_progress(&self, ip: &str, bytes_sent: u64, total_bytes: u64) {
        let _ = self.app_handle.emit(
            "ota-progress",
            serde_json::json!({
                "ip": ip,
                "bytesSent": bytes_sent,
                "totalBytes": total_bytes,
            }),
        );
    }

    fn on_complete(&self, ip: &str) {
        let _ = self
            .app_handle
            .emit("ota-complete", serde_json::json!({ "ip": ip }));
    }

    fn on_error(&self, ip: &str, error: &str) {
        let _ = self
            .app_handle
            .emit("ota-error", serde_json::json!({ "ip": ip, "error": error }));
    }
}

/// Send a single command to a device and return the response.
#[tauri::command]
pub async fn send_device_command(
    ip: String,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<DeviceCommandResponse, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    send_command_parsed(&ip, &command, timeout)
        .await
        .map_err(AppError::from)
}

/// Send multiple commands to a device sequentially and return all responses.
#[tauri::command]
pub async fn send_device_commands(
    ip: String,
    commands: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<Vec<DeviceCommandResponse>, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    let mut responses = Vec::new();

    let mut conn = DeviceConnection::connect(&ip, timeout)
        .await
        .map_err(AppError::from)?;

    for (index, cmd) in commands.iter().enumerate() {
        let response = conn.send(cmd).await.map_err(|e| {
            let err = AppError::from(e);
            match err {
                AppError::Device(msg) => {
                    AppError::Device(format!("Command {} failed: {}", index + 1, msg))
                }
                AppError::Io(msg) => AppError::Io(format!("Command {} failed: {}", index + 1, msg)),
                AppError::InvalidName(msg) => {
                    AppError::InvalidName(format!("Command {} failed: {}", index + 1, msg))
                }
                AppError::NotFound(msg) => {
                    AppError::NotFound(format!("Command {} failed: {}", index + 1, msg))
                }
                AppError::Json(msg) => {
                    AppError::Json(format!("Command {} failed: {}", index + 1, msg))
                }
                AppError::Discovery(msg) => {
                    AppError::Discovery(format!("Command {} failed: {}", index + 1, msg))
                }
            }
        })?;

        responses.push(response);
    }

    Ok(responses)
}

/// Upload firmware from a file path to a single device.
#[tauri::command]
pub async fn upload_firmware_from_file(
    ip: String,
    file_path: String,
    app_handle: AppHandle,
) -> Result<(), AppError> {
    let path = PathBuf::from(&file_path);

    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| AppError::Io(format!("Failed to read firmware file: {}", e)))?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("firmware.bin");

    let progress = TauriOtaProgress { app_handle };
    let total = data.len() as u64;

    progress.on_progress(&ip, 0, total);

    upload_firmware(&ip, data, filename)
        .await
        .map_err(AppError::from)?;

    progress.on_complete(&ip);

    Ok(())
}

/// Upload firmware to multiple devices concurrently.
///
/// Returns per-device results as JSON array.
#[tauri::command]
pub async fn upload_firmware_to_devices(
    ips: Vec<String>,
    file_path: String,
    concurrency: Option<usize>,
    app_handle: AppHandle,
) -> Result<Vec<serde_json::Value>, AppError> {
    let path = PathBuf::from(&file_path);

    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| AppError::Io(format!("Failed to read firmware file: {}", e)))?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("firmware.bin");

    let progress = TauriOtaProgress { app_handle };
    let concurrency = concurrency.unwrap_or(3).max(1);

    let results = upload_firmware_bulk(&ips, data, filename, concurrency, &progress).await;

    let json_results: Vec<serde_json::Value> = results
        .into_iter()
        .map(|(ip, result)| {
            serde_json::json!({
                "ip": ip,
                "success": result.is_ok(),
                "error": result.err().map(|e| e.to_string()),
            })
        })
        .collect();

    Ok(json_results)
}

/// Get firmware info from a device.
#[tauri::command]
pub async fn get_firmware_info(
    ip: String,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));

    let response = send_command_parsed(&ip, "firmware-info", timeout)
        .await
        .map_err(AppError::from)?;
    response
        .json
        .ok_or_else(|| AppError::Json("No JSON found in firmware info response".to_string()))
}
