//! Device communication commands.
//!
//! Provides Tauri commands for sending WebSocket commands to devices
//! and uploading firmware via OTA. This routes all device communication
//! through the Rust backend instead of direct browser connections.

use std::path::PathBuf;
use std::time::Duration;

use rtls_link_core::device::ota::{upload_firmware, upload_firmware_bulk, OtaProgressHandler};
use rtls_link_core::device::websocket::send_command;
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
        let _ = self.app_handle.emit(
            "ota-complete",
            serde_json::json!({ "ip": ip }),
        );
    }

    fn on_error(&self, ip: &str, error: &str) {
        let _ = self.app_handle.emit(
            "ota-error",
            serde_json::json!({ "ip": ip, "error": error }),
        );
    }
}

/// Send a single command to a device and return the response.
#[tauri::command]
pub async fn send_device_command(
    ip: String,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    send_command(&ip, &command, timeout)
        .await
        .map_err(|e| e.to_string())
}

/// Send multiple commands to a device sequentially and return all responses.
#[tauri::command]
pub async fn send_device_commands(
    ip: String,
    commands: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<Vec<String>, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    let mut responses = Vec::new();

    for cmd in &commands {
        let response = send_command(&ip, cmd, timeout)
            .await
            .map_err(|e| e.to_string())?;
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
) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read firmware file: {}", e))?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("firmware.bin");

    let progress = TauriOtaProgress { app_handle };
    let total = data.len() as u64;

    progress.on_progress(&ip, 0, total);

    upload_firmware(&ip, data, filename)
        .await
        .map_err(|e| e.to_string())?;

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
) -> Result<Vec<serde_json::Value>, String> {
    let path = PathBuf::from(&file_path);

    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read firmware file: {}", e))?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("firmware.bin");

    let progress = TauriOtaProgress { app_handle };
    let concurrency = concurrency.unwrap_or(3);

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
) -> Result<serde_json::Value, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));

    let response = send_command(&ip, "firmware-info", timeout)
        .await
        .map_err(|e| e.to_string())?;

    // Parse JSON from response (may have prefix text)
    if let Some(start) = response.find('{') {
        serde_json::from_str(&response[start..])
            .map_err(|e| format!("Failed to parse firmware info: {}", e))
    } else {
        Err("No JSON found in firmware info response".to_string())
    }
}
