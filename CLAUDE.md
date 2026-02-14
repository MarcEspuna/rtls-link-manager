# RTLS-Link Manager - AI Agent Guide

## Project Overview

This is a Rust workspace with three crates for managing RTLS-Link UWB devices:

- **`rtls-link-core`** (`crates/rtls-link-core/`) - Shared library with all device communication (WebSocket), discovery (UDP), OTA, and storage logic.
- **`rtls-link-cli`** (`crates/rtls-link-cli/`) - CLI tool built on top of the core library.
- **`src-tauri/`** - Tauri desktop app backend that also uses the core library.
- **`src/`** - React frontend for the Tauri app.

## Building

```bash
# Build the CLI tool (release for best performance)
cargo build --release -p rtls-link-cli

# Run tests
cargo test -p rtls-link-core

# Binary location after build
./target/release/rtls-link-cli
```

## CLI Quick Reference

All commands support `--json` for machine-readable output and `--timeout <ms>` (default 5000).

### Device Discovery

Devices broadcast UDP heartbeats on port 3333. Discovery listens for these.

```bash
# Discover for 5 seconds (default), table output
rtls-link-cli discover

# Discover for N seconds
rtls-link-cli discover -d 3

# JSON output (best for scripting)
rtls-link-cli discover --json

# Filter by role
rtls-link-cli discover --filter-role anchor-tdoa
rtls-link-cli discover --filter-role tag-tdoa

# Continuous watch mode
rtls-link-cli discover --watch
```

### Device Status

```bash
# Single device
rtls-link-cli status 192.168.0.101

# All devices (runs discovery first)
rtls-link-cli status all
```

### Configuration - Reading Parameters

Parameters are organized in groups: `wifi`, `uwb`, `app`. You must specify both `--group` and `--name`.

```bash
# Read a single parameter
rtls-link-cli config read <IP> --group uwb --name mode
rtls-link-cli config read <IP> -g wifi -n ssidST
rtls-link-cli config read <IP> -g app -n led2State
```

**Common parameter names by group:**

| Group | Parameter Names |
|-------|----------------|
| wifi  | `mode`, `ssidAP`, `pswdAP`, `ssidST`, `pswdST`, `gcsIp`, `udpPort`, `enableWebServer`, `enableDiscovery`, `discoveryPort`, `logUdpPort`, `logSerialEnabled`, `logUdpEnabled` |
| uwb   | `mode`, `devShortAddr`, `anchorCount`, `devId1`..`devIdN`, `x1`..`xN`, `y1`..`yN`, `z1`..`zN`, `originLat`, `originLon`, `originAlt`, `mavlinkTargetSystemId`, `rotationDegrees`, `zCalcMode`, `rfForwardEnable`, `rfForwardSensorId`, `rfForwardOrientation`, `rfForwardPreserveSrcIds`, `channel`, `dwMode`, `txPowerLevel`, `smartPowerEnable` |
| app   | `led2Pin`, `led2State` |

**IMPORTANT:** Parameter names are camelCase as listed above, NOT snake_case. For example, use `ssidST` not `ssid_st`.

### Configuration - Writing Parameters

```bash
# Write a parameter (runtime only)
rtls-link-cli config write <IP> -g app -n led2State -d 1

# Write and save to flash (persists across reboots)
rtls-link-cli config write <IP> -g app -n led2State -d 1 --save
```

### Configuration - Backup and Apply

```bash
# Backup full device config to a JSON file
rtls-link-cli config backup <IP> --output config.json

# Apply a config file to a device
rtls-link-cli config apply <IP> config.json

# Apply to all devices
rtls-link-cli config apply all config.json

# Apply to specific role
rtls-link-cli config apply all config.json --filter-role anchor-tdoa
```

### Configuration - Named Slots on Device

Devices support named config slots stored in flash:

```bash
# List saved configs on device
rtls-link-cli config list <IP>

# Save current config to a named slot
rtls-link-cli config save-as <IP> my-config

# Load a named config
rtls-link-cli config load <IP> my-config

# Delete a named config
rtls-link-cli config delete <IP> my-config
```

### Raw Commands

For sending arbitrary protocol commands to a device:

```bash
# Send a raw command
rtls-link-cli cmd <IP> "readall all"
rtls-link-cli cmd <IP> "readall wifi"
rtls-link-cli cmd <IP> "readall uwb"

# JSON commands (use --json for parsed output)
rtls-link-cli cmd <IP> "backup-config" --json
rtls-link-cli cmd <IP> "firmware-info" --json
rtls-link-cli cmd <IP> "list-configs" --json

# Other commands
rtls-link-cli cmd <IP> "save-config"      # save current config to flash
rtls-link-cli cmd <IP> "load-config"      # load config from flash
rtls-link-cli cmd <IP> "reboot"
rtls-link-cli cmd <IP> "start"            # start positioning
```

**IMPORTANT:** The raw command protocol is NOT the same as the CLI subcommands. The raw protocol uses these exact strings:
- `readall all` (NOT `read_all` or `read-all`)
- `read -group <g> -name <n>`
- `write -group <g> -name <n> -data "<value>"`
- `backup-config`, `save-config`, `load-config`
- `firmware-info` (NOT `version` - there is no `version` command on the device)
- `list-configs`, `save-config-as -name <n>`, `load-config-named -name <n>`

### Bulk Operations

```bash
# Send command to all discovered devices
rtls-link-cli bulk cmd "firmware-info" --json

# Filter by role
rtls-link-cli bulk cmd "readall uwb" --filter-role anchor-tdoa

# Target specific IPs
rtls-link-cli bulk cmd "firmware-info" --ips "192.168.0.101,192.168.0.102"

# Bulk reboot / start
rtls-link-cli bulk reboot
rtls-link-cli bulk start --filter-role tag-tdoa
```

### OTA Firmware Updates

Devices accept firmware binaries via HTTP multipart upload. Use the correct binary for each board type:
- **Anchors** (board: `MAKERFABS_ESP32`): use the `esp32_application` PlatformIO target binary
- **Tags** (board: `ESP32S3_UWB`): use the `esp32s3_application` PlatformIO target binary

```bash
# Single device
rtls-link-cli ota update <IP> /path/to/firmware.bin

# Multiple specific devices
rtls-link-cli ota update "192.168.0.101,192.168.0.102" /path/to/firmware.bin

# All devices of a specific role
rtls-link-cli ota update all /path/to/firmware.bin --filter-role anchor-tdoa

# Control concurrency
rtls-link-cli ota update all /path/to/firmware.bin --concurrency 2
```

After OTA, devices reboot automatically. Allow ~10 seconds for them to come back online before sending commands.

To verify firmware after OTA:
```bash
rtls-link-cli cmd <IP> "firmware-info" --json
```

### Log Streaming

Devices can emit logs over UDP (must be enabled via `logUdpEnabled` parameter).

```bash
# Listen on default port 3334
rtls-link-cli logs

# Filter by level
rtls-link-cli logs -l debug
rtls-link-cli logs -l error

# Filter by tag pattern
rtls-link-cli logs -t "uwb*"

# NDJSON output for piping
rtls-link-cli logs --ndjson
```

### Presets (Local Storage)

Presets are stored locally on the machine running the CLI (not on the device).

```bash
# Save a preset from a device
rtls-link-cli preset save my-preset --from-device 192.168.0.101

# Save from a config file
rtls-link-cli preset save my-preset --from-file config.json

# Location-only preset
rtls-link-cli preset save my-location --from-device 192.168.0.101 --preset-type locations

# List / show / delete
rtls-link-cli preset list
rtls-link-cli preset show my-preset
rtls-link-cli preset delete my-preset

# Upload preset to devices
rtls-link-cli preset upload my-preset 192.168.0.101
rtls-link-cli preset upload my-preset all --filter-role anchor-tdoa
```

## Device Protocol Notes

- Devices communicate over **WebSocket** at `ws://<device-ip>/ws`
- Device discovery uses **UDP** broadcast on port **3333**
- Device logs stream over **UDP** on port **3334** (configurable)
- OTA uploads use **HTTP POST** multipart to `http://<device-ip>/update`
- UWB mode values: `3` = anchor_tdoa, `4` = tag_tdoa (see device firmware for full mapping)
- Device roles reported in heartbeats: `anchor`, `tag`, `anchor_tdoa`, `tag_tdoa`, `calibration`

## Architecture

```
Frontend (React) --> Tauri IPC --> src-tauri --> rtls-link-core
CLI (clap)       ---------------------->        rtls-link-core

rtls-link-core handles:
  - WebSocket device communication (device/websocket.rs)
  - OTA firmware upload (device/ota.rs)
  - UDP discovery (discovery/service.rs, discovery/heartbeat.rs)
  - Protocol command building (protocol/commands.rs)
  - Config/preset local storage (storage/)
  - Shared type definitions (types.rs)
```

## Common Pitfalls for AI Agents

1. **Parameter names are camelCase** - Use `ssidST`, `devShortAddr`, `logUdpPort` etc., not snake_case.
2. **Config read requires `--group` and `--name`** flags - Not positional arguments. Example: `config read <IP> -g uwb -n mode`.
3. **Raw commands differ from CLI subcommands** - The raw protocol command is `readall all` (one word, no hyphen), not `read_all` or `read-all`.
4. **No `version` command on device** - Use `firmware-info` instead to query device firmware/board info.
5. **`cmd` only accepts a single command string** - To send multiple commands, use multiple `cmd` invocations or `bulk cmd` for the same command to many devices.
6. **OTA requires matching binary to board** - ESP32 anchors need `esp32_application` firmware, ESP32-S3 tags need `esp32s3_application` firmware. Mismatched firmware will brick the device.
7. **Allow reboot time after OTA** - Devices take ~10 seconds to reboot and reconnect to WiFi after firmware upload.
8. **`--json` flag enables machine-readable output** - Always use it when parsing output programmatically.
9. **Exit codes matter** - `0` = success, `1` = general error, `2` = CLI usage error, `3` = device/core error. Use `--strict` to fail on any partial failure in bulk operations.
10. **SO_REUSEPORT allows concurrent listeners** - Both the CLI and the Tauri app can run discovery simultaneously on port 3333.
