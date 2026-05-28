//! UDP MAVLink client for device management.

use std::collections::BTreeMap;
use std::io::Cursor;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;
use tokio::time::{timeout, Instant};

use crate::error::{CoreError, DeviceError};
use crate::mavlink::params;
use crate::mavlink::rtlslink::{
    MavMessage, MavParamExtType, ParamAck, RtlsCommand, RtlsPayloadType, RtlsResult,
    PARAM_EXT_REQUEST_LIST_DATA, PARAM_EXT_REQUEST_READ_DATA, PARAM_EXT_SET_DATA,
    PARAM_EXT_VALUE_DATA, RTLS_COMMAND_DATA,
};
use crate::mavlink::types::CharArray;
use crate::mavlink::{peek_reader::PeekReader, read_v2_msg, write_v2_msg, MavHeader};
use crate::protocol::binary::decode_command_frame;
use crate::protocol::commands::is_structured_response_command;
use crate::protocol::response::is_error_response;

pub const MAVLINK_MANAGEMENT_PORT: u16 = 3333;

const MANAGER_SYSTEM_ID: u8 = 255;
const MANAGER_COMPONENT_ID: u8 = 190;
const TARGET_SYSTEM_BROADCAST: u8 = 0;
const TARGET_COMPONENT_BROADCAST: u8 = 0;
const PARAM_LIST_IDLE_TIMEOUT: Duration = Duration::from_millis(250);

static REQUEST_COUNTER: AtomicU32 = AtomicU32::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCommandResponse {
    pub raw: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub json: Option<serde_json::Value>,
}

fn parse_command_response(
    command: &str,
    raw: String,
    device_ip: &str,
) -> Result<DeviceCommandResponse, CoreError> {
    if is_structured_response_command(command) {
        let json: serde_json::Value =
            crate::protocol::response::parse_json_response(&raw, device_ip)
                .map_err(CoreError::from)?;
        Ok(DeviceCommandResponse {
            raw,
            json: Some(json),
        })
    } else {
        Ok(DeviceCommandResponse { raw, json: None })
    }
}

pub struct DeviceConnection {
    ip: String,
    timeout: Duration,
    socket: UdpSocket,
    sequence: u8,
}

impl DeviceConnection {
    pub async fn connect(ip: &str, cmd_timeout: Duration) -> Result<Self, CoreError> {
        Self::connect_to_port(ip, MAVLINK_MANAGEMENT_PORT, cmd_timeout).await
    }

    async fn connect_to_port(
        ip: &str,
        port: u16,
        cmd_timeout: Duration,
    ) -> Result<Self, CoreError> {
        let target: SocketAddr = format!("{ip}:{port}")
            .parse()
            .map_err(|e| CoreError::Other(format!("Invalid MAVLink target {ip}: {e}")))?;
        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        socket.connect(target).await?;

        Ok(Self {
            ip: ip.to_string(),
            timeout: cmd_timeout,
            socket,
            sequence: 0,
        })
    }

    pub async fn send_raw(&mut self, command: &str) -> Result<String, CoreError> {
        let response = if command.starts_with("readall") {
            self.handle_read_all(command).await?
        } else if command.starts_with("read ") {
            self.handle_read(command).await?
        } else if command.starts_with("write ") {
            self.handle_write(command).await?
        } else {
            self.handle_rtls_command(command).await?
        };

        if let Some(error_msg) = is_error_response(&response) {
            return Err(CoreError::Device(DeviceError::CommandFailed {
                ip: self.ip.clone(),
                message: error_msg,
            }));
        }

        Ok(response)
    }

    pub async fn send(&mut self, command: &str) -> Result<DeviceCommandResponse, CoreError> {
        let raw = self.send_raw(command).await?;
        parse_command_response(command, raw, &self.ip)
    }

    pub async fn send_batch(
        &mut self,
        commands: &[String],
    ) -> Result<Vec<DeviceCommandResponse>, CoreError> {
        let mut responses = Vec::with_capacity(commands.len());
        for cmd in commands {
            responses.push(self.send(cmd).await?);
        }
        Ok(responses)
    }

    async fn handle_read_all(&mut self, command: &str) -> Result<String, CoreError> {
        let tokens = tokenize(command);
        let group = tokens
            .get(1)
            .map(String::as_str)
            .filter(|value| *value != "all");
        let values = self.request_param_list().await?;
        Ok(format_param_list(&values, group))
    }

    async fn handle_read(&mut self, command: &str) -> Result<String, CoreError> {
        let tokens = tokenize(command);
        let group = token_after(&tokens, "-group")
            .or_else(|| token_after(&tokens, "--group"))
            .ok_or_else(|| CoreError::Other("Missing read -group argument".to_string()))?;
        let name = token_after(&tokens, "-name")
            .or_else(|| token_after(&tokens, "--name"))
            .ok_or_else(|| CoreError::Other("Missing read -name argument".to_string()))?;

        let entry = params::find_by_legacy_name(group, name).ok_or_else(|| {
            CoreError::Device(DeviceError::InvalidResponse {
                ip: self.ip.clone(),
                message: format!("Unsupported parameter {group}.{name}"),
            })
        })?;
        let value = self.request_param_value(entry.id).await?;
        Ok(value.value)
    }

    async fn handle_write(&mut self, command: &str) -> Result<String, CoreError> {
        let tokens = tokenize(command);
        let group = token_after(&tokens, "-group")
            .or_else(|| token_after(&tokens, "--group"))
            .ok_or_else(|| CoreError::Other("Missing write -group argument".to_string()))?;
        let name = token_after(&tokens, "-name")
            .or_else(|| token_after(&tokens, "--name"))
            .ok_or_else(|| CoreError::Other("Missing write -name argument".to_string()))?;
        let value = token_after(&tokens, "-data")
            .or_else(|| token_after(&tokens, "--data"))
            .ok_or_else(|| CoreError::Other("Missing write -data argument".to_string()))?;

        let entry = params::find_by_legacy_name(group, name).ok_or_else(|| {
            CoreError::Device(DeviceError::InvalidResponse {
                ip: self.ip.clone(),
                message: format!("Unsupported parameter {group}.{name}"),
            })
        })?;
        self.set_param_value(entry.id, value).await?;
        Ok("OK".to_string())
    }

    async fn handle_rtls_command(&mut self, command: &str) -> Result<String, CoreError> {
        let (command_id, name) = parse_rtls_command(command).map_err(|message| {
            CoreError::Device(DeviceError::CommandFailed {
                ip: self.ip.clone(),
                message,
            })
        })?;
        let request_id = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let name_array = CharArray::<32>::from(name.as_deref().unwrap_or(""));
        let name_len = name
            .as_ref()
            .map(|value| value.as_bytes().len().min(32) as u8)
            .unwrap_or(0);

        self.send_message(MavMessage::RTLS_COMMAND(RTLS_COMMAND_DATA {
            request_id,
            command: command_id,
            name_len,
            name: name_array,
        }))
        .await?;

        let response = self
            .receive_command_response(request_id, command_id)
            .await?;
        match response.payload_type {
            RtlsPayloadType::RTLS_PAYLOAD_TYPE_BINARY_FRAME => {
                let json = decode_command_frame(&response.payload, &self.ip)?;
                Ok(json.to_string())
            }
            RtlsPayloadType::RTLS_PAYLOAD_TYPE_TEXT => {
                let text = String::from_utf8_lossy(&response.payload).to_string();
                if response.result != RtlsResult::RTLS_RESULT_ACCEPTED {
                    return Err(CoreError::Device(DeviceError::CommandFailed {
                        ip: self.ip.clone(),
                        message: text,
                    }));
                }
                Ok(text)
            }
            RtlsPayloadType::RTLS_PAYLOAD_TYPE_NONE => {
                if response.result != RtlsResult::RTLS_RESULT_ACCEPTED {
                    return Err(CoreError::Device(DeviceError::CommandFailed {
                        ip: self.ip.clone(),
                        message: "Command failed".to_string(),
                    }));
                }
                Ok("OK".to_string())
            }
        }
    }

    async fn request_param_value(&mut self, id: &str) -> Result<ParamValue, CoreError> {
        self.send_message(MavMessage::PARAM_EXT_REQUEST_READ(
            PARAM_EXT_REQUEST_READ_DATA {
                target_system: TARGET_SYSTEM_BROADCAST,
                target_component: TARGET_COMPONENT_BROADCAST,
                param_id: CharArray::<16>::from(id),
                param_index: -1,
            },
        ))
        .await?;

        let deadline = Instant::now() + self.timeout;
        loop {
            let message = self.recv_until(deadline).await?;
            match message {
                MavMessage::PARAM_EXT_VALUE(value)
                    if char_array_to_string(&value.param_id) == id =>
                {
                    return Ok(ParamValue::from(value));
                }
                MavMessage::PARAM_EXT_ACK(ack) if char_array_to_string(&ack.param_id) == id => {
                    return Err(CoreError::Device(DeviceError::CommandFailed {
                        ip: self.ip.clone(),
                        message: format!("Parameter {id} read failed: {:?}", ack.param_result),
                    }));
                }
                _ => {}
            }
        }
    }

    async fn request_param_index(&mut self, index: u16) -> Result<ParamValue, CoreError> {
        self.send_message(MavMessage::PARAM_EXT_REQUEST_READ(
            PARAM_EXT_REQUEST_READ_DATA {
                target_system: TARGET_SYSTEM_BROADCAST,
                target_component: TARGET_COMPONENT_BROADCAST,
                param_id: CharArray::<16>::from(""),
                param_index: i16::try_from(index).map_err(|_| {
                    CoreError::Other(format!("Parameter index {index} exceeds MAVLink range"))
                })?,
            },
        ))
        .await?;

        let deadline = Instant::now() + self.timeout;
        loop {
            let message = self.recv_until(deadline).await?;
            if let MavMessage::PARAM_EXT_VALUE(value) = message {
                if value.param_index == index {
                    return Ok(ParamValue::from(value));
                }
            }
        }
    }

    async fn request_param_list(&mut self) -> Result<Vec<ParamValue>, CoreError> {
        self.send_message(MavMessage::PARAM_EXT_REQUEST_LIST(
            PARAM_EXT_REQUEST_LIST_DATA {
                target_system: TARGET_SYSTEM_BROADCAST,
                target_component: TARGET_COMPONENT_BROADCAST,
            },
        ))
        .await?;

        let deadline = Instant::now() + self.timeout;
        let mut idle_deadline: Option<Instant> = None;
        let mut expected_count: Option<usize> = None;
        let mut values = BTreeMap::new();

        loop {
            if let Some(count) = expected_count {
                if values.len() >= count {
                    break;
                }
            }

            let next_deadline = idle_deadline
                .map(|idle| idle.min(deadline))
                .unwrap_or(deadline);
            if Instant::now() >= next_deadline {
                break;
            }

            match self.recv_until(next_deadline).await {
                Ok(MavMessage::PARAM_EXT_VALUE(value)) => {
                    expected_count = Some(value.param_count as usize);
                    idle_deadline = Some(Instant::now() + PARAM_LIST_IDLE_TIMEOUT);
                    values.insert(value.param_index, ParamValue::from(value));
                }
                Ok(_) => {}
                Err(CoreError::Other(message)) if message.contains("timed out") => break,
                Err(err) => return Err(err),
            }
        }

        let expected_count = expected_count.ok_or_else(|| {
            CoreError::Device(DeviceError::InvalidResponse {
                ip: self.ip.clone(),
                message: "Parameter list response did not advertise a count".to_string(),
            })
        })?;

        if values.len() < expected_count {
            let missing_indices = (0..expected_count)
                .filter_map(|index| {
                    let index = u16::try_from(index).ok()?;
                    (!values.contains_key(&index)).then_some(index)
                })
                .collect::<Vec<_>>();

            for index in missing_indices {
                let value = self.request_param_index(index).await?;
                values.insert(index, value);
            }
        }

        if values.len() < expected_count {
            let missing = (0..expected_count)
                .filter_map(|index| {
                    let index = u16::try_from(index).ok()?;
                    (!values.contains_key(&index)).then_some(index.to_string())
                })
                .collect::<Vec<_>>()
                .join(", ");
            return Err(CoreError::Device(DeviceError::InvalidResponse {
                ip: self.ip.clone(),
                message: format!("Incomplete parameter list; missing indices: {missing}"),
            }));
        }

        Ok(values.into_values().collect())
    }

    async fn set_param_value(&mut self, id: &str, value: &str) -> Result<(), CoreError> {
        self.send_message(MavMessage::PARAM_EXT_SET(PARAM_EXT_SET_DATA {
            target_system: TARGET_SYSTEM_BROADCAST,
            target_component: TARGET_COMPONENT_BROADCAST,
            param_id: CharArray::<16>::from(id),
            param_value: CharArray::<128>::from(value),
            param_type: MavParamExtType::MAV_PARAM_EXT_TYPE_CUSTOM,
        }))
        .await?;

        let deadline = Instant::now() + self.timeout;
        loop {
            let message = self.recv_until(deadline).await?;
            if let MavMessage::PARAM_EXT_ACK(ack) = message {
                if char_array_to_string(&ack.param_id) != id {
                    continue;
                }
                if ack.param_result == ParamAck::PARAM_ACK_ACCEPTED {
                    return Ok(());
                }
                return Err(CoreError::Device(DeviceError::CommandFailed {
                    ip: self.ip.clone(),
                    message: format!("Parameter {id} write failed: {:?}", ack.param_result),
                }));
            }
        }
    }

    async fn receive_command_response(
        &mut self,
        request_id: u32,
        command_id: RtlsCommand,
    ) -> Result<CommandResponse, CoreError> {
        let deadline = Instant::now() + self.timeout;
        let mut chunks: Vec<Option<Vec<u8>>> = Vec::new();

        loop {
            let message = self.recv_until(deadline).await?;
            let MavMessage::RTLS_COMMAND_RESPONSE(response) = message else {
                continue;
            };
            if response.request_id != request_id || response.command != command_id {
                continue;
            }

            let result = response.result;
            let payload_type = response.payload_type;
            let chunk_count = response.chunk_count.max(1) as usize;
            if chunks.len() < chunk_count {
                chunks.resize_with(chunk_count, || None);
            }
            let chunk_index = response.chunk_index as usize;
            if chunk_index < chunks.len() {
                let len = (response.payload_len as usize).min(response.payload.len());
                chunks[chunk_index] = Some(response.payload[..len].to_vec());
            }

            if chunks.iter().all(Option::is_some) {
                let payload = chunks.into_iter().flatten().flatten().collect::<Vec<u8>>();
                return Ok(CommandResponse {
                    result,
                    payload_type,
                    payload,
                });
            }
        }
    }

    async fn send_message(&mut self, message: MavMessage) -> Result<(), CoreError> {
        let header = MavHeader {
            system_id: MANAGER_SYSTEM_ID,
            component_id: MANAGER_COMPONENT_ID,
            sequence: self.sequence,
        };
        self.sequence = self.sequence.wrapping_add(1);

        let mut bytes = Vec::new();
        write_v2_msg(&mut bytes, header, &message)
            .map_err(|e| CoreError::Other(format!("MAVLink encode failed: {e}")))?;
        self.socket.send(&bytes).await?;
        Ok(())
    }

    async fn recv_until(&mut self, deadline: Instant) -> Result<MavMessage, CoreError> {
        let now = Instant::now();
        if now >= deadline {
            return Err(CoreError::Other(format!(
                "Command to {} timed out",
                self.ip
            )));
        }

        let mut buf = [0u8; 1500];
        let len = timeout(deadline - now, self.socket.recv(&mut buf))
            .await
            .map_err(|_| CoreError::Other(format!("Command to {} timed out", self.ip)))??;
        parse_datagram(&buf[..len]).map_err(|e| {
            CoreError::Device(DeviceError::InvalidResponse {
                ip: self.ip.clone(),
                message: e,
            })
        })
    }
}

pub async fn send_command(
    ip: &str,
    command: &str,
    cmd_timeout: Duration,
) -> Result<String, CoreError> {
    let mut conn = DeviceConnection::connect(ip, cmd_timeout).await?;
    conn.send_raw(command).await
}

pub async fn send_command_parsed(
    ip: &str,
    command: &str,
    cmd_timeout: Duration,
) -> Result<DeviceCommandResponse, CoreError> {
    let raw = send_command(ip, command, cmd_timeout).await?;
    parse_command_response(command, raw, ip)
}

pub async fn send_commands_parsed(
    ip: &str,
    commands: &[String],
    cmd_timeout: Duration,
) -> Result<Vec<DeviceCommandResponse>, CoreError> {
    let mut conn = DeviceConnection::connect(ip, cmd_timeout).await?;
    conn.send_batch(commands).await
}

pub async fn send_command_with_retry(
    ip: &str,
    command: &str,
    cmd_timeout: Duration,
    max_retries: usize,
) -> Result<String, CoreError> {
    let mut last_error = None;

    for attempt in 0..=max_retries {
        match send_command(ip, command, cmd_timeout).await {
            Ok(response) => return Ok(response),
            Err(e) => {
                last_error = Some(e);
                if attempt < max_retries {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
            }
        }
    }

    Err(last_error.unwrap())
}

pub struct BatchSender {
    timeout: Duration,
    concurrency: usize,
}

impl BatchSender {
    pub fn new(timeout_ms: u64, concurrency: usize) -> Self {
        Self {
            timeout: Duration::from_millis(timeout_ms),
            concurrency: concurrency.max(1),
        }
    }

    pub async fn send_to_all(
        &self,
        ips: &[String],
        command: &str,
    ) -> Vec<(String, Result<String, CoreError>)> {
        stream::iter(ips.iter().cloned())
            .map(|ip| {
                let cmd = command.to_string();
                let timeout = self.timeout;
                async move {
                    let result = send_command(&ip, &cmd, timeout).await;
                    (ip, result)
                }
            })
            .buffer_unordered(self.concurrency)
            .collect()
            .await
    }
}

#[derive(Debug)]
struct ParamValue {
    id: String,
    value: String,
}

impl From<PARAM_EXT_VALUE_DATA> for ParamValue {
    fn from(value: PARAM_EXT_VALUE_DATA) -> Self {
        Self {
            id: char_array_to_string(&value.param_id),
            value: char_array_to_string(&value.param_value),
        }
    }
}

#[derive(Debug)]
struct CommandResponse {
    result: RtlsResult,
    payload_type: RtlsPayloadType,
    payload: Vec<u8>,
}

fn parse_datagram(data: &[u8]) -> Result<MavMessage, String> {
    let cursor = Cursor::new(data);
    let mut reader = PeekReader::new(cursor);
    read_v2_msg::<MavMessage, _>(&mut reader)
        .map(|(_, message)| message)
        .map_err(|e| e.to_string())
}

fn format_param_list(values: &[ParamValue], group_filter: Option<&str>) -> String {
    let mut grouped: BTreeMap<&str, Vec<(&str, &str)>> = BTreeMap::new();
    for value in values {
        let Some(entry) = params::find_by_id(&value.id) else {
            continue;
        };
        if group_filter.is_some_and(|group| group != entry.group) {
            continue;
        }
        grouped
            .entry(entry.group)
            .or_default()
            .push((entry.name, value.value.as_str()));
    }

    let mut out = String::new();
    for (group, values) in grouped {
        out.push('[');
        out.push_str(group);
        out.push_str("]\n");
        for (name, value) in values {
            out.push_str(name);
            out.push('=');
            out.push_str(value);
            out.push('\n');
        }
        out.push('\n');
    }
    out
}

fn parse_rtls_command(command: &str) -> Result<(RtlsCommand, Option<String>), String> {
    let tokens = tokenize(command);
    let Some(name) = tokens.first().map(String::as_str) else {
        return Err("Empty command".to_string());
    };

    let command_id = match name {
        "reboot" => RtlsCommand::RTLS_COMMAND_REBOOT,
        "firmware-info" => RtlsCommand::RTLS_COMMAND_FIRMWARE_INFO,
        "save-config" => RtlsCommand::RTLS_COMMAND_SAVE_CONFIG,
        "load-config" => RtlsCommand::RTLS_COMMAND_LOAD_CONFIG,
        "backup-config" => RtlsCommand::RTLS_COMMAND_BACKUP_CONFIG,
        "list-configs" => RtlsCommand::RTLS_COMMAND_LIST_CONFIGS,
        "toggle-led2" => RtlsCommand::RTLS_COMMAND_TOGGLE_LED2,
        "get-led2-state" => RtlsCommand::RTLS_COMMAND_GET_LED2_STATE,
        "tdoa-distances" => RtlsCommand::RTLS_COMMAND_TDOA_DISTANCES,
        "tdoa-anchor-stats" => RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_STATS,
        "tdoa-anchor-model-reset" => RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_MODEL_RESET,
        "tdoa-anchor-model-collect-start" => {
            RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_MODEL_COLLECT_START
        }
        "tdoa-anchor-model-collect-status" => {
            RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_MODEL_COLLECT_STATUS
        }
        "tdoa-anchor-model-lock" => RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_MODEL_LOCK,
        "tdoa-anchor-model-status" => RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_MODEL_STATUS,
        "tdoa-anchor-model-export" => RtlsCommand::RTLS_COMMAND_TDOA_ANCHOR_MODEL_EXPORT,
        "tdoa-estimator-stats-reset" => RtlsCommand::RTLS_COMMAND_TDOA_ESTIMATOR_STATS_RESET,
        "save-config-as" => RtlsCommand::RTLS_COMMAND_SAVE_CONFIG_AS,
        "load-config-named" => RtlsCommand::RTLS_COMMAND_LOAD_CONFIG_NAMED,
        "read-config-named" => RtlsCommand::RTLS_COMMAND_READ_CONFIG_NAMED,
        "delete-config" => RtlsCommand::RTLS_COMMAND_DELETE_CONFIG,
        _ => return Err(format!("Unsupported MAVLink command: {name}")),
    };

    let named_value = match command_id {
        RtlsCommand::RTLS_COMMAND_SAVE_CONFIG_AS
        | RtlsCommand::RTLS_COMMAND_LOAD_CONFIG_NAMED
        | RtlsCommand::RTLS_COMMAND_READ_CONFIG_NAMED
        | RtlsCommand::RTLS_COMMAND_DELETE_CONFIG => token_after(&tokens, "-name")
            .or_else(|| token_after(&tokens, "--name"))
            .map(str::to_string),
        _ => None,
    };

    Ok((command_id, named_value))
}

fn tokenize(command: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut escaped = false;

    for ch in command.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        match ch {
            '\\' if in_quotes => escaped = true,
            '"' => in_quotes = !in_quotes,
            ch if ch.is_whitespace() && !in_quotes => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn token_after<'a>(tokens: &'a [String], key: &str) -> Option<&'a str> {
    tokens
        .windows(2)
        .find(|pair| pair[0] == key)
        .map(|pair| pair[1].as_str())
}

fn char_array_to_string<const N: usize>(value: &CharArray<N>) -> String {
    value.to_str().unwrap_or("").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_message(message: MavMessage) -> Vec<u8> {
        let mut bytes = Vec::new();
        write_v2_msg(
            &mut bytes,
            MavHeader {
                system_id: 1,
                component_id: 1,
                sequence: 0,
            },
            &message,
        )
        .unwrap();
        bytes
    }

    fn param_value(index: u16, count: u16, id: &str, value: &str) -> MavMessage {
        MavMessage::PARAM_EXT_VALUE(PARAM_EXT_VALUE_DATA {
            param_count: count,
            param_index: index,
            param_id: CharArray::<16>::from(id),
            param_value: CharArray::<128>::from(value),
            param_type: MavParamExtType::MAV_PARAM_EXT_TYPE_CUSTOM,
        })
    }

    #[test]
    fn parse_datagram_decodes_mavlink_frame() {
        let bytes = encode_message(param_value(7, 8, "WIFI_GCS_IP", "192.168.100.100"));
        let message = parse_datagram(&bytes).unwrap();

        let MavMessage::PARAM_EXT_VALUE(value) = message else {
            panic!("expected PARAM_EXT_VALUE");
        };
        assert_eq!(value.param_index, 7);
        assert_eq!(char_array_to_string(&value.param_id), "WIFI_GCS_IP");
        assert_eq!(char_array_to_string(&value.param_value), "192.168.100.100");
    }

    #[tokio::test]
    async fn request_param_list_fetches_missing_indices() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let port = server.local_addr().unwrap().port();

        let server_task = tokio::spawn(async move {
            let mut buf = [0u8; 1500];
            let (len, peer) = server.recv_from(&mut buf).await.unwrap();
            assert!(matches!(
                parse_datagram(&buf[..len]).unwrap(),
                MavMessage::PARAM_EXT_REQUEST_LIST(_)
            ));

            server
                .send_to(&encode_message(param_value(0, 3, "WIFI_MODE", "1")), peer)
                .await
                .unwrap();
            server
                .send_to(
                    &encode_message(param_value(2, 3, "WIFI_SSID_ST", "lab")),
                    peer,
                )
                .await
                .unwrap();

            let (len, peer) = server.recv_from(&mut buf).await.unwrap();
            match parse_datagram(&buf[..len]).unwrap() {
                MavMessage::PARAM_EXT_REQUEST_READ(request) => {
                    assert_eq!(request.param_index, 1);
                }
                other => panic!("expected PARAM_EXT_REQUEST_READ, got {other:?}"),
            }

            server
                .send_to(
                    &encode_message(param_value(1, 3, "WIFI_SSID_AP", "rtls")),
                    peer,
                )
                .await
                .unwrap();
        });

        let mut conn =
            DeviceConnection::connect_to_port("127.0.0.1", port, Duration::from_millis(1500))
                .await
                .unwrap();
        let values = conn.request_param_list().await.unwrap();
        let ids = values
            .iter()
            .map(|value| value.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["WIFI_MODE", "WIFI_SSID_AP", "WIFI_SSID_ST"]);

        server_task.await.unwrap();
    }
}
