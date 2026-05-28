# RTLS-Link Manager

Desktop application for configuring and monitoring RTLS-Link UWB devices.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

RTLS-Link Manager is a cross-platform desktop application built with Tauri for managing RTLS-Link devices: ESP32/ESP32S3 boards with DW1000 UWB modules that perform Time Difference of Arrival (TDoA) localization.

The tool provides:
- Automatic device discovery on the network
- Real-time device status monitoring
- Configuration management for WiFi, UWB, and anchor networks
- Antenna-delay calibration for TDoA anchors (matches inter-anchor distances to an externally measured layout)
- Bulk operations for multi-device control
- Local configuration storage

## Architecture

The manager repo also owns the automation CLI. Shared device behavior belongs in `rtls-link-core`, then both the desktop backend and CLI call the same implementation.

```
React UI -> Tauri IPC -> src-tauri -> rtls-link-core
CLI -------------------------------> rtls-link-core
```

## Features

- **Auto Device Discovery** - UDP-based discovery automatically finds RTLS-Link devices on the network
- **Real-time Monitoring** - Live device status with online/offline indicators via event-driven updates
- **Desktop Application** - Native app experience with no browser required
- **Antenna Calibration (TDoA Anchors)** - Calibrate per-anchor `uwb.ADelay` using inter-anchor ToF (`tdoa-distances`) and an externally measured X/Y layout
- **Bulk Operations** - Toggle LEDs, start UWB, or reboot multiple devices at once
- **Local Config Storage** - Save and manage configurations locally in app data directory
- **Cross-Platform** - Runs on Windows and Linux

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (for development)
- Platform-specific dependencies (see below)

### Linux Dependencies

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libsoup-3.0-dev libjavascriptcoregtk-4.1-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Building

```bash
# Build release packages
npm run build

# Build only the CLI
cargo build --release -p rtls-link-cli
```

Outputs:
- **CLI**: `target/release/rtls-link-cli`
- **Linux**: `src-tauri/target/release/bundle/deb/*.deb`, `*.rpm`, `*.AppImage`
- **Windows**: `src-tauri/target/release/bundle/nsis/*.exe`

## Project Structure

```
rtls-link-manager/
├── Cargo.toml                # Rust workspace manifest
├── package.json              # Frontend dependencies
├── index.html                # HTML entry point
├── vite.config.ts            # Vite bundler config
├── crates/
│   ├── rtls-link-core/       # Shared Rust discovery, device protocol, OTA, storage, calibration
│   └── rtls-link-cli/        # CLI built on top of rtls-link-core
├── src/                      # React frontend
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Main application component
│   ├── lib/
│   │   └── tauri-api.ts      # Tauri IPC wrapper
│   └── components/
│       ├── ConfigModal/      # Per-device configuration UI
│       ├── DeviceGrid/       # Device list display
│       ├── LocalConfigs/     # Local config management
│       ├── Presets/          # Local preset management
│       └── common/           # Shared UI components
├── src-tauri/                # Rust backend
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Tauri configuration
│   └── src/
│       ├── main.rs           # Application entry point
│       ├── lib.rs            # Library root
│       ├── types.rs          # Type definitions
│       ├── state.rs          # Shared app state
│       ├── error.rs          # Error handling
│       ├── discovery/        # UDP device discovery
│       ├── config_storage/   # Tauri storage wrappers
│       ├── preset_storage/   # Tauri storage wrappers
│       └── commands/         # Tauri IPC commands
└── shared/                   # Shared types and utilities
    ├── types.ts              # TypeScript interfaces
    ├── commands.ts           # Device command builders
    ├── config.ts             # Configuration validation
    └── anchors.ts            # Anchor data transformations
```

## Configuration Options

### UWB Operation Modes

| Mode | Value | Description |
|------|-------|-------------|
| TDoA Anchor | 3 | Time Difference of Arrival anchor |
| TDoA Tag | 4 | Time Difference of Arrival tag |

### Antenna Calibration (TDoA Anchors)

For anchors running in **TDoA Anchor** mode, open **Device Configuration → Antenna Calibration** to:
- Select the anchor layout (which anchor is X / Y / corner)
- Enter the externally measured X and Y distances (meters)
- Run the calibration to solve and apply `uwb.ADelay` live

### WiFi Configuration

- **AP Mode** - Device broadcasts its own network
- **Station Mode** - Device connects to existing network

### Anchor Network

Configure up to 6 anchors with:
- **ID** - Unique identifier (0-99)
- **X, Y, Z** - 3D coordinates in meters

### Geo-Reference

- **Origin** - Latitude/Longitude/Altitude reference point
- **Rotation** - North rotation offset in degrees

## Development

Keep device-facing behavior in Rust:
- `rtls-link-core` owns protocol, discovery, OTA, health, calibration, and config/preset conversion.
- `src-tauri` exposes those workflows to the UI through Tauri commands and progress events.
- `src` should focus on presentation and user interaction, not protocol or solver logic.

### Commands

```bash
# Development mode (hot reload)
npm run dev

# Build for production
npm run build

# Run frontend tests
npm run test:run

# Run Rust tests
cargo test --workspace

# Build the CLI used by automation and hardware workflows
cargo build --release -p rtls-link-cli
./target/release/rtls-link-cli discover
```

### Network Ports

| Service | Port | Description |
|---------|------|-------------|
| Vite Dev Server | 1420 | Development UI with HMR |
| MAVLink Management | 3333 | UDP discovery, parameters, telemetry, and commands |
| HTTP OTA | 80 | Temporary firmware update endpoint |

### Config Storage Location

Configurations are stored in the OS-specific app data directory:
- **Linux**: `~/.local/share/com.rtls.link-manager/configs/`
- **Windows**: `%APPDATA%\com.rtls.link-manager\configs\`

## Testing

```bash
# Run all Rust tests
cargo test --workspace

# Run frontend tests
npm run test:run
```

## Troubleshooting

### Devices not discovered

- Verify devices and manager are on the same network
- Check that UDP port 3333 is not blocked by firewall
- Ensure MAVLink management is enabled in device WiFi settings

### MAVLink command connection fails

- Confirm device IP is reachable from manager host
- Check that MAVLink management is enabled in device WiFi settings
- Verify no firewall blocking UDP port 3333

### Configuration not saving

- Check app console for error messages (Ctrl+Shift+I)
- Verify device is online (green status indicator)
- Ensure config name contains only alphanumeric, dash, or underscore

## License

MIT License - See LICENSE file for details.
