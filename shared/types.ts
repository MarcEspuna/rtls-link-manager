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

