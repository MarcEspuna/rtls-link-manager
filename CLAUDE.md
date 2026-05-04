# RTLS-Link Manager - AI Agent Guide

## Project Overview

This repository owns the RTLS-Link desktop app and the RTLS-Link CLI. It is a mixed Rust/TypeScript workspace:

- `crates/rtls-link-core/` - shared Rust logic for discovery, device protocol, OTA, health, calibration, config/preset conversion, and local storage.
- `crates/rtls-link-cli/` - automation CLI built on top of `rtls-link-core`.
- `src-tauri/` - Tauri backend. It should orchestrate device operations through `rtls-link-core` and expose small IPC commands to the UI.
- `src/` - React frontend. It should render state and call Tauri commands; avoid duplicating protocol, calibration, health, or bulk-operation logic here.
- `shared/` - TypeScript types and lightweight UI helpers shared across frontend modules.

The key rule is: if CLI and desktop need the same device behavior, put the implementation in `rtls-link-core` and call it from both places.

## Common Commands

```bash
# Install frontend dependencies
npm install

# Run the desktop app in development mode
npm run dev

# Type-check and bundle the frontend
npm run vite:build

# Build production Tauri bundles
npm run build

# Check the Tauri backend quickly
cargo check --manifest-path src-tauri/Cargo.toml

# Run Rust workspace tests
cargo test --workspace

# Run frontend tests
npm run test:run

# Build the CLI
cargo build --release -p rtls-link-cli
./target/release/rtls-link-cli discover
```

## CLI Usage

The CLI binary is built from this workspace:

```bash
cargo build --release -p rtls-link-cli
./target/release/rtls-link-cli --help
```

Useful hardware workflows:

```bash
# Discover devices
./target/release/rtls-link-cli discover --json

# Send one raw firmware command
./target/release/rtls-link-cli cmd <IP> "firmware-info" --json

# OTA update
./target/release/rtls-link-cli ota update <IP> /path/to/firmware.bin

# Dry-run TDoA antenna calibration
./target/release/rtls-link-cli calibrate anchors --x 5.2 --y 2.3 --dry-run
```

## Architecture Notes

Device communication is backend-owned:

```text
React UI -> Tauri IPC -> src-tauri -> rtls-link-core
CLI -------------------------------> rtls-link-core
```

Current ownership:

- Discovery and heartbeat parsing: `rtls-link-core/src/discovery/`
- WebSocket commands and OTA: `rtls-link-core/src/device/`
- Protocol command strings and config-to-parameter conversion: `rtls-link-core/src/protocol/`
- Health calculation: `rtls-link-core/src/health.rs`
- Antenna calibration: `rtls-link-core/src/calibration.rs`
- Tauri IPC entry points: `src-tauri/src/commands/`
- React API wrappers: `src/lib/tauri-api.ts`

## Protocol Notes

- Devices communicate over WebSocket at `ws://<device-ip>/ws`.
- Discovery uses UDP port `3333`.
- Device logs use UDP port `3334` by default.
- OTA uploads use HTTP POST multipart at `http://<device-ip>/update`.
- Parameter names are camelCase, matching firmware names: `ssidST`, `devShortAddr`, `logUdpPort`, etc.
- Raw device commands are not CLI subcommands. Examples: `readall all`, `backup-config`, `firmware-info`, `save-config`, `load-config`, `reboot`.

## Development Rules

- Keep shared behavior in `rtls-link-core`; do not duplicate it in React or in the CLI.
- Keep React responsible for UI state and presentation. Device workflows should be Tauri commands with progress events when they can take noticeable time.
- Use existing storage and protocol helpers before adding new conversion code.
- Prefer focused tests around core behavior. Calibration, health, protocol parsing, and config conversion should be covered in Rust core tests.
- Before pushing manager changes, run at least:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run vite:build
```

For broader cleanup or shared behavior changes, also run:

```bash
cargo test --workspace
npm run test:run
cargo build --release -p rtls-link-cli
```

## Common Pitfalls

- Use `firmware-info`, not `version`; there is no `version` command on the firmware.
- Config reads require both group and name: `config read <IP> -g uwb -n mode`.
- Use `--json` when another tool or script will parse CLI output.
- Match firmware binaries to board type before OTA.
- Allow devices around 10 seconds to reboot after OTA before sending follow-up commands.
