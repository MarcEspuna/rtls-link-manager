#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParamEntry {
    pub id: &'static str,
    pub group: &'static str,
    pub name: &'static str,
}

pub const PARAMS: &[ParamEntry] = &[
    ParamEntry {
        id: "WIFI_MODE",
        group: "wifi",
        name: "mode",
    },
    ParamEntry {
        id: "WIFI_SSID_AP",
        group: "wifi",
        name: "ssidAP",
    },
    ParamEntry {
        id: "WIFI_PSWD_AP",
        group: "wifi",
        name: "pswdAP",
    },
    ParamEntry {
        id: "WIFI_SSID_ST",
        group: "wifi",
        name: "ssidST",
    },
    ParamEntry {
        id: "WIFI_PSWD_ST",
        group: "wifi",
        name: "pswdST",
    },
    ParamEntry {
        id: "WIFI_GCS_IP",
        group: "wifi",
        name: "gcsIp",
    },
    ParamEntry {
        id: "WIFI_UART_PORT",
        group: "wifi",
        name: "udpPort",
    },
    ParamEntry {
        id: "WIFI_OTA_EN",
        group: "wifi",
        name: "enableWebServer",
    },
    ParamEntry {
        id: "WIFI_UART_EN",
        group: "wifi",
        name: "enableUartBridge",
    },
    ParamEntry {
        id: "WIFI_LOG_PORT",
        group: "wifi",
        name: "logUdpPort",
    },
    ParamEntry {
        id: "WIFI_LOG_SER",
        group: "wifi",
        name: "logSerialEnabled",
    },
    ParamEntry {
        id: "WIFI_LOG_UDP",
        group: "wifi",
        name: "logUdpEnabled",
    },
    ParamEntry {
        id: "APP_LED2_PIN",
        group: "app",
        name: "led2Pin",
    },
    ParamEntry {
        id: "APP_LED2_STATE",
        group: "app",
        name: "led2State",
    },
    ParamEntry {
        id: "UWB_MODE",
        group: "uwb",
        name: "mode",
    },
    ParamEntry {
        id: "UWB_ENABLE",
        group: "uwb",
        name: "uwbEnable",
    },
    ParamEntry {
        id: "UWB_ADDR",
        group: "uwb",
        name: "devShortAddr",
    },
    ParamEntry {
        id: "UWB_ANCH_CNT",
        group: "uwb",
        name: "anchorCount",
    },
    ParamEntry {
        id: "UWB_A1_ID",
        group: "uwb",
        name: "devId1",
    },
    ParamEntry {
        id: "UWB_A1_X",
        group: "uwb",
        name: "x1",
    },
    ParamEntry {
        id: "UWB_A1_Y",
        group: "uwb",
        name: "y1",
    },
    ParamEntry {
        id: "UWB_A1_Z",
        group: "uwb",
        name: "z1",
    },
    ParamEntry {
        id: "UWB_A2_ID",
        group: "uwb",
        name: "devId2",
    },
    ParamEntry {
        id: "UWB_A2_X",
        group: "uwb",
        name: "x2",
    },
    ParamEntry {
        id: "UWB_A2_Y",
        group: "uwb",
        name: "y2",
    },
    ParamEntry {
        id: "UWB_A2_Z",
        group: "uwb",
        name: "z2",
    },
    ParamEntry {
        id: "UWB_A3_ID",
        group: "uwb",
        name: "devId3",
    },
    ParamEntry {
        id: "UWB_A3_X",
        group: "uwb",
        name: "x3",
    },
    ParamEntry {
        id: "UWB_A3_Y",
        group: "uwb",
        name: "y3",
    },
    ParamEntry {
        id: "UWB_A3_Z",
        group: "uwb",
        name: "z3",
    },
    ParamEntry {
        id: "UWB_A4_ID",
        group: "uwb",
        name: "devId4",
    },
    ParamEntry {
        id: "UWB_A4_X",
        group: "uwb",
        name: "x4",
    },
    ParamEntry {
        id: "UWB_A4_Y",
        group: "uwb",
        name: "y4",
    },
    ParamEntry {
        id: "UWB_A4_Z",
        group: "uwb",
        name: "z4",
    },
    ParamEntry {
        id: "UWB_A5_ID",
        group: "uwb",
        name: "devId5",
    },
    ParamEntry {
        id: "UWB_A5_X",
        group: "uwb",
        name: "x5",
    },
    ParamEntry {
        id: "UWB_A5_Y",
        group: "uwb",
        name: "y5",
    },
    ParamEntry {
        id: "UWB_A5_Z",
        group: "uwb",
        name: "z5",
    },
    ParamEntry {
        id: "UWB_A6_ID",
        group: "uwb",
        name: "devId6",
    },
    ParamEntry {
        id: "UWB_A6_X",
        group: "uwb",
        name: "x6",
    },
    ParamEntry {
        id: "UWB_A6_Y",
        group: "uwb",
        name: "y6",
    },
    ParamEntry {
        id: "UWB_A6_Z",
        group: "uwb",
        name: "z6",
    },
    ParamEntry {
        id: "UWB_A7_ID",
        group: "uwb",
        name: "devId7",
    },
    ParamEntry {
        id: "UWB_A7_X",
        group: "uwb",
        name: "x7",
    },
    ParamEntry {
        id: "UWB_A7_Y",
        group: "uwb",
        name: "y7",
    },
    ParamEntry {
        id: "UWB_A7_Z",
        group: "uwb",
        name: "z7",
    },
    ParamEntry {
        id: "UWB_A8_ID",
        group: "uwb",
        name: "devId8",
    },
    ParamEntry {
        id: "UWB_A8_X",
        group: "uwb",
        name: "x8",
    },
    ParamEntry {
        id: "UWB_A8_Y",
        group: "uwb",
        name: "y8",
    },
    ParamEntry {
        id: "UWB_A8_Z",
        group: "uwb",
        name: "z8",
    },
    ParamEntry {
        id: "UWB_ADELAY",
        group: "uwb",
        name: "ADelay",
    },
    ParamEntry {
        id: "UWB_ORG_LAT",
        group: "uwb",
        name: "originLat",
    },
    ParamEntry {
        id: "UWB_ORG_LON",
        group: "uwb",
        name: "originLon",
    },
    ParamEntry {
        id: "UWB_ORG_ALT",
        group: "uwb",
        name: "originAlt",
    },
    ParamEntry {
        id: "UWB_MAV_SYS",
        group: "uwb",
        name: "mavlinkTargetSystemId",
    },
    ParamEntry {
        id: "UWB_OUT",
        group: "uwb",
        name: "outputBackend",
    },
    ParamEntry {
        id: "UWB_ROT_DEG",
        group: "uwb",
        name: "rotationDegrees",
    },
    ParamEntry {
        id: "UWB_Z_MODE",
        group: "uwb",
        name: "zCalcMode",
    },
    ParamEntry {
        id: "UWB_BCN_BIAS",
        group: "uwb",
        name: "rtlsBeaconAgeBiasMs",
    },
    ParamEntry {
        id: "UWB_BCN_SIG",
        group: "uwb",
        name: "rtlsBeaconTdoaSigmaFloorM",
    },
    ParamEntry {
        id: "UWB_BCN_GUARD",
        group: "uwb",
        name: "rtlsBeaconTdoaPhysicalGuardEnable",
    },
    ParamEntry {
        id: "UWB_BCN_GMRGN",
        group: "uwb",
        name: "rtlsBeaconTdoaPhysicalGuardMarginM",
    },
    ParamEntry {
        id: "UWB_RF_EN",
        group: "uwb",
        name: "rfForwardEnable",
    },
    ParamEntry {
        id: "UWB_RF_ID",
        group: "uwb",
        name: "rfForwardSensorId",
    },
    ParamEntry {
        id: "UWB_RF_ORIENT",
        group: "uwb",
        name: "rfForwardOrientation",
    },
    ParamEntry {
        id: "UWB_RF_SRCID",
        group: "uwb",
        name: "rfForwardPreserveSrcIds",
    },
    ParamEntry {
        id: "UWB_COV_EN",
        group: "uwb",
        name: "enableCovMatrix",
    },
    ParamEntry {
        id: "UWB_RMSE",
        group: "uwb",
        name: "rmseThreshold",
    },
    ParamEntry {
        id: "UWB_EST_2D",
        group: "uwb",
        name: "use2DEstimator",
    },
    ParamEntry {
        id: "UWB_EST_MODE",
        group: "uwb",
        name: "tdoaEstimatorMode",
    },
    ParamEntry {
        id: "UWB_EST_DIAG",
        group: "uwb",
        name: "tdoaEstimatorDiag",
    },
    ParamEntry {
        id: "UWB_CHAN",
        group: "uwb",
        name: "channel",
    },
    ParamEntry {
        id: "UWB_DW_MODE",
        group: "uwb",
        name: "dwMode",
    },
    ParamEntry {
        id: "UWB_TX_PWR",
        group: "uwb",
        name: "txPowerLevel",
    },
    ParamEntry {
        id: "UWB_SMARTPWR",
        group: "uwb",
        name: "smartPowerEnable",
    },
    ParamEntry {
        id: "UWB_SLOT_CNT",
        group: "uwb",
        name: "tdoaSlotCount",
    },
    ParamEntry {
        id: "UWB_SLOT_US",
        group: "uwb",
        name: "tdoaSlotDurationUs",
    },
    ParamEntry {
        id: "UWB_ATLM_EN",
        group: "uwb",
        name: "tdoaAnchorTelemetryEnable",
    },
    ParamEntry {
        id: "UWB_ATLM_MS",
        group: "uwb",
        name: "tdoaAnchorTelemetryIntervalMs",
    },
    ParamEntry {
        id: "UWB_ATLM_PORT",
        group: "uwb",
        name: "tdoaAnchorTelemetryPort",
    },
    ParamEntry {
        id: "UWB_MATCH_POL",
        group: "uwb",
        name: "tdoaMatcherPolicy",
    },
    ParamEntry {
        id: "UWB_DYN_EN",
        group: "uwb",
        name: "dynamicAnchorPosEnabled",
    },
    ParamEntry {
        id: "UWB_LAYOUT",
        group: "uwb",
        name: "anchorLayout",
    },
    ParamEntry {
        id: "UWB_HEIGHT",
        group: "uwb",
        name: "anchorHeight",
    },
    ParamEntry {
        id: "UWB_PLANE_SEP",
        group: "uwb",
        name: "anchorPlaneSeparation",
    },
    ParamEntry {
        id: "UWB_LOCK_MASK",
        group: "uwb",
        name: "anchorPosLocked",
    },
    ParamEntry {
        id: "UWB_AVG_SAMP",
        group: "uwb",
        name: "distanceAvgSamples",
    },
    ParamEntry {
        id: "UWB_AMOD_MODE",
        group: "uwb",
        name: "tdoaAnchorModelMode",
    },
    ParamEntry {
        id: "UWB_AMOD_START",
        group: "uwb",
        name: "tdoaAnchorModelStartupCollect",
    },
    ParamEntry {
        id: "UWB_AMOD_WINMS",
        group: "uwb",
        name: "tdoaAnchorModelCollectWindowMs",
    },
    ParamEntry {
        id: "UWB_AMOD_MIN",
        group: "uwb",
        name: "tdoaAnchorModelMinSamplesPerPair",
    },
    ParamEntry {
        id: "UWB_AMOD_DOM",
        group: "uwb",
        name: "tdoaAnchorModelDomain",
    },
    ParamEntry {
        id: "UWB_AMOD_HTHR",
        group: "uwb",
        name: "tdoaAnchorModelHealthThresholdTicks",
    },
    ParamEntry {
        id: "UWB_AMOD_HWIN",
        group: "uwb",
        name: "tdoaAnchorModelHealthWindow",
    },
    ParamEntry {
        id: "UWB_AMOD_HQ",
        group: "uwb",
        name: "tdoaAnchorModelHealthQuorum",
    },
];

pub fn find_by_legacy_name(group: &str, name: &str) -> Option<&'static ParamEntry> {
    PARAMS
        .iter()
        .find(|entry| entry.group == group && entry.name == name)
}

pub fn find_by_id(id: &str) -> Option<&'static ParamEntry> {
    PARAMS.iter().find(|entry| entry.id == id)
}
