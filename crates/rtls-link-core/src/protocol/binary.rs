//! RTLS-Link binary protocol decoder.

use serde_json::{json, Map, Number, Value};

use crate::error::{CoreError, DeviceError};
use crate::types::{LogLevel, LogMessage};

pub const FRAME_MAGIC: u16 = 0x4c52;
pub const FRAME_VERSION: u8 = 1;
pub const HEADER_SIZE: usize = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameType {
    CommandAck = 1,
    FirmwareInfo = 2,
    TdoaDistances = 3,
    ConfigList = 4,
    ConfigSnapshot = 5,
    LedState = 6,
    Heartbeat = 16,
    LogMessage = 17,
    TdoaEstimatorStatus = 32,
    TdoaAnchorStats = 33,
    TdoaPositionEstimatorStatus = 34,
}

#[derive(Debug, Clone)]
pub struct BinaryFrame<'a> {
    pub frame_type: u8,
    pub status: u8,
    pub payload: &'a [u8],
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn u8(&mut self) -> Result<u8, String> {
        if self.pos >= self.data.len() {
            return Err("Unexpected end of frame".to_string());
        }
        let value = self.data[self.pos];
        self.pos += 1;
        Ok(value)
    }

    fn u16(&mut self) -> Result<u16, String> {
        let lo = self.u8()? as u16;
        let hi = self.u8()? as u16;
        Ok(lo | (hi << 8))
    }

    fn u32(&mut self) -> Result<u32, String> {
        let b0 = self.u8()? as u32;
        let b1 = self.u8()? as u32;
        let b2 = self.u8()? as u32;
        let b3 = self.u8()? as u32;
        Ok(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24))
    }

    fn i32(&mut self) -> Result<i32, String> {
        Ok(self.u32()? as i32)
    }

    fn bool(&mut self) -> Result<bool, String> {
        Ok(self.u8()? != 0)
    }

    fn bytes(&mut self, len: usize) -> Result<&'a [u8], String> {
        if self.pos + len > self.data.len() {
            return Err("Unexpected end of frame".to_string());
        }
        let out = &self.data[self.pos..self.pos + len];
        self.pos += len;
        Ok(out)
    }

    fn string(&mut self) -> Result<String, String> {
        let len = self.u16()? as usize;
        let bytes = self.bytes(len)?;
        Ok(String::from_utf8_lossy(bytes).to_string())
    }
}

pub fn parse_frame(data: &[u8]) -> Result<BinaryFrame<'_>, String> {
    if data.len() < HEADER_SIZE {
        return Err("Frame too short".to_string());
    }
    let magic = u16::from_le_bytes([data[0], data[1]]);
    if magic != FRAME_MAGIC {
        return Err("Invalid frame magic".to_string());
    }
    if data[2] != FRAME_VERSION {
        return Err(format!("Unsupported frame version {}", data[2]));
    }
    let payload_len = u16::from_le_bytes([data[4], data[5]]) as usize;
    if HEADER_SIZE + payload_len > data.len() {
        return Err("Frame length exceeds packet size".to_string());
    }
    Ok(BinaryFrame {
        frame_type: data[3],
        status: data[8],
        payload: &data[HEADER_SIZE..HEADER_SIZE + payload_len],
    })
}

pub fn decode_command_frame(data: &[u8], device_ip: &str) -> Result<Value, CoreError> {
    let frame = parse_frame(data).map_err(|e| {
        CoreError::Device(DeviceError::InvalidResponse {
            ip: device_ip.to_string(),
            message: e,
        })
    })?;

    let value = match frame.frame_type {
        x if x == FrameType::CommandAck as u8 => decode_ack(frame)?,
        x if x == FrameType::FirmwareInfo as u8 => decode_firmware_info(frame.payload)?,
        x if x == FrameType::TdoaDistances as u8 => decode_tdoa_distances(frame)?,
        x if x == FrameType::ConfigList as u8 => decode_config_list(frame.payload)?,
        x if x == FrameType::ConfigSnapshot as u8 => decode_config_snapshot(frame.payload)?,
        x if x == FrameType::LedState as u8 => decode_led_state(frame)?,
        x if x == FrameType::TdoaEstimatorStatus as u8 => decode_tdoa_estimator_status(frame)?,
        x if x == FrameType::TdoaAnchorStats as u8 => decode_tdoa_anchor_stats(frame)?,
        x if x == FrameType::TdoaPositionEstimatorStatus as u8 => {
            decode_tdoa_position_estimator_status(frame)?
        }
        _ => {
            return Err(CoreError::Device(DeviceError::InvalidResponse {
                ip: device_ip.to_string(),
                message: format!("Unsupported binary frame type {}", frame.frame_type),
            }));
        }
    };

    Ok(value)
}

fn decode_ack(frame: BinaryFrame<'_>) -> Result<Value, CoreError> {
    let mut r = Reader::new(frame.payload);
    let message = r.string().unwrap_or_default();
    Ok(json!({
        "success": frame.status == 0,
        "error": if frame.status == 0 { Value::Null } else { Value::String(message.clone()) },
        "message": message,
    }))
}

fn decode_firmware_info(payload: &[u8]) -> Result<Value, CoreError> {
    let mut r = Reader::new(payload);
    Ok(json!({
        "device": r.string().map_err(CoreError::Other)?,
        "version": r.string().map_err(CoreError::Other)?,
        "board": r.string().map_err(CoreError::Other)?,
        "buildDate": r.string().map_err(CoreError::Other)?,
        "buildTime": r.string().map_err(CoreError::Other)?,
    }))
}

fn decode_tdoa_distances(frame: BinaryFrame<'_>) -> Result<Value, CoreError> {
    if frame.status != 0 {
        return decode_ack(frame);
    }
    let mut r = Reader::new(frame.payload);
    let anchor_id = r.u8().map_err(CoreError::Other)?;
    let active_slots = r.u8().map_err(CoreError::Other)?;
    let antenna_delay = r.u16().map_err(CoreError::Other)?;
    let mut distances = Vec::with_capacity(8);
    for _ in 0..8 {
        distances.push(r.u16().map_err(CoreError::Other)?);
    }
    Ok(json!({
        "anchorId": anchor_id,
        "activeSlots": active_slots,
        "antennaDelay": antenna_delay,
        "distances": distances,
    }))
}

fn decode_tdoa_anchor_stats(frame: BinaryFrame<'_>) -> Result<Value, CoreError> {
    if frame.status != 0 {
        return decode_ack(frame);
    }

    let mut r = Reader::new(frame.payload);
    let version = r.u8().map_err(CoreError::Other)?;
    let anchor_id = r.u8().map_err(CoreError::Other)?;
    let active_slots = r.u8().map_err(CoreError::Other)?;
    let state_id = r.u8().map_err(CoreError::Other)?;
    let slot_state_id = r.u8().map_err(CoreError::Other)?;
    let slot = r.u8().map_err(CoreError::Other)?;
    let next_slot = r.u8().map_err(CoreError::Other)?;
    let tx_enabled = r.bool().map_err(CoreError::Other)?;
    let antenna_delay = r.u16().map_err(CoreError::Other)?;
    let slot_duration_us = r.u32().map_err(CoreError::Other)?;
    let frame_duration_us = r.u32().map_err(CoreError::Other)?;
    let slot0_miss_streak = r.u8().map_err(CoreError::Other)?;
    let slot0_misses = r.u32().map_err(CoreError::Other)?;
    let sync_acquisitions = r.u32().map_err(CoreError::Other)?;
    let sync_losses = r.u32().map_err(CoreError::Other)?;
    let resyncs = r.u32().map_err(CoreError::Other)?;
    let stall_resets = r.u32().map_err(CoreError::Other)?;
    let tx_scheduled = r.u32().map_err(CoreError::Other)?;
    let tx_done = r.u32().map_err(CoreError::Other)?;
    let timing = if version >= 2 {
        json!({
            "irqCount": r.u32().map_err(CoreError::Other)?,
            "irqToServiceLastUs": r.u32().map_err(CoreError::Other)?,
            "irqToServiceMaxUs": r.u32().map_err(CoreError::Other)?,
            "dwHandleInterruptLastUs": r.u32().map_err(CoreError::Other)?,
            "dwHandleInterruptMaxUs": r.u32().map_err(CoreError::Other)?,
            "uwbHardPathLastUs": r.u32().map_err(CoreError::Other)?,
            "uwbHardPathMaxUs": r.u32().map_err(CoreError::Other)?,
            "slotSlackMinUs": r.u32().map_err(CoreError::Other)?,
            "rxArmLateCount": r.u32().map_err(CoreError::Other)?,
            "txArmLateCount": r.u32().map_err(CoreError::Other)?,
            "missedDeadlineCount": r.u32().map_err(CoreError::Other)?,
            "guardedTxCount": r.u32().map_err(CoreError::Other)?,
            "lastDwStatusBeforeStall": r.u32().map_err(CoreError::Other)?,
        })
    } else {
        json!({
            "irqCount": 0,
            "irqToServiceLastUs": 0,
            "irqToServiceMaxUs": 0,
            "dwHandleInterruptLastUs": 0,
            "dwHandleInterruptMaxUs": 0,
            "uwbHardPathLastUs": 0,
            "uwbHardPathMaxUs": 0,
            "slotSlackMinUs": 0,
            "rxArmLateCount": 0,
            "txArmLateCount": 0,
            "missedDeadlineCount": 0,
            "guardedTxCount": 0,
            "lastDwStatusBeforeStall": 0,
        })
    };
    let slot_count = r.u8().map_err(CoreError::Other)? as usize;

    let mut packet_ids = Vec::with_capacity(slot_count);
    for _ in 0..slot_count {
        packet_ids.push(r.u8().map_err(CoreError::Other)?);
    }

    let mut distances = Vec::with_capacity(slot_count);
    for _ in 0..slot_count {
        distances.push(r.u16().map_err(CoreError::Other)?);
    }

    let mut slots = Vec::with_capacity(slot_count);
    for slot_index in 0..slot_count {
        slots.push(json!({
            "slot": slot_index,
            "goodRx": r.u32().map_err(CoreError::Other)?,
            "rxTimeout": r.u32().map_err(CoreError::Other)?,
            "rxFailed": r.u32().map_err(CoreError::Other)?,
            "unexpectedPacket": r.u32().map_err(CoreError::Other)?,
            "validDistance": r.u32().map_err(CoreError::Other)?,
            "invalidDistance": r.u32().map_err(CoreError::Other)?,
            "packetIdMismatch": r.u32().map_err(CoreError::Other)?,
        }));
    }

    Ok(json!({
        "version": version,
        "anchorId": anchor_id,
        "activeSlots": active_slots,
        "state": match state_id {
            2 => "synchronized",
            1 => "sync_time",
            _ => "sync_tdma",
        },
        "stateId": state_id,
        "slotState": match slot_state_id {
            1 => "tx_done",
            _ => "rx_done",
        },
        "slotStateId": slot_state_id,
        "slot": slot,
        "nextSlot": next_slot,
        "txEnabled": tx_enabled,
        "antennaDelay": antenna_delay,
        "slotDurationUs": slot_duration_us,
        "frameDurationUs": frame_duration_us,
        "sync": {
            "slot0MissStreak": slot0_miss_streak,
            "slot0Misses": slot0_misses,
            "acquisitions": sync_acquisitions,
            "losses": sync_losses,
            "resyncs": resyncs,
            "stallResets": stall_resets,
        },
        "tx": {
            "scheduled": tx_scheduled,
            "done": tx_done,
        },
        "timing": timing,
        "packetIds": packet_ids,
        "distances": distances,
        "slots": slots,
    }))
}

fn mode_name(mode: u8) -> &'static str {
    match mode {
        0 => "legacy_3d",
        1 => "robust_3d",
        2 => "compare",
        255 => "two_d",
        _ => "unknown",
    }
}

fn decode_tdoa_position_estimator_status(frame: BinaryFrame<'_>) -> Result<Value, CoreError> {
    if frame.status != 0 {
        return decode_ack(frame);
    }

    let mut r = Reader::new(frame.payload);
    let mode = r.u8().map_err(CoreError::Other)?;
    let diag_level = r.u8().map_err(CoreError::Other)?;
    let flags = r.u8().map_err(CoreError::Other)?;
    let input_rows = r.u8().map_err(CoreError::Other)?;
    let selected_rows = r.u8().map_err(CoreError::Other)?;
    let unique_anchors = r.u8().map_err(CoreError::Other)?;
    let iterations = r.u8().map_err(CoreError::Other)?;
    let _reserved = r.u8().map_err(CoreError::Other)?;
    let samples_sent = r.u32().map_err(CoreError::Other)?;
    let samples_rejected = r.u32().map_err(CoreError::Other)?;
    let reject_rmse = r.u32().map_err(CoreError::Other)?;
    let reject_nan = r.u32().map_err(CoreError::Other)?;
    let reject_insufficient = r.u32().map_err(CoreError::Other)?;
    let stale_removed = r.u32().map_err(CoreError::Other)?;
    let producer_dropped = r.u32().map_err(CoreError::Other)?;
    let solve_count = r.u32().map_err(CoreError::Other)?;
    let solve_min_us = r.u32().map_err(CoreError::Other)?;
    let solve_avg_us = r.u32().map_err(CoreError::Other)?;
    let solve_max_us = r.u32().map_err(CoreError::Other)?;
    let solve_us = r.u32().map_err(CoreError::Other)?;
    let legacy_solve_us = r.u32().map_err(CoreError::Other)?;
    let robust_solve_us = r.u32().map_err(CoreError::Other)?;
    let rmse_mm = r.u32().map_err(CoreError::Other)?;
    let residual_scale_mm = r.u32().map_err(CoreError::Other)?;
    let x_mm = r.i32().map_err(CoreError::Other)?;
    let y_mm = r.i32().map_err(CoreError::Other)?;
    let z_mm = r.i32().map_err(CoreError::Other)?;
    let compare_runs = r.u32().map_err(CoreError::Other)?;
    let compare_fallback_legacy = r.u32().map_err(CoreError::Other)?;
    let compare_robust_invalid = r.u32().map_err(CoreError::Other)?;
    let legacy_rmse_mm = r.u32().map_err(CoreError::Other)?;
    let robust_rmse_mm = r.u32().map_err(CoreError::Other)?;
    let compare_delta_mm = r.u32().map_err(CoreError::Other)?;
    let diag_count = r.u8().map_err(CoreError::Other)? as usize;

    let mut rows = Vec::with_capacity(diag_count);
    for _ in 0..diag_count {
        let anchor_a = r.u8().map_err(CoreError::Other)?;
        let anchor_b = r.u8().map_err(CoreError::Other)?;
        let residual_mm = r.i32().map_err(CoreError::Other)?;
        let base_weight_q8 = r.u8().map_err(CoreError::Other)?;
        let final_weight_q8 = r.u8().map_err(CoreError::Other)?;
        rows.push(json!({
            "pair": format!("{}{}", anchor_a, anchor_b),
            "anchorA": anchor_a,
            "anchorB": anchor_b,
            "residualM": residual_mm as f64 / 1000.0,
            "baseWeight": base_weight_q8 as f64 / 255.0,
            "finalWeight": final_weight_q8 as f64 / 255.0,
        }));
    }

    Ok(json!({
        "mode": mode_name(mode),
        "modeId": mode,
        "diagLevel": diag_level,
        "flags": flags,
        "accepted": (flags & (1 << 0)) != 0,
        "robustPass": (flags & (1 << 1)) != 0,
        "pairSelection": (flags & (1 << 2)) != 0,
        "compareMode": (flags & (1 << 3)) != 0,
        "fallbackLegacy": (flags & (1 << 4)) != 0,
        "covarianceSent": (flags & (1 << 5)) != 0,
        "covarianceInvalid": (flags & (1 << 6)) != 0,
        "robustInvalid": (flags & (1 << 7)) != 0,
        "inputRows": input_rows,
        "selectedRows": selected_rows,
        "uniqueAnchors": unique_anchors,
        "iterations": iterations,
        "counts": {
            "sent": samples_sent,
            "rejected": samples_rejected,
            "rejectRmse": reject_rmse,
            "rejectNan": reject_nan,
            "rejectInsufficient": reject_insufficient,
            "staleRemoved": stale_removed,
            "producerDropped": producer_dropped,
            "compareRuns": compare_runs,
            "compareFallbackLegacy": compare_fallback_legacy,
            "compareRobustInvalid": compare_robust_invalid,
        },
        "timing": {
            "solveCount": solve_count,
            "minUs": solve_min_us,
            "avgUs": solve_avg_us,
            "maxUs": solve_max_us,
            "lastUs": solve_us,
            "legacyUs": legacy_solve_us,
            "robustUs": robust_solve_us,
        },
        "position": {
            "x": x_mm as f64 / 1000.0,
            "y": y_mm as f64 / 1000.0,
            "z": z_mm as f64 / 1000.0,
        },
        "rmseM": rmse_mm as f64 / 1000.0,
        "residualScaleM": residual_scale_mm as f64 / 1000.0,
        "compare": {
            "legacyRmseM": legacy_rmse_mm as f64 / 1000.0,
            "robustRmseM": robust_rmse_mm as f64 / 1000.0,
            "positionDeltaM": compare_delta_mm as f64 / 1000.0,
        },
        "rows": rows,
    }))
}

fn decode_config_list(payload: &[u8]) -> Result<Value, CoreError> {
    let mut r = Reader::new(payload);
    let active_config = r.string().map_err(CoreError::Other)?;
    let count = r.u8().map_err(CoreError::Other)?;
    let mut configs = Vec::with_capacity(count as usize);
    for _ in 0..count {
        configs.push(json!({ "name": r.string().map_err(CoreError::Other)? }));
    }
    Ok(json!({
        "activeConfig": active_config,
        "configs": configs,
    }))
}

fn parse_value(raw: String, numeric: bool) -> Value {
    if numeric {
        if let Ok(v) = raw.parse::<i64>() {
            return Value::Number(Number::from(v));
        }
        if let Ok(v) = raw.parse::<f64>() {
            if let Some(n) = Number::from_f64(v) {
                return Value::Number(n);
            }
        }
    }
    Value::String(raw)
}

fn decode_config_snapshot(payload: &[u8]) -> Result<Value, CoreError> {
    let mut r = Reader::new(payload);
    let group_count = r.u16().map_err(CoreError::Other)?;
    let mut root = Map::new();

    for _ in 0..group_count {
        let group = r.string().map_err(CoreError::Other)?;
        let param_count = r.u16().map_err(CoreError::Other)?;
        let mut params = Map::new();
        for _ in 0..param_count {
            let name = r.string().map_err(CoreError::Other)?;
            let numeric = r.u8().map_err(CoreError::Other)? != 0;
            let value = r.string().map_err(CoreError::Other)?;
            params.insert(name, parse_value(value, numeric));
        }
        root.insert(group, Value::Object(params));
    }

    Ok(Value::Object(root))
}

fn decode_led_state(frame: BinaryFrame<'_>) -> Result<Value, CoreError> {
    let mut r = Reader::new(frame.payload);
    let configured = r.bool().map_err(CoreError::Other)?;
    let state = r.bool().map_err(CoreError::Other)?;
    Ok(json!({
        "success": frame.status == 0,
        "configured": configured,
        "led2State": state,
        "state": state,
    }))
}

fn decode_tdoa_estimator_status(frame: BinaryFrame<'_>) -> Result<Value, CoreError> {
    if frame.status != 0 {
        return decode_ack(frame);
    }

    let mut r = Reader::new(frame.payload);
    let view = r.u8().map_err(CoreError::Other)?;
    let mode = r.u8().map_err(CoreError::Other)?;
    let domain = r.u8().map_err(CoreError::Other)?;
    let flags = r.u16().map_err(CoreError::Other)?;
    let version = r.u32().map_err(CoreError::Other)?;
    let collect_state = r.u8().map_err(CoreError::Other)?;
    let elapsed_ms = r.u32().map_err(CoreError::Other)?;
    let window_ms = r.u32().map_err(CoreError::Other)?;
    let min_samples_per_pair = r.u16().map_err(CoreError::Other)?;
    let healthy_pairs = r.u8().map_err(CoreError::Other)?;
    let last_error = r.string().map_err(CoreError::Other)?;
    let pair_count = r.u8().map_err(CoreError::Other)?;
    let mut pairs = Vec::with_capacity(pair_count as usize);

    for _ in 0..pair_count {
        let a = r.u8().map_err(CoreError::Other)?;
        let b = r.u8().map_err(CoreError::Other)?;
        let samples = r.u16().map_err(CoreError::Other)?;
        let total = r.u32().map_err(CoreError::Other)?;
        let locked_tof = r.u16().map_err(CoreError::Other)?;
        let mad = r.u16().map_err(CoreError::Other)?;
        let pair_flags = r.u8().map_err(CoreError::Other)?;
        let residual_count = r.u16().map_err(CoreError::Other)?;
        let residual_bad = r.u16().map_err(CoreError::Other)?;
        let residual_max = r.u32().map_err(CoreError::Other)?;

        pairs.push(json!({
            "pair": format!("{}{}", a, b),
            "samples": samples,
            "total": total,
            "locked": if (pair_flags & (1 << 0)) != 0 { json!(locked_tof) } else { Value::Null },
            "mad": mad,
            "healthy": (pair_flags & (1 << 1)) != 0,
            "residualCount": residual_count,
            "residualBad": residual_bad,
            "residualMax": residual_max,
        }));
    }

    let domain_name = match domain {
        1 => "propagation",
        _ => "raw_effective",
    };

    Ok(match view {
        1 => json!({
            "state": collect_state,
            "elapsedMs": elapsed_ms,
            "windowMs": window_ms,
            "minSamplesPerPair": min_samples_per_pair,
            "domain": domain_name,
            "pairs": pairs,
        }),
        2 => json!({
            "version": version,
            "persisted": (flags & (1 << 1)) != 0,
            "domain": domain_name,
            "locked": (flags & (1 << 0)) != 0,
            "pairs": pairs,
        }),
        _ => json!({
            "mode": match mode {
                1 => "monitor",
                2 => "locked_anchor_model",
                _ => "off",
            },
            "locked": (flags & (1 << 0)) != 0,
            "domain": domain_name,
            "version": version,
            "persisted": (flags & (1 << 1)) != 0,
            "collectState": collect_state,
            "fallbackActive": (flags & (1 << 2)) != 0,
            "healthyPairs": healthy_pairs,
            "lastError": last_error,
            "pairs": pairs,
        }),
    })
}

pub fn decode_heartbeat(data: &[u8]) -> Result<Value, String> {
    let frame = parse_frame(data)?;
    if frame.frame_type != FrameType::Heartbeat as u8 {
        return Err("Not a heartbeat frame".to_string());
    }

    let mut r = Reader::new(frame.payload);
    let role = r.u8()?;
    let flags = r.u16()?;
    let anchors_seen = r.u8()?;
    let mav_sysid = r.u8()?;
    let avg_rate = r.u16()?;
    let min_rate = r.u16()?;
    let max_rate = r.u16()?;
    let log_level = r.u8()?;
    let log_udp_port = r.u16()?;
    let mac = r.bytes(6)?;
    let ip = r.bytes(4)?;
    let device = r.string()?;
    let id = r.string()?;
    let uwb_short = r.string()?;
    let fw = r.string()?;
    let dynamic_count = r.u8()?;
    let mut dynamic_anchors = Vec::with_capacity(dynamic_count as usize);
    for _ in 0..dynamic_count {
        dynamic_anchors.push(json!({
            "id": r.u8()?,
            "x": r.i32()? as f64 / 1000.0,
            "y": r.i32()? as f64 / 1000.0,
            "z": r.i32()? as f64 / 1000.0,
        }));
    }

    Ok(json!({
        "device": device,
        "id": id,
        "role": match role {
            3 => "anchor_tdoa",
            4 => "tag_tdoa",
            _ => "unknown",
        },
        "ip": format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]),
        "mac": format!("{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]),
        "uwb_short": uwb_short,
        "mav_sysid": mav_sysid,
        "fw": fw,
        "sending_pos": (flags & (1 << 0)) != 0,
        "origin_sent": (flags & (1 << 1)) != 0,
        "rf_enabled": (flags & (1 << 2)) != 0,
        "rf_healthy": (flags & (1 << 3)) != 0,
        "uwb_enabled": (flags & (1 << 4)) != 0,
        "rf_forward_enabled": (flags & (1 << 5)) != 0,
        "log_serial_enabled": (flags & (1 << 6)) != 0,
        "log_udp_enabled": (flags & (1 << 7)) != 0,
        "dynamic_anchors_enabled": (flags & (1 << 8)) != 0,
        "anchors_seen": anchors_seen,
        "avg_rate_cHz": avg_rate,
        "min_rate_cHz": min_rate,
        "max_rate_cHz": max_rate,
        "log_level": log_level,
        "log_udp_port": log_udp_port,
        "dyn_anchors": dynamic_anchors,
    }))
}

pub fn decode_log_message(data: &[u8], ip: &str) -> Result<LogMessage, String> {
    let frame = parse_frame(data)?;
    if frame.frame_type != FrameType::LogMessage as u8 {
        return Err("Not a log message frame".to_string());
    }

    let mut r = Reader::new(frame.payload);
    Ok(LogMessage {
        ip: ip.to_string(),
        timestamp: Some(r.u32()? as u64),
        level: LogLevel::from_u8(r.u8()?),
        tag: r.string()?,
        message: r.string()?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_u16(out: &mut Vec<u8>, value: u16) {
        out.extend_from_slice(&value.to_le_bytes());
    }

    fn push_u32(out: &mut Vec<u8>, value: u32) {
        out.extend_from_slice(&value.to_le_bytes());
    }

    fn push_i32(out: &mut Vec<u8>, value: i32) {
        out.extend_from_slice(&value.to_le_bytes());
    }

    fn push_string(out: &mut Vec<u8>, value: &str) {
        push_u16(out, value.len() as u16);
        out.extend_from_slice(value.as_bytes());
    }

    fn frame(frame_type: FrameType, payload: Vec<u8>) -> Vec<u8> {
        let mut out = Vec::new();
        push_u16(&mut out, FRAME_MAGIC);
        out.push(FRAME_VERSION);
        out.push(frame_type as u8);
        push_u16(&mut out, payload.len() as u16);
        push_u16(&mut out, 7);
        out.push(0);
        out.push(0);
        out.extend_from_slice(&payload);
        out
    }

    #[test]
    fn decodes_tdoa_distances_frame() {
        let mut payload = vec![2, 4];
        push_u16(&mut payload, 16580);
        for i in 0..8 {
            push_u16(&mut payload, 100 + i);
        }

        let value = decode_command_frame(&frame(FrameType::TdoaDistances, payload), "1.2.3.4")
            .expect("frame decodes");

        assert_eq!(value["anchorId"], 2);
        assert_eq!(value["activeSlots"], 4);
        assert_eq!(value["antennaDelay"], 16580);
        assert_eq!(value["distances"][7], 107);
    }

    #[test]
    fn decodes_tdoa_anchor_stats_frame() {
        let mut payload = vec![1, 2, 4, 2, 0, 1, 2, 1];
        push_u16(&mut payload, 16477);
        push_u32(&mut payload, 2101);
        push_u32(&mut payload, 8404);
        payload.push(1);
        push_u32(&mut payload, 3);
        push_u32(&mut payload, 4);
        push_u32(&mut payload, 1);
        push_u32(&mut payload, 2);
        push_u32(&mut payload, 1);
        push_u32(&mut payload, 100);
        push_u32(&mut payload, 99);
        payload.push(4);
        payload.extend_from_slice(&[10, 11, 12, 13]);
        for i in 0..4 {
            push_u16(&mut payload, 33000 + i);
        }
        for i in 0..4 {
            push_u32(&mut payload, 20 + i);
            push_u32(&mut payload, 1);
            push_u32(&mut payload, 2);
            push_u32(&mut payload, 3);
            push_u32(&mut payload, 4);
            push_u32(&mut payload, 5);
            push_u32(&mut payload, 6);
        }

        let value = decode_command_frame(&frame(FrameType::TdoaAnchorStats, payload), "1.2.3.4")
            .expect("frame decodes");

        assert_eq!(value["version"], 1);
        assert_eq!(value["anchorId"], 2);
        assert_eq!(value["state"], "synchronized");
        assert_eq!(value["txEnabled"], true);
        assert_eq!(value["sync"]["slot0Misses"], 3);
        assert_eq!(value["tx"]["done"], 99);
        assert_eq!(value["packetIds"][2], 12);
        assert_eq!(value["packetIds"].as_array().unwrap().len(), 4);
        assert_eq!(value["distances"][3], 33003);
        assert_eq!(value["slots"].as_array().unwrap().len(), 4);
        assert_eq!(value["slots"][3]["goodRx"], 23);
        assert_eq!(value["slots"][3]["packetIdMismatch"], 6);
    }

    #[test]
    fn decodes_binary_heartbeat_frame() {
        let mut payload = Vec::new();
        payload.push(4);
        push_u16(&mut payload, 0b1_1111_1111);
        payload.push(4);
        payload.push(42);
        push_u16(&mut payload, 1234);
        push_u16(&mut payload, 1000);
        push_u16(&mut payload, 1500);
        payload.push(3);
        push_u16(&mut payload, 3334);
        payload.extend_from_slice(&[0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
        payload.extend_from_slice(&[192, 168, 1, 50]);
        push_string(&mut payload, "rtls-link");
        push_string(&mut payload, "4");
        push_string(&mut payload, "4");
        push_string(&mut payload, "1.2.3");
        payload.push(1);
        payload.push(2);
        payload.extend_from_slice(&1234i32.to_le_bytes());
        payload.extend_from_slice(&(-567i32).to_le_bytes());
        payload.extend_from_slice(&0i32.to_le_bytes());

        let value = decode_heartbeat(&frame(FrameType::Heartbeat, payload)).expect("heartbeat");

        assert_eq!(value["role"], "tag_tdoa");
        assert_eq!(value["mav_sysid"], 42);
        assert_eq!(value["mac"], "AA:BB:CC:DD:EE:FF");
        assert_eq!(value["dyn_anchors"][0]["id"], 2);
        assert_eq!(value["dyn_anchors"][0]["x"], 1.234);
        assert_eq!(value["dyn_anchors"][0]["y"], -0.567);
    }

    #[test]
    fn decodes_log_message_frame() {
        let mut payload = Vec::new();
        payload.extend_from_slice(&12345u32.to_le_bytes());
        payload.push(LogLevel::Debug as u8);
        push_string(&mut payload, "uwb");
        push_string(&mut payload, "measurement accepted");

        let log = decode_log_message(&frame(FrameType::LogMessage, payload), "192.168.1.50")
            .expect("log frame");

        assert_eq!(log.ip, "192.168.1.50");
        assert_eq!(log.timestamp, Some(12345));
        assert_eq!(log.level, LogLevel::Debug);
        assert_eq!(log.tag, "uwb");
        assert_eq!(log.message, "measurement accepted");
    }

    #[test]
    fn decodes_tdoa_estimator_status_frame() {
        let mut payload = vec![0, 2, 1];
        push_u16(&mut payload, 0b111);
        payload.extend_from_slice(&9u32.to_le_bytes());
        payload.push(2);
        payload.extend_from_slice(&123u32.to_le_bytes());
        payload.extend_from_slice(&10000u32.to_le_bytes());
        push_u16(&mut payload, 20);
        payload.push(5);
        push_string(&mut payload, "");
        payload.push(1);
        payload.push(1);
        payload.push(2);
        push_u16(&mut payload, 24);
        payload.extend_from_slice(&42u32.to_le_bytes());
        push_u16(&mut payload, 111);
        push_u16(&mut payload, 3);
        payload.push(0b11);
        push_u16(&mut payload, 4);
        push_u16(&mut payload, 1);
        payload.extend_from_slice(&7u32.to_le_bytes());

        let value = decode_command_frame(
            &frame(FrameType::TdoaEstimatorStatus, payload),
            "192.168.1.50",
        )
        .expect("status frame");

        assert_eq!(value["mode"], "locked_anchor_model");
        assert_eq!(value["domain"], "propagation");
        assert_eq!(value["version"], 9);
        assert_eq!(value["fallbackActive"], true);
        assert_eq!(value["pairs"][0]["pair"], "12");
        assert_eq!(value["pairs"][0]["locked"], 111);
        assert_eq!(value["pairs"][0]["residualMax"], 7);
    }

    #[test]
    fn decodes_tdoa_position_estimator_status_frame() {
        let mut payload = vec![2, 2, 0b1111_1111, 15, 12, 8, 4, 0];
        push_u32(&mut payload, 10);
        push_u32(&mut payload, 2);
        push_u32(&mut payload, 1);
        push_u32(&mut payload, 0);
        push_u32(&mut payload, 1);
        push_u32(&mut payload, 3);
        push_u32(&mut payload, 4);
        push_u32(&mut payload, 9);
        push_u32(&mut payload, 120);
        push_u32(&mut payload, 180);
        push_u32(&mut payload, 320);
        push_u32(&mut payload, 440);
        push_u32(&mut payload, 170);
        push_u32(&mut payload, 260);
        push_u32(&mut payload, 91);
        push_u32(&mut payload, 52);
        push_i32(&mut payload, 1234);
        push_i32(&mut payload, -567);
        push_i32(&mut payload, 2100);
        push_u32(&mut payload, 5);
        push_u32(&mut payload, 2);
        push_u32(&mut payload, 3);
        push_u32(&mut payload, 130);
        push_u32(&mut payload, 91);
        push_u32(&mut payload, 42);
        payload.push(1);
        payload.push(2);
        payload.push(7);
        push_i32(&mut payload, -83);
        payload.push(255);
        payload.push(128);

        let value = decode_command_frame(
            &frame(FrameType::TdoaPositionEstimatorStatus, payload),
            "192.168.1.50",
        )
        .expect("position estimator frame");

        assert_eq!(value["mode"], "compare");
        assert_eq!(value["accepted"], true);
        assert_eq!(value["robustPass"], true);
        assert_eq!(value["pairSelection"], true);
        assert_eq!(value["compareMode"], true);
        assert_eq!(value["fallbackLegacy"], true);
        assert_eq!(value["covarianceSent"], true);
        assert_eq!(value["covarianceInvalid"], true);
        assert_eq!(value["robustInvalid"], true);
        assert_eq!(value["inputRows"], 15);
        assert_eq!(value["selectedRows"], 12);
        assert_eq!(value["counts"]["producerDropped"], 4);
        assert_eq!(value["counts"]["compareFallbackLegacy"], 2);
        assert_eq!(value["counts"]["compareRobustInvalid"], 3);
        assert_eq!(value["timing"]["lastUs"], 440);
        assert_eq!(value["timing"]["legacyUs"], 170);
        assert_eq!(value["timing"]["robustUs"], 260);
        assert_eq!(value["position"]["x"], 1.234);
        assert_eq!(value["position"]["y"], -0.567);
        assert_eq!(value["rmseM"], 0.091);
        assert_eq!(value["compare"]["positionDeltaM"], 0.042);
        assert_eq!(value["rows"][0]["pair"], "27");
        assert_eq!(value["rows"][0]["residualM"], -0.083);
        assert_eq!(value["rows"][0]["baseWeight"], 1.0);
    }
}
