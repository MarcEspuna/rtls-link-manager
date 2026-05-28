//! TDoA anchor UDP telemetry commands.

use std::io::{self, Write};
use std::net::SocketAddr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use socket2::{Domain, Protocol, Socket, Type};
use tokio::net::UdpSocket;

use crate::cli::{
    AnchorTelemetryArgs, AnchorTelemetryCommands, AnchorTelemetryConfigureArgs,
    AnchorTelemetryListenArgs, RoleFilter,
};
use crate::device::discovery::{discover_devices, DiscoveryOptions, DISCOVERY_PORT};
use crate::error::CliError;
use crate::output::get_formatter;
use crate::types::{Device, DeviceRole};

use rtls_link_core::device::mavlink::DeviceConnection;
use rtls_link_core::protocol::binary::decode_command_frame;
use rtls_link_core::protocol::commands::Commands;

const MIN_INTERVAL_MS: u16 = 250;
const MAX_INTERVAL_MS: u16 = 60000;

pub async fn run_anchor_telemetry(
    args: AnchorTelemetryArgs,
    timeout: u64,
    json: bool,
    strict: bool,
) -> Result<(), CliError> {
    match args.command {
        AnchorTelemetryCommands::Configure(args) => {
            run_configure(args, Duration::from_millis(timeout), json, strict).await
        }
        AnchorTelemetryCommands::Listen(args) => run_listen(args, json).await,
    }
}

async fn run_configure(
    args: AnchorTelemetryConfigureArgs,
    timeout: Duration,
    json_output: bool,
    strict: bool,
) -> Result<(), CliError> {
    validate_configure_args(&args)?;

    let ips = resolve_targets(
        &args.target,
        args.filter_role.clone(),
        args.discovery_duration,
    )
    .await?;
    if ips.is_empty() {
        return Err(CliError::NoDevicesFound);
    }

    let commands = telemetry_config_commands(&args);
    let mut results = Vec::new();

    for ip in &ips {
        let result = apply_telemetry_config(ip, &commands, args.save, timeout).await;
        let success = result.is_ok();
        let message = match result {
            Ok(()) => "Telemetry configuration applied".to_string(),
            Err(e) => e.to_string(),
        };
        results.push((ip.clone(), success, message));
    }

    let formatter = get_formatter(json_output);
    println!("{}", formatter.format_bulk_results(&results));

    let failed_count = results.iter().filter(|(_, success, _)| !success).count();
    if strict && failed_count > 0 {
        return Err(CliError::PartialFailure {
            succeeded: results.len() - failed_count,
            failed: failed_count,
        });
    }

    Ok(())
}

fn validate_configure_args(args: &AnchorTelemetryConfigureArgs) -> Result<(), CliError> {
    if !args.enable && !args.disable && args.interval_ms.is_none() && args.port.is_none() {
        return Err(CliError::InvalidArgument(
            "Provide --enable, --disable, --interval-ms, or --port".to_string(),
        ));
    }

    if let Some(interval_ms) = args.interval_ms {
        if !(MIN_INTERVAL_MS..=MAX_INTERVAL_MS).contains(&interval_ms) {
            return Err(CliError::InvalidArgument(format!(
                "Telemetry interval must be in {}-{} ms",
                MIN_INTERVAL_MS, MAX_INTERVAL_MS
            )));
        }
    }

    if let Some(port) = args.port {
        if port == 0 {
            return Err(CliError::InvalidArgument(
                "Telemetry port must be in 1-65535".to_string(),
            ));
        }
    }

    Ok(())
}

fn telemetry_config_commands(args: &AnchorTelemetryConfigureArgs) -> Vec<String> {
    let mut commands = Vec::new();

    if args.enable || args.disable {
        commands.push(Commands::write_param(
            "uwb",
            "tdoaAnchorTelemetryEnable",
            if args.enable { "1" } else { "0" },
        ));
    }
    if let Some(interval_ms) = args.interval_ms {
        commands.push(Commands::write_param(
            "uwb",
            "tdoaAnchorTelemetryIntervalMs",
            &interval_ms.to_string(),
        ));
    }
    if let Some(port) = args.port {
        commands.push(Commands::write_param(
            "uwb",
            "tdoaAnchorTelemetryPort",
            &port.to_string(),
        ));
    }

    commands
}

async fn apply_telemetry_config(
    ip: &str,
    commands: &[String],
    save: bool,
    timeout: Duration,
) -> Result<(), CliError> {
    let mut conn = DeviceConnection::connect(ip, timeout).await?;

    for command in commands {
        conn.send_raw(command).await?;
    }

    if save {
        conn.send_raw(Commands::save_config()).await?;
    }

    Ok(())
}

async fn resolve_targets(
    target: &str,
    filter_role: Option<RoleFilter>,
    discovery_duration: u64,
) -> Result<Vec<String>, CliError> {
    if target.eq_ignore_ascii_case("all") {
        let options = DiscoveryOptions {
            port: DISCOVERY_PORT,
            duration: Duration::from_secs(discovery_duration),
        };
        let devices = discover_devices(options).await?;
        let filter = filter_role.unwrap_or(RoleFilter::AnchorTdoa);
        let devices = filter_devices_by_role(devices, Some(filter));
        return Ok(devices.into_iter().map(|d| d.ip).collect());
    }

    if target.contains(',') {
        return Ok(target
            .split(',')
            .map(str::trim)
            .filter(|ip| !ip.is_empty())
            .map(ToOwned::to_owned)
            .collect());
    }

    Ok(vec![target.to_string()])
}

fn filter_devices_by_role(devices: Vec<Device>, filter: Option<RoleFilter>) -> Vec<Device> {
    match filter {
        Some(RoleFilter::AnchorTdoa) => devices
            .into_iter()
            .filter(|d| d.role == DeviceRole::AnchorTdoa)
            .collect(),
        Some(RoleFilter::TagTdoa) => devices
            .into_iter()
            .filter(|d| d.role == DeviceRole::TagTdoa)
            .collect(),
        None => devices,
    }
}

async fn run_listen(args: AnchorTelemetryListenArgs, json_output: bool) -> Result<(), CliError> {
    if args.port == 0 {
        return Err(CliError::InvalidArgument(
            "Telemetry port must be in 1-65535".to_string(),
        ));
    }

    let socket = create_udp_socket(args.port)?;
    let socket = UdpSocket::from_std(socket.into())?;

    if !args.ndjson && !json_output {
        println!(
            "Listening for TDoA anchor telemetry on port {}{}",
            args.port,
            args.ip
                .as_ref()
                .map(|ip| format!(" from {}", ip))
                .unwrap_or_default()
        );
        println!("Press Ctrl+C to stop.\n");
    }

    let mut buf = vec![0u8; 4096];

    loop {
        let (len, addr) = socket.recv_from(&mut buf).await?;
        let ip = addr.ip().to_string();

        if let Some(ref filter_ip) = args.ip {
            if &ip != filter_ip {
                continue;
            }
        }

        let Ok(mut value) = decode_command_frame(&buf[..len], &ip) else {
            continue;
        };

        annotate_telemetry_value(&mut value, &ip);

        if args.ndjson || json_output {
            println!("{}", serde_json::to_string(&value).unwrap());
        } else {
            print_telemetry_summary(&ip, &value);
        }

        io::stdout().flush().ok();
    }
}

fn create_udp_socket(port: u16) -> Result<std::net::UdpSocket, std::io::Error> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;

    socket.set_reuse_address(true)?;

    #[cfg(unix)]
    socket.set_reuse_port(true)?;

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    socket.bind(&addr.into())?;
    socket.set_nonblocking(true)?;

    Ok(socket.into())
}

fn annotate_telemetry_value(value: &mut serde_json::Value, ip: &str) {
    if let serde_json::Value::Object(map) = value {
        map.insert("ip".to_string(), serde_json::json!(ip));
        map.insert("receivedAtMs".to_string(), serde_json::json!(now_unix_ms()));
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn print_telemetry_summary(ip: &str, value: &serde_json::Value) {
    let anchor_id = value["anchorId"].as_u64().unwrap_or(0);
    let state = value["state"].as_str().unwrap_or("unknown");
    let active_slots = value["activeSlots"].as_u64().unwrap_or(0);
    let slot = value["slot"].as_u64().unwrap_or(0);
    let tx_done = value["tx"]["done"].as_u64().unwrap_or(0);
    let tx_scheduled = value["tx"]["scheduled"].as_u64().unwrap_or(0);
    let stall_resets = value["sync"]["stallResets"].as_u64().unwrap_or(0);
    let sync_losses = value["sync"]["losses"].as_u64().unwrap_or(0);
    let irq_max = value["timing"]["irqToServiceMaxUs"].as_u64().unwrap_or(0);
    let slack_min = value["timing"]["slotSlackMinUs"].as_u64().unwrap_or(0);
    let missed = value["timing"]["missedDeadlineCount"].as_u64().unwrap_or(0);

    println!(
        "{} A{} state={} slots={} slot={} tx={}/{} stalls={} syncLosses={} irqMaxUs={} slackMinUs={} missed={}",
        ip,
        anchor_id,
        state,
        active_slots,
        slot,
        tx_done,
        tx_scheduled,
        stall_resets,
        sync_losses,
        irq_max,
        slack_min,
        missed
    );
}
