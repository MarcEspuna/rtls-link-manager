# PR Review Guide: Shared `rtls-link-core` Workspace + Tauri IPC Migration

PR: https://github.com/MarcEspuna/rtls-link-manager/pull/8

## 1. Problem Statement

The `rtls-link-manager` (Tauri desktop app) and `rtls-link-cli` (command-line tool) both communicate with the same RTLS-Link UWB devices using the same protocol, but they had **completely independent implementations** of:

- Type definitions (Device, DeviceConfig, Anchor, Preset, DeviceRole, etc.)
- Protocol command builders (`backup-config`, `writeParam`, `save-config-as`, etc.)
- Protocol response parsing (JSON extraction from prefixed responses, error detection)
- Device communication (WebSocket client for commands, HTTP multipart POST for OTA firmware)
- UDP discovery (heartbeat parsing, device pruning)
- Storage (preset/config file management)

Additionally, the **React frontend communicated directly with devices** from the browser via `new WebSocket('ws://<ip>/ws')` and `XMLHttpRequest` to `http://<ip>/update`. This is fragile: browser WebSocket connections are subject to mixed-content restrictions, CORS, and are hard to control from Tauri. It also means the Tauri backend has no visibility into device communication.

### Goals

1. **Deduplicate** all shared logic into a single `rtls-link-core` library crate
2. **Unify** CLI and Tauri app into one Cargo workspace so they can share the crate
3. **Route all device communication through Rust** so the frontend only uses `invoke()` IPC
4. Keep every phase compilable and all existing tests passing

### What this does NOT change

- The device protocol itself (same commands, same WebSocket/HTTP endpoints)
- The React UI (components look and behave the same)
- The CLI's user-facing interface (same commands, same output)
- Tauri discovery service (still UDP, still emits events - only the heartbeat parser is shared)

---

## 2. Architecture Overview

### Before

```
rtls-link-manager/
  src-tauri/   -> own types, own heartbeat parser, own storage impl
  src/         -> React, direct WS to devices, XHR for OTA

rtls-link/tools/rtls-link-cli/  -> own types, own protocol, own WS client,
                                    own OTA, own storage, own discovery
```

### After

```
rtls-link-manager/
  Cargo.toml                     # Workspace root
  crates/
    rtls-link-core/              # Shared library (no framework deps)
      src/
        types.rs                 # All type definitions
        error.rs                 # CoreError hierarchy + AppError (serializable)
        protocol/                # Command builders, response parsing, config params
        discovery/               # Heartbeat parsing, DiscoveryService
        device/                  # WebSocket client, OTA client
        storage/                 # PresetStorage, ConfigStorage
    rtls-link-cli/               # CLI binary (moved from main repo)
      src/                       # Uses core::*, CLI-specific: clap, output formatting
  src-tauri/                     # Tauri app (thin wrappers around core)
    src/
      commands/device_comm.rs    # NEW: 5 Tauri commands for device communication
      discovery/service.rs       # Uses core::discovery::heartbeat, adds Tauri events
      preset_storage/service.rs  # Wraps core::storage::PresetStorage
      config_storage/service.rs  # Wraps core::storage::ConfigStorage
      types.rs                   # pub use rtls_link_core::types::*
  src/                           # React frontend
    hooks/useDeviceCommand.ts    # NEW: uses invoke(), replaces WebSocket hook
    lib/tauri-api.ts             # Extended with device comm + OTA wrappers
    lib/deviceCommands.ts        # Rewritten: delegates to tauri-api
```

### Dependency direction

```
                  rtls-link-core
                   /           \
        rtls-link-cli      src-tauri (Tauri app)
                                |
                           React frontend
                        (invoke() only)
```

`rtls-link-core` has zero knowledge of Tauri or any CLI framework. It depends only on:
- `serde`, `serde_json`, `chrono` (types/serialization)
- `thiserror` (error types)
- `tokio`, `tokio-tungstenite`, `futures-util`, `futures` (async WebSocket)
- `reqwest` (HTTP OTA upload)
- `socket2` (UDP discovery)
- `regex`, `directories` (storage)

---

## 3. Design Decisions and Motivations

### 3.1 Error type split: `CoreError` vs `AppError` vs `CliError`

**File:** `crates/rtls-link-core/src/error.rs`

- **`CoreError`** is the internal error type with rich variants (`DeviceError`, `StorageError`, `ConfigError`). It is *not* serializable.
- **`AppError`** is a flattened, `Serialize + Deserialize` error for crossing the Tauri IPC boundary. It has simple string-carrying variants (`Io`, `InvalidName`, `NotFound`, `Json`, `Device`).
- **`CliError`** (in CLI crate) wraps `CoreError` via `#[from]` and adds CLI-specific variants (`PartialFailure`, `NoDevicesFound`, `InvalidArgument`). Maps errors to exit codes.

**Motivation:** Tauri commands need serializable errors. Keeping `CoreError` rich and non-serializable avoids polluting core with serialization concerns. The `From<CoreError> for AppError` conversion maps structured variants to flat strings at the boundary.

**Review point:** Check whether the `AppError` flattening loses useful information. For example, `CoreError::Device(DeviceError::OtaFailed { ip, message })` becomes `AppError::Device("OTA update failed on 192.168.1.1: ...")`. The IP and structured message are baked into a string. Is this acceptable for frontend error display?

### 3.2 Storage path divergence

**Files:** `crates/rtls-link-core/src/storage/mod.rs`, `src-tauri/src/preset_storage/service.rs`

The CLI uses `directories::ProjectDirs` (`~/.local/share/rtls-link-manager/`) while Tauri uses `app_handle.path().app_data_dir()` (`~/.local/share/com.rtls.link-manager/`).

**Decision:** Core's `PresetStorage` and `ConfigStorage` take a `PathBuf` in their constructor. Each consumer provides the correct path. Core also exposes `storage::default_data_dir()` using the `directories` crate for the CLI's convenience.

**Review point:** This means CLI and Tauri use *different data directories*. Presets saved in the Tauri app are not visible to the CLI and vice versa. This is the existing behavior preserved. If unifying the data directory is desired, that's a separate change.

### 3.3 OTA progress: trait-based `OtaProgressHandler`

**File:** `crates/rtls-link-core/src/device/ota.rs`

```rust
pub trait OtaProgressHandler: Send + Sync {
    fn on_progress(&self, ip: &str, bytes_sent: u64, total_bytes: u64);
    fn on_complete(&self, ip: &str);
    fn on_error(&self, ip: &str, error: &str);
}
```

- CLI implements this with `indicatif` progress bars
- Tauri implements this with `app_handle.emit()` events
- Core provides `NoopProgress` for when progress isn't needed

**Motivation:** Avoids core depending on any framework. The trait is the seam between shared logic and framework-specific presentation.

**Review point:** The current OTA implementation in core uses `reqwest` which doesn't expose upload progress granularly (unlike XHR `upload.onprogress`). The progress callbacks only fire at 0% and 100%. This is a **regression** from the browser's XHR-based upload which had real-time byte-level progress. Intermediate progress would require streaming the upload body through reqwest, which is more complex.

### 3.4 WebSocket: one-shot connections per command

**File:** `crates/rtls-link-core/src/device/websocket.rs`

`send_command()` opens a fresh WebSocket, sends one command, reads one response, and closes. `send_device_commands` (Tauri command) loops over commands calling `send_command()` for each.

**Motivation:** Simple, stateless, no connection pooling to manage. The devices handle rapid connect/disconnect fine.

**Review point:** The old frontend `useDeviceWebSocket` had a "persistent" mode that kept one connection open and queued commands. The new approach opens a new connection per command. For bulk writes (e.g., uploading a full preset = ~50 write-param commands), this means ~50 WebSocket connect/disconnect cycles instead of 1. This works but may be slower. The `DeviceConnection` struct exists in core for batching over a single connection, but the Tauri command `send_device_commands` doesn't use it — it calls `send_command()` in a loop. This is worth reviewing.

### 3.5 Firmware file path approach (not bytes over IPC)

**File:** `src-tauri/src/commands/device_comm.rs`

The Tauri command `upload_firmware_from_file` takes a `file_path: String`, reads the file in Rust, and uploads it. The frontend uses `@tauri-apps/plugin-dialog` to get the path from a native file picker.

**Motivation:** Avoids serializing multi-MB firmware binaries through Tauri IPC (which base64-encodes them). The file path approach is more efficient.

**Review point:** This required adding the `tauri-plugin-dialog` dependency. The old browser `<input type="file">` approach is gone. Verify the native dialog capability (`dialog:allow-open`) is correctly configured.

### 3.6 Frontend: JSON response parsing stays in TypeScript

**Files:** `src/hooks/useDeviceCommand.ts`, `src/lib/deviceCommands.ts`

The Rust backend returns raw response strings. The frontend still does:
1. Detect if command is JSON-returning (`isJsonCommand()`)
2. Find first `{` in the response (devices may prefix JSON with text)
3. `JSON.parse()` the payload

**Motivation:** Moving this to Rust would require the backend to know the protocol schema (which responses are JSON, what the expected shape is). Keeping parsing in TypeScript means `shared/commands.ts` stays the single source of truth for the frontend, and types remain in sync with the TypeScript type definitions.

**Review point:** There's now a dual layer of response handling — Rust's `is_error_response()` in `core::protocol::response` checks for error keywords, and TypeScript's `checkCommandResponse()` in `deviceCommands.ts` does the same. Could simplify by having Rust return structured results instead of raw strings.

### 3.7 `useDeviceCommand` hook: API-compatible with old hook

**File:** `src/hooks/useDeviceCommand.ts`

The new hook exports the same interface: `{ sendCommand, sendCommands, loading, error, close }`. The `close()` method is a no-op (no persistent connection to close). The `mode` option was dropped.

**Motivation:** Minimizes component changes. Components just change their import path and drop the `mode: 'persistent'` option.

### 3.8 CLI moved into the rtls-link-manager repo (not the main rtls-link repo)

The CLI source was copied from `rtls-link/tools/rtls-link-cli/` into `rtls-link-manager/crates/rtls-link-cli/`. The main repo still has its copy (a separate PR would remove it and update the submodule pointer).

**Motivation:** The CLI and Tauri app must be in the same Cargo workspace to share `rtls-link-core`. Since `rtls-link-manager` is the submodule with its own repo, the CLI moves here.

**Review point:** The main repo (`rtls-link`) still has `tools/rtls-link-cli/`. After merging this PR, a follow-up PR on the main repo should `git rm -r tools/rtls-link-cli/` and update the submodule pointer.

---

## 4. Key Files to Review

### Core library (highest priority - new code, most impact)

| File | What to look for |
|------|-----------------|
| `crates/rtls-link-core/src/types.rs` | Unified type definitions. Check serde attributes, field naming consistency between Rust and TypeScript types |
| `crates/rtls-link-core/src/error.rs` | Error hierarchy. Check `CoreError -> AppError` conversion doesn't lose important info |
| `crates/rtls-link-core/src/device/websocket.rs` | WebSocket client. Check timeout handling, error propagation, connection lifecycle |
| `crates/rtls-link-core/src/device/ota.rs` | OTA upload. Check error handling, progress callback correctness, `buffer_unordered` concurrency |
| `crates/rtls-link-core/src/protocol/response.rs` | Response parsing. Check JSON extraction logic, error detection heuristics |
| `crates/rtls-link-core/src/protocol/config_params.rs` | Config-to-params conversion. Check all config fields are mapped correctly |
| `crates/rtls-link-core/src/storage/preset.rs` | Preset file storage. Check file locking, name validation, async I/O |
| `crates/rtls-link-core/src/discovery/heartbeat.rs` | Heartbeat parsing. Check all device roles, dynamic anchor handling |

### Tauri integration (medium priority - boundary code)

| File | What to look for |
|------|-----------------|
| `src-tauri/src/commands/device_comm.rs` | Tauri commands. Check error mapping to `String`, timeout defaults, `AppHandle` usage |
| `src-tauri/src/lib.rs` | Command registration. Verify all 5 new commands are registered |
| `src-tauri/src/preset_storage/service.rs` | Thin wrapper. Check delegation is correct, no logic duplication |
| `src-tauri/src/discovery/service.rs` | Uses core parser. Check integration with Tauri events |
| `src-tauri/capabilities/default.json` | Permissions. Verify `dialog:allow-open` is correct |

### Frontend migration (medium priority - behavioral change)

| File | What to look for |
|------|-----------------|
| `src/hooks/useDeviceCommand.ts` | New hook. Check error handling, loading state, JSON parsing |
| `src/lib/deviceCommands.ts` | Rewritten. Check `sendDeviceCommands` response validation loop, firmware upload flow |
| `src/lib/tauri-api.ts` | IPC wrappers. Check parameter naming matches Rust `#[tauri::command]` snake_case |
| `src/components/FirmwareUpdate/FirmwareUpdate.tsx` | Biggest component change. Check file dialog flow, progress handling |
| `src/components/LocalConfigs/LocalConfigPanel.tsx` | Removed inline WebSocket code. Check nothing was lost |

### CLI rewiring (lower priority - mostly import changes)

| File | What to look for |
|------|-----------------|
| `crates/rtls-link-cli/src/error.rs` | `CliError` wraps `CoreError`. Check `From` impls, `Clone` impl, exit codes |
| `crates/rtls-link-cli/src/commands/preset.rs` | Heavy rewrite. Check async storage calls, type annotations |
| `crates/rtls-link-cli/src/commands/ota.rs` | Uses core OTA. Check `CliProgress` impl, file read → byte vec flow |
| `crates/rtls-link-cli/src/device/discovery.rs` | Thin wrapper. Check `DiscoveryService` delegation |

---

## 5. Known Issues and Rough Edges

### 5.1 OTA progress is not granular

The `reqwest`-based OTA upload doesn't report intermediate progress. The `OtaProgressHandler` callbacks fire at 0% and 100% only. The old XHR-based browser upload tracked byte-level progress.

**Impact:** The progress bar in `FirmwareUpdate.tsx` will jump from 0% to 100% instead of showing smooth progress.

**Fix path:** Use a custom `reqwest::Body` that wraps the data and calls the progress handler as bytes are consumed. This is a follow-up enhancement, not a regression in functionality (upload still works).

### 5.2 `send_device_commands` opens N connections instead of 1

The Tauri `send_device_commands` command calls `send_command()` in a loop, opening a new WebSocket for each. The old frontend reused a single connection.

**Impact:** Slightly slower for large batch writes (e.g., 50+ writeParam commands for a full preset). Functionally correct.

**Fix path:** Use `DeviceConnection::send_batch()` from core inside the Tauri command to reuse one connection.

### 5.3 CLI dead-code warnings

The CLI has 5 dead-code warnings (unused `Timeout` variant, unused `Result` alias, unused output methods, unused `health_color`). These are pre-existing code that was copied from the original CLI and not trimmed.

### 5.4 Tauri `device_comm` commands return `Result<T, String>`

The new Tauri device commands return `Result<T, String>` (errors as strings). This follows the pattern used by `send_command()` in the Tauri ecosystem but loses error structure. The existing Tauri commands (devices, configs, presets) use `AppError` which is serializable.

**Review point:** Should `device_comm` commands use `AppError` instead of `String`?

### 5.5 `shared/commands.ts` kept as-is

The plan mentioned possibly removing or reducing `shared/commands.ts`. It was kept unchanged since it's protocol-agnostic (just string builders) and used by all components.

---

## 6. Test Coverage

| Crate | Tests | Coverage |
|-------|-------|----------|
| `rtls-link-core` | 37 | types, error conversions, protocol commands, response parsing, config params, storage CRUD, heartbeat parsing, device pruning |
| `rtls-link-cli` | 6 | health status calculations |
| `src-tauri` | 15 | discovery parsing, config storage CRUD, preset storage CRUD, app state |
| **Total** | **58** | All pass |

### What's NOT tested

- WebSocket client (`core::device::websocket`) — requires a running device or mock server
- OTA upload (`core::device::ota`) — requires a running device
- Tauri commands (`device_comm.rs`) — requires Tauri runtime
- Frontend hooks and components — no JS test coverage (manual testing needed)
- Discovery service socket binding — requires network access

---

## 7. Manual Testing Checklist

These are the behaviors that should be verified with real devices connected:

1. **Device discovery** — devices appear in the sidebar after startup
2. **Config read** — open ConfigPanel, verify config loads from device
3. **Config write** — change a parameter, save, reload to verify persistence
4. **Saved configs** — list/preview/activate saved configs on device
5. **Anchor editing** — modify anchor positions, apply batch
6. **Firmware upload (single)** — select .bin file via dialog, upload to one device
7. **Firmware upload (bulk)** — upload to multiple selected devices
8. **Presets: save** — save full + location presets from device
9. **Presets: upload** — upload preset to selected devices
10. **Bulk actions** — toggle LED, start UWB, reboot on multiple devices
11. **CLI: discover** — `cargo run -p rtls-link-cli -- discover` finds devices
12. **CLI: config** — `cargo run -p rtls-link-cli -- config backup <ip>` works
13. **CLI: preset** — `cargo run -p rtls-link-cli -- preset save/upload` works
