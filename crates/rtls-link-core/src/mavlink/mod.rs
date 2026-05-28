pub mod params;

include!(concat!(env!("OUT_DIR"), "/mod.rs"));

pub use mavlink_core::*;
