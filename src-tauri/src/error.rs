//! Error types for the RTLS Link Manager.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Application-level errors that can be returned from Tauri commands.
#[derive(Debug, Error, Serialize, Deserialize)]
pub enum AppError {
    /// IO operation failed
    #[error("IO error: {0}")]
    Io(String),

    /// Invalid configuration name (path traversal, invalid chars, etc.)
    #[error("Invalid config name: {0}")]
    InvalidName(String),

    /// Configuration not found
    #[error("Config not found: {0}")]
    NotFound(String),

    /// JSON serialization/deserialization failed
    #[error("JSON error: {0}")]
    Json(String),

    /// Discovery service error
    #[error("Discovery error: {0}")]
    Discovery(String),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = AppError::InvalidName("../test".to_string());
        assert_eq!(format!("{}", err), "Invalid config name: ../test");
    }

    #[test]
    fn test_error_serialization() {
        let err = AppError::NotFound("my-config".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("NotFound"));
    }
}
