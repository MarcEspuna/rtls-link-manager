# RTLS-Link Manager

This repo is a Tauri (Rust) + React (TypeScript) desktop app for discovering, configuring, and monitoring RTLS-Link UWB devices (ESP32S3 + DW1000). The app is “hybrid” in an important way:

- **Discovery + host-local storage + log ingestion** run in the **Tauri/Rust backend**.
- **Most device control/configuration traffic** is **directly from the React frontend to the device** over the LAN (WebSocket + HTTP).

The goal of this document is to give an agent (or new human) a precise mental model of how the code is organized, which layer owns what, and the main end-to-end flows.

## System Overview

At runtime there are 3 actors:

1. **RTLS-Link devices** on the LAN
2. **RTLS-Link Manager backend** (Rust/Tauri)
3. **RTLS-Link Manager UI** (React)

Key protocols/ports:

- **UDP discovery**: device → manager on `3333` (heartbeats)
- **WebSocket control**: UI → device at `ws://<device-ip>/ws` (text commands, some return JSON)
- **HTTP firmware upload**: UI → device at `http://<device-ip>/update` (OTA `.bin`)
- **UDP log streaming**: device → manager on `3334` (JSON log packets)

## Repository Layout (What Lives Where)

### Frontend (React + TS): `src/`

- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: top-level UI state:
  - fetches initial device list via Tauri IPC (`getDevices`)
  - subscribes to discovery updates via Tauri events (`devices-updated`)
  - splits devices into Anchor/Tag tabs
  - opens `ConfigPanel` modal for a selected device
- `src/components/`
  - `Layout/`: app chrome (header, sidebar tab switcher).
  - `Anchors/`, `Tags/`: list views + per-device cards.
  - `ConfigPanel/`: per-device configuration editor (reads/writes device config over WebSocket).
  - `Controls/BulkActions.tsx`: multi-device “Toggle LEDs / Start / Reboot / Firmware update”.
  - `FirmwareUpdate/`: OTA upload UI (single or bulk).
  - `Presets/PresetsPanel.tsx`: host-local presets (stored via Tauri backend), upload presets to devices.
  - `ExpertMode/LogTerminal.tsx`: live UDP log viewer (via Tauri event `device-log`).
- `src/hooks/`
  - `useDeviceWebSocket.ts`: reusable device WebSocket command runner:
    - `mode: 'single'` opens a fresh socket per command
    - `mode: 'persistent'` keeps a socket + queues commands sequentially (used by `ConfigPanel`)
    - JSON responses are parsed by finding the first `{` because devices may prepend text
  - `useSettings.ts`: UI-only settings persisted to `localStorage` (expert mode + active tab)
- `src/lib/`
  - `tauri-api.ts`: typed wrappers around Tauri `invoke()` + event listeners.
  - `deviceCommands.ts`: stateless helpers for WebSocket commands, bulk concurrency, and firmware upload.
  - `healthStatus.ts`: derives device health from heartbeat telemetry (used by cards).

### Shared TS Types/Protocol Helpers: `shared/`

This folder is aliased as `@shared` in `vite.config.ts`, so UI code imports `@shared/types`, `@shared/commands`, etc.

- `shared/types.ts`: canonical TS types used throughout the UI (Device, DeviceConfig, Preset, etc.).
- `shared/commands.ts`: builds the **text command protocol** sent to `ws://<ip>/ws`.
  - `JSON_COMMANDS` controls which commands are expected to respond with JSON.
- `shared/configParams.ts`: converts a `DeviceConfig` into `[group, name, value]` tuples for bulk writes.
  - Important invariant: **`devShortAddr` is intentionally skipped** to avoid clobbering per-device identity during bulk uploads.
- `shared/anchors.ts`: transforms between firmware’s *flat* anchor fields (`devId1`, `x1`, …) and the UI’s `anchors: AnchorConfig[]`.

### Backend (Rust/Tauri): `src-tauri/`

- `src-tauri/src/main.rs`: calls `rtls_link_manager_lib::run()`.
- `src-tauri/src/lib.rs`: the real entrypoint:
  - creates services
  - spawns background tasks (discovery + log receiver)
  - registers Tauri commands
- `src-tauri/src/state.rs`: `AppState` shared via `tauri::State`:
  - `devices`: map of discovered devices (keyed by IP)
  - `log_streams`: active log stream state + per-device buffers
- `src-tauri/src/types.rs`: Rust types used for IPC payloads and storage.
  - They are intended to track `shared/types.ts`, but in practice can be a **subset**.
  - When the frontend sends extra fields, serde will ignore unknown fields unless explicitly denied, so those fields may not persist in host-local storage until Rust types are updated.
- `src-tauri/src/discovery/`: UDP discovery service (heartbeats → `devices-updated` event).
- `src-tauri/src/logging/`: UDP log receiver (log packets → optional `device-log` events).
- `src-tauri/src/config_storage/`: host-local config storage (JSON files under app data dir).
- `src-tauri/src/preset_storage/`: host-local preset storage (JSON files under app data dir).
- `src-tauri/src/commands/`: Tauri IPC command handlers (invoked from TS via `invoke()`).

## Runtime Data Flows (End-to-End)

### 1) Device Discovery (UDP → Tauri event → React state)

Backend:

- `DiscoveryService` binds `0.0.0.0:3333` and parses heartbeat packets as JSON:
  - `src-tauri/src/discovery/service.rs` (`parse_heartbeat`)
- Devices are tracked in an in-memory map with a **TTL** (currently 5s).
- After receiving a heartbeat or pruning stale entries, backend emits:
  - event: `devices-updated`
  - payload: `Vec<Device>` sorted by IP

Frontend:

- `src/App.tsx` does:
  - `getDevices()` once (initial state)
  - `onDevicesUpdated(...)` subscription (push updates, no polling)
- UI filters devices by role:
  - anchors: `role === 'anchor' | 'anchor_tdoa'`
  - tags: `role === 'tag' | 'tag_tdoa'`

Important nuance:

- “Offline” devices are generally represented by **disappearing** from the list (TTL prune), not by a persistent entry with `online=false`.

### 2) Per-Device Commands (WebSocket from UI directly to device)

This is *not* done via Tauri IPC. The browser webview opens network sockets directly.

- Transport: `ws://<device-ip>/ws`
- Protocol: plaintext commands (built in `shared/commands.ts`)
- Two main calling styles:
  - `useDeviceCommand(..., { mode: 'single' })`: one socket per command (cards, simple actions)
  - `useDeviceCommand(..., { mode: 'persistent' })`: one socket + queued commands (config editor)

JSON responses:

- Some commands respond with JSON (e.g. `backup-config`, `toggle-led2`).
- Both `useDeviceWebSocket.ts` and other code often parse by finding the first `{` and `JSON.parse()` from there to tolerate prefix text.

### 3) Device Configuration Editing (ConfigPanel)

Entry:

- `AnchorCard` / `TagCard` → “Config” → `src/components/ConfigPanel/ConfigPanel.tsx`

Flow:

1. `backup-config` is sent to the device.
2. The response includes config groups like `wifi`, `uwb`, `app`.
3. Firmware represents anchors *flat* (`devId1`, `x1`, `y1`, `z1`, …), so the UI normalizes:
   - `flatToAnchors(...)` → `anchors: AnchorConfig[]`
4. Editing:
   - Most fields write a single param via `write -group <g> -name <n> -data "<v>"` on blur/change.
   - Anchor edits are applied as a batch (`getAnchorWriteCommands` → many writes + `anchorCount`).
5. Saving:
   - “Save” writes anchors then calls `save-config`
   - “Save As…” writes anchors then calls `save-config-as -name <name>`

Also in `ConfigPanel`:

- “Saved Configurations” list comes from the device itself (`list-configs`, `read-config-named`, `load-config-named`).
- Firmware update UI is embedded per-device (`FirmwareUpdate`).
- Expert Mode unlocks additional WiFi/logging/UWB radio fields and the log terminal.

### 4) Bulk Actions (Multi-device control)

- UI: `src/components/Controls/BulkActions.tsx`
- Implementation: `src/lib/deviceCommands.ts`
- Pattern:
  - operate on a list of selected devices
  - run with a concurrency limit (default ~3–5 depending on function)
  - collect per-device success/error results

### 5) Presets (Host-local storage + upload to devices)

Presets are stored **on the manager machine**, not on the devices.

- UI: `src/components/Presets/PresetsPanel.tsx`
- Backend storage: `src-tauri/src/preset_storage/service.rs` → app data dir `presets/`
- Types: `shared/types.ts` (`Preset` / `PresetInfo`, `PresetType`)

Preset kinds:

- `type: 'full'`: includes a full `DeviceConfig`
- `type: 'locations'`: includes anchors + origin + rotation only

Key flows:

- “Save from Device”:
  - reads `backup-config` from the first selected device
  - normalizes anchors
  - saves a `Preset` via Tauri `save_preset`
- “Upload to Selected”:
  - full presets: write all params (via `configToParams`) + `save-config-as -name <preset>`
  - location presets: only write origin/rotation/anchors + `save-config`
  - location presets are uploaded to **tags only** (`isTagRole`)

### 6) Firmware Update (HTTP upload)

- UI: `src/components/FirmwareUpdate/FirmwareUpdate.tsx`
- Transport: `http://<device-ip>/update` (POST multipart form with `firmware.bin`)
- Implementation: `uploadFirmware` / `uploadFirmwareBulk` in `src/lib/deviceCommands.ts`

### 7) Log Streaming (UDP ingestion in backend + UI terminal)

Device → manager:

- UDP JSON packets to `0.0.0.0:3334`
- Parsed in `src-tauri/src/logging/service.rs`

Backend behavior:

- Logs are **always buffered per device** in memory (ring buffer).
- Logs are only **emitted to the frontend** as `device-log` events if that device is marked “active”.

Frontend behavior:

- `src/components/ExpertMode/LogTerminal.tsx`:
  - `invoke('start_log_stream', { deviceIp })` on mount
  - listens for `device-log` events and filters by `deviceIp`
  - `invoke('stop_log_stream', { deviceIp })` on unmount

Note:

- There is currently no IPC command that returns the buffered history; the UI receives logs in real time while streaming.

## Tauri IPC Contract (Commands + Events)

### Commands (Rust → `invoke(...)`)

Registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![...]`:

- Devices:
  - `get_devices`, `get_device`, `clear_devices`
- Host-local configs:
  - `list_configs`, `get_config`, `save_config`, `delete_config`
- Host-local presets:
  - `list_presets`, `get_preset`, `save_preset`, `delete_preset`
- Logging control:
  - `start_log_stream`, `stop_log_stream`, `get_active_log_streams`

Frontend wrappers live in `src/lib/tauri-api.ts` (except logging, which `LogTerminal` invokes directly).

### Events (Rust → `listen(...)`)

- `devices-updated`: emitted by discovery service with `Device[]`
- `device-log`: emitted by log receiver with `LogMessage`

## Agentic “Change Recipes” (Where to Edit What)

### Add a new field to the heartbeat/device model

1. Update parsing in `src-tauri/src/discovery/service.rs` (`parse_heartbeat`).
2. Update Rust struct in `src-tauri/src/types.rs` (`Device`) with correct serde casing.
3. Update TS type in `shared/types.ts` (`Device`).
4. Update any UI that displays/derives health from it:
   - `src/lib/healthStatus.ts`, `TagCard.tsx`, etc.

Type note:

- `lastSeen` is currently typed as `Date` in `shared/types.ts`, but Tauri payloads arrive as JSON (ISO strings). If you start using `lastSeen` in the UI, you may want to change the TS type to `string` or add an explicit parse step.

### Add a new on-device WebSocket command

1. Add builder in `shared/commands.ts`.
2. If the response is JSON, add the command prefix to `JSON_COMMANDS`.
3. Use it via:
   - `useDeviceCommand(...).sendCommand(...)` for UI actions, or
   - `src/lib/deviceCommands.ts` for bulk/concurrency patterns.

### Add a new Tauri IPC command (host-side feature)

1. Implement in `src-tauri/src/commands/<area>.rs`.
2. Export module in `src-tauri/src/commands/mod.rs` if needed.
3. Register in `src-tauri/src/lib.rs` `invoke_handler`.
4. Add a typed wrapper in `src/lib/tauri-api.ts` and call it from React.

### Add a new UI tab/panel

1. Extend `TabType` in `src/components/Layout/Sidebar.tsx`.
2. Add the tab button entry in `src/components/Layout/Sidebar.tsx` (`tabs` array).
3. Update defaults/persistence as needed in `src/hooks/useSettings.ts` (`activeTab`).
4. Render the panel in `src/App.tsx` (`renderContent()` switch).

### Add a new host-local stored object

Follow the existing pattern:

- Service: `src-tauri/src/*_storage/service.rs` (directory, name validation, JSON read/write).
- Commands: `src-tauri/src/commands/*.rs`.
- Frontend wrappers: `src/lib/tauri-api.ts`.

Persistence note:

- Host-local storage is implemented in Rust and uses Rust structs for serde; if you need a new field to round-trip (save + read) through `save_config`/`save_preset`, that field must exist in the corresponding Rust type in `src-tauri/src/types.rs`.
- Example: `shared/types.ts` includes WiFi logging fields (`logUdpPort`, `logSerialEnabled`, `logUdpEnabled`), but `src-tauri/src/types.rs` `WifiConfig` currently does not, so those fields will be dropped when saving host-local configs/presets until Rust is updated.

### Expose log history to the UI (optional enhancement)

The backend already buffers logs per device (`LogStreamState::log_buffers`). To let the UI fetch history when opening the log terminal:

1. Add a Tauri command in `src-tauri/src/commands/logging.rs` that returns `state.log_streams.read().await.get_logs(&device_ip)`.
2. Register it in `src-tauri/src/lib.rs` `invoke_handler`.
3. Call it from `src/components/ExpertMode/LogTerminal.tsx` before starting live streaming.

## Common Pitfalls & Patterns

### CSS Variable Naming Convention

**IMPORTANT:** All CSS variables are defined in `src/index.css`. Use these exact names:

| Category | Variables |
|----------|-----------|
| Backgrounds | `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-elevated` |
| Borders | `--border-color`, `--border-color-light` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` |
| Accents | `--accent-primary`, `--accent-primary-hover`, `--accent-primary-muted` |
| Status | `--accent-success`, `--accent-danger`, `--accent-warning`, `--accent-degraded` (each has `-muted` variant) |
| Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |

**Do NOT use** generic names like `--surface`, `--primary`, `--border`, `--error`, `--success` — these don't exist and will render as transparent/default.

### Passing Device Data to Modals/Panels

**Problem:** If you store a full `Device` object in React state when opening a modal, that object becomes stale when new discovery packets arrive with updated telemetry (e.g., `dynamicAnchors`, rate statistics).

**Solution:** Store only the device IP, then derive the current device from the live `devices` list:

```tsx
// BAD - device becomes stale
const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
// ...
<Modal device={selectedDevice} />

// GOOD - device updates when devices list updates
const [selectedDeviceIp, setSelectedDeviceIp] = useState<string | null>(null);
const selectedDevice = useMemo(() =>
  devices.find(d => d.ip === selectedDeviceIp) ?? null,
  [devices, selectedDeviceIp]
);
// ...
<Modal device={selectedDevice} />
```

This pattern ensures modals receive live telemetry updates from the discovery service.

## Development & Tests

- Dev (Tauri + Vite): `npm run dev`
- Build: `npm run build`
- Frontend/unit tests (Vitest): `npm test`
- Rust tests: `cd src-tauri && cargo test`

## Notes on “Extra”/Unused UI

There are components that are not currently wired into the main tab UI:

- `src/components/LocalConfigs/LocalConfigPanel.tsx`: UI for host-local configs stored via `ConfigStorageService`.
- `src/components/DeviceGrid/*`: older generic device grid/cards (current UI uses `AnchorsPanel`/`TagsPanel` instead).

Treat these as reference implementations unless/until they’re reconnected to `App.tsx`.
