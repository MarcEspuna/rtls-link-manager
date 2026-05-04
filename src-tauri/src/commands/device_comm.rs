//! Device communication commands.
//!
//! Provides Tauri commands for sending WebSocket commands to devices
//! and uploading firmware via OTA. This routes all device communication
//! through the Rust backend instead of direct browser connections.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use crate::error::AppError;
use crate::state::AppState;
use crate::types::{DeviceConfig, Preset, PresetType};
use rtls_link_core::calibration::{calibrate_anchors, AnchorCalibrationConfig, CalibrationRun};
use rtls_link_core::device::ota::{
    upload_firmware_bulk_with_cancel, upload_firmware_with_progress_and_cancel, OtaProgressHandler,
};
use rtls_link_core::device::websocket::{
    send_command_parsed, send_commands_parsed, DeviceCommandResponse, DeviceConnection,
};
use rtls_link_core::protocol::commands::Commands;
use rtls_link_core::protocol::config_params::{config_to_params, location_to_params};
use tauri::{AppHandle, Emitter, State};

/// Progress handler that emits Tauri events for OTA progress tracking.
struct TauriOtaProgress {
    app_handle: AppHandle,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceOperationResult {
    pub ip: String,
    pub success: bool,
    pub error: Option<String>,
}

fn emit_operation_progress(
    app_handle: &AppHandle,
    operation_id: &str,
    completed: usize,
    total: usize,
    ip: Option<&str>,
    success: Option<bool>,
    error: Option<&str>,
) {
    let _ = app_handle.emit(
        "device-operation-progress",
        serde_json::json!({
            "operationId": operation_id,
            "completed": completed,
            "total": total,
            "ip": ip,
            "success": success,
            "error": error,
        }),
    );
}

async fn run_device_batches(
    ips: Vec<String>,
    command_batches: Vec<Vec<String>>,
    timeout: Duration,
    concurrency: usize,
    operation_id: String,
    app_handle: AppHandle,
) -> Vec<DeviceOperationResult> {
    let total = ips.len();
    let mut completed = 0usize;
    let mut results = Vec::with_capacity(total);
    let concurrency = concurrency.max(1);

    let work: Vec<(String, Vec<String>)> = ips.into_iter().zip(command_batches).collect();

    for chunk in work.chunks(concurrency) {
        let mut join_set = tokio::task::JoinSet::new();
        let mut task_ips = HashMap::new();
        for (ip, commands) in chunk.iter().cloned() {
            let ip_for_error = ip.clone();
            let handle = join_set.spawn(async move {
                let result = send_commands_parsed(&ip, &commands, timeout).await;
                (ip, result)
            });
            task_ips.insert(handle.id(), ip_for_error);
        }

        while let Some(joined) = join_set.join_next_with_id().await {
            let (ip, result) = match joined {
                Ok((id, v)) => {
                    task_ips.remove(&id);
                    v
                }
                Err(e) => {
                    completed += 1;
                    let ip = task_ips
                        .remove(&e.id())
                        .unwrap_or_else(|| "unknown".to_string());
                    let message = e.to_string();
                    emit_operation_progress(
                        &app_handle,
                        &operation_id,
                        completed,
                        total,
                        Some(&ip),
                        Some(false),
                        Some(&message),
                    );
                    results.push(DeviceOperationResult {
                        ip,
                        success: false,
                        error: Some(message),
                    });
                    continue;
                }
            };

            completed += 1;
            let success = result.is_ok();
            let error = result.err().map(|e| e.to_string());
            emit_operation_progress(
                &app_handle,
                &operation_id,
                completed,
                total,
                Some(&ip),
                Some(success),
                error.as_deref(),
            );
            results.push(DeviceOperationResult { ip, success, error });
        }
    }

    results
}

fn write_commands_from_params(params: Vec<(String, String, String)>) -> Vec<String> {
    params
        .into_iter()
        .map(|(group, name, value)| Commands::write_param(&group, &name, &value))
        .collect()
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

/// Execute one raw command on multiple devices with backend-owned concurrency.
#[tauri::command]
pub async fn run_bulk_device_command(
    ips: Vec<String>,
    command: String,
    timeout_ms: Option<u64>,
    concurrency: Option<usize>,
    operation_id: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<DeviceOperationResult>, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    let operation_id = operation_id.unwrap_or_else(|| "bulk-command".to_string());
    let command_batches = ips.iter().map(|_| vec![command.clone()]).collect();
    Ok(run_device_batches(
        ips,
        command_batches,
        timeout,
        concurrency.unwrap_or(5),
        operation_id,
        app_handle,
    )
    .await)
}

/// Apply a full config to multiple devices and save it as a named device config.
#[tauri::command]
pub async fn apply_config_to_devices(
    ips: Vec<String>,
    config: DeviceConfig,
    config_name: String,
    timeout_ms: Option<u64>,
    concurrency: Option<usize>,
    operation_id: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<DeviceOperationResult>, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(3000));
    let operation_id = operation_id.unwrap_or_else(|| "apply-config".to_string());
    let mut base_commands = write_commands_from_params(config_to_params(&config));
    base_commands.push(Commands::save_config_as(&config_name));
    let command_batches = ips.iter().map(|_| base_commands.clone()).collect();

    Ok(run_device_batches(
        ips,
        command_batches,
        timeout,
        concurrency.unwrap_or(3),
        operation_id,
        app_handle,
    )
    .await)
}

/// Activate a named config on multiple devices.
#[tauri::command]
pub async fn activate_config_on_devices(
    ips: Vec<String>,
    config_name: String,
    timeout_ms: Option<u64>,
    concurrency: Option<usize>,
    operation_id: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<DeviceOperationResult>, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000));
    let operation_id = operation_id.unwrap_or_else(|| "activate-config".to_string());
    let command = Commands::load_config_named(&config_name);
    let command_batches = ips.iter().map(|_| vec![command.clone()]).collect();

    Ok(run_device_batches(
        ips,
        command_batches,
        timeout,
        concurrency.unwrap_or(5),
        operation_id,
        app_handle,
    )
    .await)
}

/// Upload a preset to multiple devices.
#[tauri::command]
pub async fn upload_preset_to_devices(
    ips: Vec<String>,
    preset: Preset,
    timeout_ms: Option<u64>,
    concurrency: Option<usize>,
    operation_id: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<DeviceOperationResult>, AppError> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(3000));
    let operation_id = operation_id.unwrap_or_else(|| "upload-preset".to_string());
    let commands = match preset.preset_type {
        PresetType::Full => {
            let config = preset.config.as_ref().ok_or_else(|| {
                AppError::Json("Full preset must include config data".to_string())
            })?;
            let mut commands = write_commands_from_params(config_to_params(config));
            commands.push(Commands::save_config_as(&preset.name));
            commands
        }
        PresetType::Locations => {
            let locations = preset.locations.as_ref().ok_or_else(|| {
                AppError::Json("Location preset must include location data".to_string())
            })?;
            let mut commands = write_commands_from_params(location_to_params(locations));
            commands.push(Commands::save_config().to_string());
            commands
        }
    };
    let command_batches = ips.iter().map(|_| commands.clone()).collect();

    Ok(run_device_batches(
        ips,
        command_batches,
        timeout,
        concurrency.unwrap_or(3),
        operation_id,
        app_handle,
    )
    .await)
}

/// Run antenna calibration through the shared Rust core workflow.
#[tauri::command]
pub async fn run_antenna_calibration(
    config: AnchorCalibrationConfig,
    app_handle: AppHandle,
) -> Result<CalibrationRun, AppError> {
    let result = calibrate_anchors(config, |event| {
        let _ = app_handle.emit("antenna-calibration-event", &event);
    })
    .await
    .map_err(AppError::from)?;
    Ok(result)
}

/// Upload firmware from a file path to a single device.
#[tauri::command]
pub async fn upload_firmware_from_file(
    ip: String,
    file_path: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
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
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .ota_cancellations
        .write()
        .await
        .insert(ip.clone(), cancel.clone());

    let result =
        upload_firmware_with_progress_and_cancel(&ip, data, filename, &progress, cancel).await;
    state.ota_cancellations.write().await.remove(&ip);

    if let Err(error) = result {
        progress.on_error(&ip, &error.to_string());
        return Err(AppError::from(error));
    }

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
    state: State<'_, AppState>,
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
    let concurrency = concurrency.unwrap_or(1).max(1);
    let mut cancel_flags = HashMap::new();
    {
        let mut active_cancellations = state.ota_cancellations.write().await;
        for ip in &ips {
            let cancel = Arc::new(AtomicBool::new(false));
            active_cancellations.insert(ip.clone(), cancel.clone());
            cancel_flags.insert(ip.clone(), cancel);
        }
    }

    let results = upload_firmware_bulk_with_cancel(
        &ips,
        data,
        filename,
        concurrency,
        &progress,
        cancel_flags,
    )
    .await;
    {
        let mut active_cancellations = state.ota_cancellations.write().await;
        for ip in &ips {
            active_cancellations.remove(ip);
        }
    }

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

/// Request cancellation for an active firmware upload.
#[tauri::command]
pub async fn cancel_firmware_upload(
    ip: String,
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let active_cancellations = state.ota_cancellations.read().await;
    if let Some(cancel) = active_cancellations.get(&ip) {
        cancel.store(true, Ordering::Relaxed);
        return Ok(true);
    }
    Ok(false)
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
