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
}

export type DeviceRole =
  | 'anchor'
  | 'tag'
  | 'anchor_tdoa'
  | 'tag_tdoa'
  | 'calibration'
  | 'unknown';

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

