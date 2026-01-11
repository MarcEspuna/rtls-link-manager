# RTLS-Link Manager

Desktop application for configuring and monitoring RTLS-Link UWB devices.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

RTLS-Link Manager is a cross-platform desktop application built with Tauri for managing RTLS-Link devices - ESP32S3 microcontrollers with DW1000 UWB modules that perform Time Difference of Arrival (TDoA) localization for minidrones.

The tool provides:
- Automatic device discovery on the network
- Real-time device status monitoring
- Configuration management for WiFi, UWB, and anchor networks
- Bulk operations for multi-device control
- Local configuration storage

## Architecture

```
+-------------------------------------------------------------+
|                      RTLS-Link System                       |
+-------------------------------------------------------------+
|                                                             |
|  +-----------------+         +-------------------------+    |
|  |   Minidrone     | <-UWB-> |   RTLS-Link Anchors     |    |
|  |   (Tag Mode)    |         | (ESP32S3 + DW1000 x4-6) |    |
|  +-----------------+         +------------+------------+    |
|                                           |                 |
|                                      WiFi/UDP               |
|                                           |                 |
|                           +---------------v---------------+ |
|                           | RTLS-Link Manager (Desktop)   | |
|                           | +----------+   +------------+ | |
|                           | | React UI |<->| Rust/Tauri | | |
|                           | +----------+   +------------+ | |
|                           +-------------------------------+ |
|                                                             |
+-------------------------------------------------------------+
```

## Features

- **Auto Device Discovery** - UDP-based discovery automatically finds RTLS-Link devices on the network
- **Real-time Monitoring** - Live device status with online/offline indicators via event-driven updates
- **Desktop Application** - Native app experience with no browser required
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
```

Outputs:
- **Linux**: `src-tauri/target/release/bundle/deb/*.deb`, `*.rpm`, `*.AppImage`
- **Windows**: `src-tauri/target/release/bundle/nsis/*.exe`

## Project Structure

```
rtls-link-manager/
├── package.json              # Frontend dependencies
├── index.html                # HTML entry point
├── vite.config.ts            # Vite bundler config
├── src/                      # React frontend
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Main application component
│   ├── lib/
│   │   └── tauri-api.ts      # Tauri IPC wrapper
│   └── components/
│       ├── ConfigPanel/      # Device configuration UI
│       ├── DeviceGrid/       # Device list display
│       ├── LocalConfigs/     # Local config management
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
│       ├── config_storage/   # Local config storage
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
| TWR Anchor | 0 | Two-Way Ranging anchor (responds to tags) |
| TWR Tag | 1 | Two-Way Ranging tag (queries anchors) |
| Calibration | 2 | Calibration mode for anchor setup |
| TDoA Anchor | 3 | Time Difference of Arrival anchor |
| TDoA Tag | 4 | Time Difference of Arrival tag |

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

### Commands

```bash
# Development mode (hot reload)
npm run dev

# Build for production
npm run build

# Run frontend tests
npm test

# Run Rust tests
cd src-tauri && cargo test
```

### Network Ports

| Service | Port | Description |
|---------|------|-------------|
| Vite Dev Server | 1420 | Development UI with HMR |
| Device Discovery | 3333 | UDP broadcast listening |
| Device WebSocket | 80 | Device communication (ws://{ip}/ws) |

### Config Storage Location

Configurations are stored in the OS-specific app data directory:
- **Linux**: `~/.local/share/com.rtls.link-manager/configs/`
- **Windows**: `%APPDATA%\com.rtls.link-manager\configs\`

## Testing

```bash
# Run all Rust tests
cd src-tauri && cargo test

# Run frontend tests
npm test
```

## Troubleshooting

### Devices not discovered

- Verify devices and manager are on the same network
- Check that UDP port 3333 is not blocked by firewall
- Ensure device discovery is enabled in device WiFi settings

### WebSocket connection fails

- Confirm device IP is reachable from manager host
- Check that device web server is enabled
- Verify no firewall blocking port 80

### Configuration not saving

- Check app console for error messages (Ctrl+Shift+I)
- Verify device is online (green status indicator)
- Ensure config name contains only alphanumeric, dash, or underscore

## License

MIT License - See LICENSE file for details.
