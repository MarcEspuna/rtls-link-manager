//! Anchor antenna-delay calibration command.

use crate::cli::{CalibrateAnchorsArgs, CalibrateArgs, CalibrateCommands};
use crate::error::CliError;
use rtls_link_core::calibration::{calibrate_anchors, AnchorCalibrationConfig, CalibrationEvent};

pub async fn run_calibrate(
    args: CalibrateArgs,
    timeout_ms: u64,
    json: bool,
) -> Result<(), CliError> {
    match args.command {
        CalibrateCommands::Anchors(args) => run_calibrate_anchors(args, timeout_ms, json).await,
    }
}

async fn run_calibrate_anchors(
    args: CalibrateAnchorsArgs,
    timeout_ms: u64,
    json: bool,
) -> Result<(), CliError> {
    let config = AnchorCalibrationConfig {
        x: args.x,
        y: args.y,
        layout: args.layout.into(),
        ips: args.ips.map(|raw| {
            raw.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }),
        discovery_duration: args.discovery_duration,
        min_samples: args.min_samples,
        sample_duration: args.sample_duration,
        sample_interval_ms: args.sample_interval_ms,
        max_iters: args.max_iters,
        tolerance_m: args.tolerance_m,
        min_improvement_m: args.min_improvement_m,
        prior_sigma_ticks: args.prior_sigma_ticks,
        max_delta_ticks: args.max_delta_ticks,
        dry_run: args.dry_run,
        timeout_ms,
    };

    let result = calibrate_anchors(config, |event| {
        if json {
            return;
        }
        match event {
            CalibrationEvent::Log { message } => println!("{}", message),
            CalibrationEvent::Iteration { delays, error, .. } => {
                println!(
                    "  Delays: A0={} A1={} A2={} A3={}",
                    delays[0], delays[1], delays[2], delays[3]
                );
                println!(
                    "  Pair errors (m): {}",
                    error
                        .pair_errors
                        .iter()
                        .map(|e| format!("{}-{}:{:+.3}", e.a, e.b, e.error_m))
                        .collect::<Vec<_>>()
                        .join("  ")
                );
            }
            CalibrationEvent::Complete { .. } => {}
        }
    })
    .await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
    }

    Ok(())
}
