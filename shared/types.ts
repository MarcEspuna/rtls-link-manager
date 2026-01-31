export interface Device {
  ip: string;
  id: string;
  role: DeviceRole;
  mac: string;
  uwbShort: string;
  mavSysId: number;
  firmware: string;
  // Runtime state (not from discovery)
  online?: boolean;
  lastSeen?: Date;
  // Telemetry (from discovery heartbeat)
  sendingPos?: boolean;     // True if sending positions to ArduPilot
  anchorsSeen?: number;     // Number of unique anchors in measurement set
  originSent?: boolean;     // True if GPS origin sent to ArduPilot
  rfEnabled?: boolean;      // True if zCalcMode == RANGEFINDER
  rfHealthy?: boolean;      // True if receiving non-stale rangefinder data
  // Update rate statistics (centi-Hz for 0.01 Hz precision)
  avgRateCHz?: number;      // Average update rate in centi-Hz (e.g., 1000 = 10.0 Hz)
  minRateCHz?: number;      // Min rate in last 5s window
  maxRateCHz?: number;      // Max rate in last 5s window
  // Logging configuration (from heartbeat)
  logLevel?: number;        // Compiled log level (0=NONE..5=VERBOSE)
  logUdpPort?: number;      // UDP port for log streaming
  logSerialEnabled?: boolean; // Runtime: Serial logging enabled
  logUdpEnabled?: boolean;  // Runtime: UDP log streaming enabled
  // Dynamic anchor positions (from heartbeat, TDoA tags only)
  dynamicAnchors?: DynamicAnchorPosition[];
}

// Dynamic anchor position from inter-anchor TWR measurements
export interface DynamicAnchorPosition {
  id: number;
  x: number;
  y: number;
  z: number;
}

export type DeviceRole =
  | 'anchor'
  | 'tag'
  | 'anchor_tdoa'
  | 'tag_tdoa'
  | 'calibration'
  | 'unknown';

// Anchor layout configurations for dynamic position calculation
// A0 is always at origin. The layout determines which anchors define the +X and +Y axes.
export enum AnchorLayout {
  RECTANGULAR_A1X_A3Y = 0,  // +X=A1, +Y=A3 (default)
  RECTANGULAR_A1X_A2Y = 1,  // +X=A1, +Y=A2
  RECTANGULAR_A3X_A1Y = 2,  // +X=A3, +Y=A1
  RECTANGULAR_A2X_A3Y = 3,  // +X=A2, +Y=A3
  CUSTOM = 255,              // Reserved for future custom layouts
}

// Role helper functions
export const isAnchorRole = (role: DeviceRole): boolean =>
  role === 'anchor' || role === 'anchor_tdoa';

export const isTagRole = (role: DeviceRole): boolean =>
  role === 'tag' || role === 'tag_tdoa';

export interface DeviceConfig {
  wifi: WifiConfig;
  uwb: UwbConfig;
  app: AppConfig;
}

export interface WifiConfig {
  mode: 0 | 1;              // 0=AP, 1=Station
  ssidAP?: string;
  pswdAP?: string;
  ssidST?: string;
  pswdST?: string;
  gcsIp?: string;
  udpPort?: number;
  enableWebServer?: 0 | 1;
  enableDiscovery?: 0 | 1;
  discoveryPort?: number;
  // Logging parameters
  logUdpPort?: number;      // UDP port for log streaming (default: 3334)
  logSerialEnabled?: 0 | 1; // Runtime: Serial logging enabled
  logUdpEnabled?: 0 | 1;    // Runtime: UDP log streaming enabled
}

export interface UwbConfig {
  mode: 0 | 1 | 2 | 3 | 4;  // TWR_ANCHOR, TWR_TAG, CALIBRATION, TDOA_ANCHOR, TDOA_TAG
  devShortAddr: string;
  anchorCount?: number;
  anchors?: AnchorConfig[];
  originLat?: number;
  originLon?: number;
  originAlt?: number;
  mavlinkTargetSystemId?: number;
  rotationDegrees?: number;
  zCalcMode?: 0 | 1 | 2;  // 0=None (TDoA Z), 1=Rangefinder, 2=UWB (reserved)
  // UWB Radio settings (TDoA mode only, expert mode)
  channel?: number;           // UWB channel (1-7), default 2
  dwMode?: number;            // DW1000 mode index (0-7), default 0 (SHORTDATA_FAST_ACCURACY)
  txPowerLevel?: number;      // TX power level (0-3), default 3 (high)
  smartPowerEnable?: 0 | 1;   // Smart power (0=disabled, 1=enabled)
  // TDoA TDMA schedule (TDoA anchors only, expert mode)
  tdoaSlotCount?: number;       // Active TDMA slots per frame (2-8), 0=legacy (8)
  tdoaSlotDurationUs?: number;  // Slot duration in microseconds, 0=legacy (~2ms)
  // Dynamic anchor positioning (TDoA tags only)
  dynamicAnchorPosEnabled?: 0 | 1;  // 0=static (use configured positions), 1=dynamic
  anchorLayout?: AnchorLayout;      // Layout for dynamic position calculation
  anchorHeight?: number;            // Height for Z calculation (NED: Z = -height)
  anchorPosLocked?: number;         // Bitmask: bit N = anchor N position locked
  distanceAvgSamples?: number;      // Number of samples to average (default: 50)
}

export interface AnchorConfig {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface AppConfig {
  led2Pin?: number;
  led2State?: 0 | 1;
}

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Local config storage types
export interface LocalConfigInfo {
  name: string;
  createdAt: string;  // ISO date string
  updatedAt: string;  // ISO date string
}

export interface LocalConfig extends LocalConfigInfo {
  config: DeviceConfig;
}

// Unified Preset types
export type PresetType = 'full' | 'locations';

export interface LocationData {
  origin: {
    lat: number;
    lon: number;
    alt: number;
  };
  rotation: number;
  anchors: AnchorConfig[];
}

export interface Preset {
  name: string;
  description?: string;
  type: PresetType;
  config?: DeviceConfig;      // For type='full'
  locations?: LocationData;   // For type='locations'
  createdAt: string;
  updatedAt: string;
}

export interface PresetInfo {
  name: string;
  type: PresetType;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Bulk operation result
export interface BulkOperationResult {
  ip: string;
  deviceId?: string;
  success: boolean;
  error?: string;
}

// Log message from device (received via UDP)
export interface LogMessage {
  deviceIp: string;       // Source device IP
  ts: number;             // Device timestamp (ms)
  lvl: string;            // Log level (ERROR, WARN, INFO, DEBUG, VERBOSE)
  tag: string;            // Module/file tag
  msg: string;            // Log message content
  receivedAt: number;     // Local receive timestamp (ms)
}

// Log level helpers
export const LOG_LEVEL_NAMES: Record<number, string> = {
  0: 'NONE',
  1: 'ERROR',
  2: 'WARN',
  3: 'INFO',
  4: 'DEBUG',
  5: 'VERBOSE',
};

export const LOG_LEVEL_SHORT: Record<number, string> = {
  0: 'OFF',
  1: 'ERR',
  2: 'WRN',
  3: 'INF',
  4: 'DBG',
  5: 'VRB',
};

export function logLevelToName(level: number): string {
  return LOG_LEVEL_NAMES[level] ?? 'UNKNOWN';
}

export function logLevelToShort(level: number): string {
  return LOG_LEVEL_SHORT[level] ?? '?';
}
