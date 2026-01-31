//! Error types for RTLS-Link core.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Core error type for shared operations.
#[derive(Debug, Error)]
pub enum CoreError {
    #[error("Device error: {0}")]
    Device(#[from] DeviceError),

    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    #[error("Config error: {0}")]
    Config(#[from] ConfigError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

/// Device command errors
#[derive(Debug, Error)]
pub enum DeviceError {
    #[error("Device not found: {0}")]
    NotFound(String),

    #[error("Command failed on {ip}: {message}")]
    CommandFailed { ip: String, message: String },

    #[error("Invalid response from {ip}: {message}")]
    InvalidResponse { ip: String, message: String },

    #[error("Device {ip} is offline")]
    Offline { ip: String },

    #[error("OTA update failed on {ip}: {message}")]
    OtaFailed { ip: String, message: String },
}

/// Configuration errors
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Failed to parse config: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Invalid parameter: group={group}, name={name}")]
    InvalidParameter { group: String, name: String },

    #[error("Config not found: {0}")]
    NotFound(String),

    #[error("Invalid config file: {0}")]
    InvalidFile(String),
}

/// Storage errors
#[derive(Debug, Error)]
pub enum StorageError {
    #[error("Failed to access storage directory: {0}")]
    DirectoryAccess(String),

    #[error("Preset not found: {0}")]
    PresetNotFound(String),

    #[error("Invalid preset name: {0}")]
    InvalidPresetName(String),

    #[error("Invalid name: {0}")]
    InvalidName(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Serializable error for Tauri command responses.
///
/// This is a simplified error that can cross the Tauri IPC boundary.
#[derive(Debug, Error, Serialize, Deserialize)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("Invalid config name: {0}")]
    InvalidName(String),

    #[error("Config not found: {0}")]
    NotFound(String),

    #[error("JSON error: {0}")]
    Json(String),

    #[error("Discovery error: {0}")]
    Discovery(String),

    #[error("Device error: {0}")]
    Device(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Json(e.to_string())
    }
}

impl From<CoreError> for AppError {
    fn from(e: CoreError) -> Self {
        match e {
            CoreError::Device(de) => AppError::Device(de.to_string()),
            CoreError::Storage(se) => match se {
                StorageError::InvalidPresetName(msg) | StorageError::InvalidName(msg) => {
                    AppError::InvalidName(msg)
                }
                StorageError::PresetNotFound(msg) | StorageError::NotFound(msg) => {
                    AppError::NotFound(msg)
                }
                other => AppError::Io(other.to_string()),
            },
            CoreError::Config(ce) => AppError::Json(ce.to_string()),
            CoreError::Io(e) => AppError::Io(e.to_string()),
            CoreError::Other(msg) => AppError::Io(msg),
        }
    }
}

impl From<StorageError> for AppError {
    fn from(e: StorageError) -> Self {
        match e {
            StorageError::InvalidPresetName(msg) | StorageError::InvalidName(msg) => {
                AppError::InvalidName(msg)
            }
            StorageError::PresetNotFound(msg) | StorageError::NotFound(msg) => {
                AppError::NotFound(msg)
            }
            other => AppError::Io(other.to_string()),
        }
    }
}

/// Result type for core operations
pub type Result<T> = std::result::Result<T, CoreError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_display() {
        let err = AppError::InvalidName("../test".to_string());
        assert_eq!(format!("{}", err), "Invalid config name: ../test");
    }

    #[test]
    fn test_app_error_serialization() {
        let err = AppError::NotFound("my-config".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("NotFound"));
    }

    #[test]
    fn test_core_error_from_device_error() {
        let err = CoreError::Device(DeviceError::NotFound("192.168.1.1".to_string()));
        assert!(format!("{}", err).contains("Device not found"));
    }

    #[test]
    fn test_core_error_to_app_error() {
        let core_err = CoreError::Storage(StorageError::InvalidName("bad name".to_string()));
        let app_err: AppError = core_err.into();
        matches!(app_err, AppError::InvalidName(_));
    }
}
