//! UDP discovery for RTLS-Link devices.
//!
//! Thin wrapper around core's discovery service with CLI-specific types.

use std::time::Duration;

use rtls_link_core::discovery::service::{DiscoveryService, DISCOVERY_PORT as CORE_DISCOVERY_PORT};

use crate::error::CliError;
use crate::types::Device;

/// Default UDP discovery port
pub const DISCOVERY_PORT: u16 = CORE_DISCOVERY_PORT;

/// Discovery options
#[derive(Debug, Clone)]
pub struct DiscoveryOptions {
    /// Port to listen on
    pub port: u16,
    /// Discovery duration
    pub duration: Duration,
}

impl Default for DiscoveryOptions {
    fn default() -> Self {
        Self {
            port: DISCOVERY_PORT,
            duration: Duration::from_secs(5),
        }
    }
}

/// Discover devices on the network.
///
/// Delegates to core's `DiscoveryService::discover_once`.
pub async fn discover_devices(options: DiscoveryOptions) -> Result<Vec<Device>, CliError> {
    let devices = DiscoveryService::discover_once(options.port, options.duration)
        .await
        .map_err(|e| CliError::Other(format!("Discovery error: {}", e)))?;
    Ok(devices)
}

/// Watch for devices continuously, calling callback for each update.
pub async fn watch_devices<F>(options: DiscoveryOptions, on_update: F) -> Result<(), CliError>
where
    F: FnMut(&[Device]),
{
    let mut service = DiscoveryService::new(options.port)
        .await
        .map_err(|e| CliError::Other(format!("Discovery error: {}", e)))?;

    service
        .run(on_update)
        .await
        .map_err(|e| CliError::Other(format!("Discovery error: {}", e)))?;

    Ok(())
}
