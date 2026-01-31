//! UDP device discovery module.
//!
//! Provides heartbeat parsing, device pruning, and a framework-agnostic discovery service.

pub mod heartbeat;
pub mod service;

pub use heartbeat::{parse_heartbeat, prune_stale_devices};
pub use service::DiscoveryService;
