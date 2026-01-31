//! Error types for RTLS-Link CLI.
//!
//! CliError wraps CoreError from the shared library and adds CLI-specific variants.

use rtls_link_core::error::CoreError;
use thiserror::Error;

// Re-export core error types so command modules can use them via crate::error
pub use rtls_link_core::error::{ConfigError, DeviceError, StorageError};

/// Exit codes for the CLI
pub mod exit_codes {
    pub const SUCCESS: i32 = 0;
    pub const GENERAL_ERROR: i32 = 1;
    pub const NETWORK_ERROR: i32 = 2;
    pub const DEVICE_ERROR: i32 = 3;
    pub const INVALID_ARGS: i32 = 4;
    pub const PARTIAL_FAILURE: i32 = 5;
}

/// Main error type for the CLI
#[derive(Error, Debug)]
pub enum CliError {
    #[error("Core error: {0}")]
    Core(#[from] CoreError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Partial failure: {succeeded} succeeded, {failed} failed")]
    PartialFailure { succeeded: usize, failed: usize },

    #[error("No devices found")]
    NoDevicesFound,

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("{0}")]
    Other(String),
}

impl CliError {
    /// Get the exit code for this error
    pub fn exit_code(&self) -> i32 {
        match self {
            CliError::Core(e) => match e {
                CoreError::Device(_) => exit_codes::DEVICE_ERROR,
                CoreError::Storage(_) => exit_codes::GENERAL_ERROR,
                CoreError::Config(_) => exit_codes::GENERAL_ERROR,
                CoreError::Io(_) => exit_codes::GENERAL_ERROR,
                CoreError::Other(_) => exit_codes::GENERAL_ERROR,
            },
            CliError::Io(_) => exit_codes::GENERAL_ERROR,
            CliError::InvalidArgument(_) => exit_codes::INVALID_ARGS,
            CliError::PartialFailure { .. } => exit_codes::PARTIAL_FAILURE,
            CliError::NoDevicesFound => exit_codes::GENERAL_ERROR,
            CliError::Timeout(_) => exit_codes::NETWORK_ERROR,
            CliError::Other(_) => exit_codes::GENERAL_ERROR,
        }
    }
}

// Conversions from core error subtypes to CliError
impl From<DeviceError> for CliError {
    fn from(e: DeviceError) -> Self {
        CliError::Core(CoreError::Device(e))
    }
}

impl From<StorageError> for CliError {
    fn from(e: StorageError) -> Self {
        CliError::Core(CoreError::Storage(e))
    }
}

impl From<ConfigError> for CliError {
    fn from(e: ConfigError) -> Self {
        CliError::Core(CoreError::Config(e))
    }
}

// Clone implementation needed for bulk operations (firmware upload)
impl Clone for CliError {
    fn clone(&self) -> Self {
        match self {
            CliError::Core(e) => CliError::Other(format!("{}", e)),
            CliError::Io(e) => CliError::Other(format!("IO error: {}", e)),
            CliError::InvalidArgument(s) => CliError::InvalidArgument(s.clone()),
            CliError::PartialFailure { succeeded, failed } => CliError::PartialFailure {
                succeeded: *succeeded,
                failed: *failed,
            },
            CliError::NoDevicesFound => CliError::NoDevicesFound,
            CliError::Timeout(s) => CliError::Timeout(s.clone()),
            CliError::Other(s) => CliError::Other(s.clone()),
        }
    }
}

/// Result type for CLI operations
pub type Result<T> = std::result::Result<T, CliError>;
