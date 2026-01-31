//! Storage services for presets and configurations.

pub mod config;
pub mod preset;

pub use config::ConfigStorage;
pub use preset::PresetStorage;

/// Get the default data directory for RTLS-Link tools.
///
/// Uses the `directories` crate to find the appropriate platform-specific
/// data directory.
pub fn default_data_dir() -> Option<std::path::PathBuf> {
    directories::ProjectDirs::from("", "rtls-link", "rtls-link-manager")
        .map(|dirs| dirs.data_dir().to_path_buf())
}
