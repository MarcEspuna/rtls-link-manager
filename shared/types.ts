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
}

export type DeviceRole =
  | 'anchor'
  | 'tag'
  | 'anchor_tdoa'
  | 'tag_tdoa'
  | 'calibration'
  | 'unknown';

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
  // Rangefinder forwarding parameters
  rfForwardEnable?: 0 | 1;        // 0=disabled, 1=enabled (forward DISTANCE_SENSOR to ArduPilot)
  rfForwardSensorId?: number;     // 0-254 = override, 255 = preserve source
  rfForwardOrientation?: number;  // 0-254 = override, 255 = preserve source
  rfForwardPreserveSrcIds?: 0 | 1; // 0=use UWB device IDs (default), 1=preserve source IDs
  // Position estimation parameters
  enableCovMatrix?: 0 | 1;        // 0=disabled, 1=enabled (send covariance to ArduPilot)
  rmseThreshold?: number;         // RMSE threshold in meters (default 0.8)
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

// Bulk operation result
export interface BulkOperationResult {
  ip: string;
  deviceId?: string;
  success: boolean;
  error?: string;
}

