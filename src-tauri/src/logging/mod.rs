//! UDP log receiver service for RTLS-Link devices.
//!
//! This module provides a service that listens for JSON-formatted log messages
//! from devices over UDP and emits them to the frontend for display.

pub mod service;

pub use service::LogReceiverService;
