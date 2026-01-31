//! RTLS Link Manager - Rust Backend
//!
//! This crate provides the Tauri backend for the RTLS Link Manager desktop application.
//! It handles UDP device discovery, local config storage, log streaming, and exposes
//! Tauri commands for the React frontend.

pub mod commands;
pub mod config_storage;
pub mod discovery;
pub mod error;
pub mod logging;
pub mod preset_storage;
pub mod state;
pub mod types;

use config_storage::ConfigStorageService;
use logging::service::{LogReceiverService, LOG_RECEIVER_PORT};
use preset_storage::PresetStorageService;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;

/// Run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize config storage service
            let config_service = ConfigStorageService::new(&app_handle)
                .expect("Failed to initialize config storage");

            // Initialize preset storage service
            let preset_service = PresetStorageService::new(&app_handle)
                .expect("Failed to initialize preset storage");

            // Setup app state
            let app_state = AppState::new();
            let devices_clone = app_state.devices.clone();
            let log_streams_clone = app_state.log_streams.clone();

            // Spawn discovery service
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                match discovery::DiscoveryService::new().await {
                    Ok(mut service) => {
                        if let Err(e) = service.run(devices_clone, app_handle_clone).await {
                            eprintln!("Discovery service error: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to start discovery service: {}", e);
                    }
                }
            });

            // Spawn log receiver service
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                match LogReceiverService::new(LOG_RECEIVER_PORT).await {
                    Ok(service) => {
                        if let Err(e) = service.run(log_streams_clone, app_handle_clone).await {
                            eprintln!("Log receiver service error: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to start log receiver service: {}", e);
                    }
                }
            });

            // Register managed state
            app.manage(app_state);
            app.manage(Arc::new(config_service));
            app.manage(Arc::new(preset_service));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::devices::get_devices,
            commands::devices::get_device,
            commands::devices::clear_devices,
            commands::configs::list_configs,
            commands::configs::get_config,
            commands::configs::save_config,
            commands::configs::delete_config,
            commands::presets::list_presets,
            commands::presets::get_preset,
            commands::presets::save_preset,
            commands::presets::delete_preset,
            commands::device_comm::send_device_command,
            commands::device_comm::send_device_commands,
            commands::device_comm::upload_firmware_from_file,
            commands::device_comm::upload_firmware_to_devices,
            commands::device_comm::get_firmware_info,
            commands::logging::start_log_stream,
            commands::logging::stop_log_stream,
            commands::logging::get_active_log_streams,
            commands::logging::get_buffered_logs,
            commands::logging::clear_buffered_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
