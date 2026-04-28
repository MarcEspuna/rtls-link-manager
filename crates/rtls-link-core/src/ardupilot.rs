//! ArduPilot firmware update support over the RTLS MAP-Link tunnel.

use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::time::Duration;

use base64::Engine;
use flate2::read::ZlibDecoder;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Instant};
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

use crate::device::websocket::send_command;
use crate::error::{CoreError, DeviceError};
use crate::protocol::response::parse_json_response;

const INSYNC: u8 = 0x12;
const EOC: u8 = 0x20;
const OK: u8 = 0x10;
const FAILED: u8 = 0x11;
const INVALID: u8 = 0x13;
const BAD_SILICON_REV: u8 = 0x14;

const GET_SYNC: u8 = 0x21;
const GET_DEVICE: u8 = 0x22;
const CHIP_ERASE: u8 = 0x23;
const PROG_MULTI: u8 = 0x27;
const GET_CRC: u8 = 0x29;
const REBOOT: u8 = 0x30;

const INFO_BL_REV: u8 = 0x01;
const INFO_BOARD_ID: u8 = 0x02;
const INFO_BOARD_REV: u8 = 0x03;
const INFO_FLASH_SIZE: u8 = 0x04;
const PROG_MULTI_MAX: usize = 252;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApjMetadata {
    pub board_id: u32,
    pub image_size: usize,
    pub board_revision: Option<u32>,
    pub git_identity: Option<String>,
    pub vehicle_type: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ApjFirmware {
    pub metadata: ApjMetadata,
    image: Vec<u8>,
}

#[derive(Debug, Deserialize)]
struct RawApjFirmware {
    image: String,
    board_id: u32,
    image_size: usize,
    board_revision: Option<u32>,
    git_identity: Option<String>,
    vehicle_type: Option<String>,
    description: Option<String>,
}

impl ApjFirmware {
    pub fn from_path(path: &Path) -> Result<Self, CoreError> {
        let raw = fs::read_to_string(path)?;
        Self::from_json(&raw)
    }

    pub fn from_json(raw_json: &str) -> Result<Self, CoreError> {
        let raw: RawApjFirmware = serde_json::from_str(raw_json)
            .map_err(|e| CoreError::Other(format!("Invalid APJ JSON: {}", e)))?;
        let compressed = base64::engine::general_purpose::STANDARD
            .decode(raw.image.as_bytes())
            .map_err(|e| CoreError::Other(format!("Invalid APJ image base64: {}", e)))?;

        let mut decoder = ZlibDecoder::new(compressed.as_slice());
        let mut image = Vec::new();
        std::io::copy(&mut decoder, &mut image)
            .map_err(|e| CoreError::Other(format!("Invalid APJ zlib image: {}", e)))?;

        if image.len() != raw.image_size {
            return Err(CoreError::Other(format!(
                "APJ image_size mismatch: metadata={}, decoded={}",
                raw.image_size,
                image.len()
            )));
        }

        while image.len() % 4 != 0 {
            image.push(0xff);
        }

        Ok(Self {
            metadata: ApjMetadata {
                board_id: raw.board_id,
                image_size: raw.image_size,
                board_revision: raw.board_revision,
                git_identity: raw.git_identity,
                vehicle_type: raw.vehicle_type,
                description: raw.description,
            },
            image,
        })
    }

    pub fn image(&self) -> &[u8] {
        &self.image
    }

    pub fn crc(&self, flash_size: u32) -> u32 {
        let mut state = ardupilot_crc32(&self.image, 0);
        let pad = [0xff, 0xff, 0xff, 0xff];
        let mut offset = self.image.len();
        let end = flash_size.saturating_sub(1) as usize;
        while offset < end {
            state = ardupilot_crc32(&pad, state);
            offset += 4;
        }
        state
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootloaderInfo {
    pub revision: u32,
    pub board_id: u32,
    pub board_revision: u32,
    pub flash_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArduPilotUpdateProgress {
    pub ip: String,
    pub phase: String,
    pub percent: f32,
    pub detail: Option<String>,
}

pub trait ArduPilotUpdateProgressHandler: Send + Sync {
    fn on_progress(&self, progress: ArduPilotUpdateProgress);
}

#[allow(async_fn_in_trait)]
pub trait ArduPilotTransport {
    async fn write(&mut self, data: &[u8]) -> Result<(), CoreError>;
    async fn read_exact_timeout(
        &mut self,
        len: usize,
        timeout_duration: Duration,
    ) -> Result<Vec<u8>, CoreError>;
}

pub struct MapLinkWebSocketTransport {
    ip: String,
    stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    rx_buffer: VecDeque<u8>,
}

impl MapLinkWebSocketTransport {
    pub async fn connect(ip: &str) -> Result<Self, CoreError> {
        let url = format!("ws://{}/ardupilot-update", ip);
        let (stream, _) = timeout(Duration::from_secs(5), connect_async(&url))
            .await
            .map_err(|_| CoreError::Other(format!("Connection timeout to {}", url)))?
            .map_err(|e| CoreError::Other(format!("WebSocket connect to {} failed: {}", url, e)))?;

        Ok(Self {
            ip: ip.to_string(),
            stream,
            rx_buffer: VecDeque::new(),
        })
    }
}

impl ArduPilotTransport for MapLinkWebSocketTransport {
    async fn write(&mut self, data: &[u8]) -> Result<(), CoreError> {
        self.stream
            .send(Message::Binary(data.to_vec()))
            .await
            .map_err(|e| CoreError::Other(format!("ArduPilot tunnel write failed: {}", e)))
    }

    async fn read_exact_timeout(
        &mut self,
        len: usize,
        timeout_duration: Duration,
    ) -> Result<Vec<u8>, CoreError> {
        let deadline = Instant::now() + timeout_duration;

        while self.rx_buffer.len() < len {
            let now = Instant::now();
            if now >= deadline {
                return Err(CoreError::Other(format!(
                    "Timed out reading {} bytes from {}",
                    len, self.ip
                )));
            }

            let remaining = deadline - now;
            let msg = timeout(remaining, self.stream.next())
                .await
                .map_err(|_| CoreError::Other(format!("Timed out reading from {}", self.ip)))?
                .ok_or_else(|| CoreError::Other(format!("ArduPilot tunnel closed by {}", self.ip)))?
                .map_err(|e| CoreError::Other(format!("ArduPilot tunnel read failed: {}", e)))?;

            match msg {
                Message::Binary(bytes) => self.rx_buffer.extend(bytes),
                Message::Close(_) => {
                    return Err(CoreError::Other(format!(
                        "ArduPilot tunnel closed by {}",
                        self.ip
                    )));
                }
                _ => {}
            }
        }

        Ok(self.rx_buffer.drain(..len).collect())
    }
}

pub struct ArduPilotBootloaderClient<T: ArduPilotTransport> {
    transport: T,
}

impl<T: ArduPilotTransport> ArduPilotBootloaderClient<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    pub async fn sync(&mut self) -> Result<(), CoreError> {
        let mut last_error = None;
        for _ in 0..20 {
            self.transport.write(&[GET_SYNC, EOC]).await?;
            match self.get_sync(Duration::from_millis(600)).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_error = Some(e);
                    sleep(Duration::from_millis(100)).await;
                }
            }
        }
        Err(last_error.unwrap_or_else(|| CoreError::Other("Bootloader sync failed".to_string())))
    }

    pub async fn identify(&mut self) -> Result<BootloaderInfo, CoreError> {
        self.sync().await?;
        let revision = self.get_info(INFO_BL_REV).await?;
        if !(2..=5).contains(&revision) {
            return Err(CoreError::Other(format!(
                "Unsupported bootloader revision {}",
                revision
            )));
        }

        let board_id = self.get_info(INFO_BOARD_ID).await?;
        let board_revision = self.get_info(INFO_BOARD_REV).await?;
        let flash_size = self.get_info(INFO_FLASH_SIZE).await?;
        Ok(BootloaderInfo {
            revision,
            board_id,
            board_revision,
            flash_size,
        })
    }

    pub async fn erase(&mut self) -> Result<(), CoreError> {
        self.transport.write(&[CHIP_ERASE, EOC]).await?;
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            match self.get_sync(Duration::from_secs(1)).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    if Instant::now() >= deadline {
                        return Err(CoreError::Other(format!(
                            "Timed out waiting for chip erase: {}",
                            e
                        )));
                    }
                }
            }
        }
    }

    pub async fn program<F>(&mut self, image: &[u8], mut on_chunk: F) -> Result<(), CoreError>
    where
        F: FnMut(usize, usize),
    {
        let total = image.chunks(PROG_MULTI_MAX).count().max(1);
        for (index, chunk) in image.chunks(PROG_MULTI_MAX).enumerate() {
            let mut frame = Vec::with_capacity(chunk.len() + 3);
            frame.push(PROG_MULTI);
            frame.push(chunk.len() as u8);
            frame.extend_from_slice(chunk);
            frame.push(EOC);
            self.transport.write(&frame).await?;
            self.get_sync(Duration::from_secs(3)).await?;
            on_chunk(index + 1, total);
        }
        Ok(())
    }

    pub async fn get_crc(&mut self) -> Result<u32, CoreError> {
        self.transport.write(&[GET_CRC, EOC]).await?;
        let raw = self
            .transport
            .read_exact_timeout(4, Duration::from_secs(10))
            .await?;
        let crc = u32::from_le_bytes(raw.as_slice().try_into().unwrap());
        self.get_sync(Duration::from_secs(2)).await?;
        Ok(crc)
    }

    pub async fn reboot(&mut self) -> Result<(), CoreError> {
        self.transport.write(&[REBOOT, EOC]).await?;
        match self.read_sync_status(Duration::from_secs(2)).await {
            Ok(OK) => {}
            Ok(status) => return Err(sync_status_error(status)),
            Err(_) => {}
        }
        Ok(())
    }

    async fn get_info(&mut self, param: u8) -> Result<u32, CoreError> {
        self.transport.write(&[GET_DEVICE, param, EOC]).await?;
        let raw = self
            .transport
            .read_exact_timeout(4, Duration::from_secs(2))
            .await?;
        let value = u32::from_le_bytes(raw.as_slice().try_into().unwrap());
        self.get_sync(Duration::from_secs(2)).await?;
        Ok(value)
    }

    async fn get_sync(&mut self, timeout_duration: Duration) -> Result<(), CoreError> {
        let status = self.read_sync_status(timeout_duration).await?;
        if status == OK {
            return Ok(());
        }
        Err(sync_status_error(status))
    }

    async fn read_sync_status(&mut self, timeout_duration: Duration) -> Result<u8, CoreError> {
        let deadline = Instant::now() + timeout_duration;

        loop {
            let now = Instant::now();
            if now >= deadline {
                return Err(CoreError::Other(
                    "Timed out waiting for bootloader INSYNC".to_string(),
                ));
            }

            let byte = self.transport.read_exact_timeout(1, deadline - now).await?[0];
            if byte != INSYNC {
                continue;
            }

            let now = Instant::now();
            if now >= deadline {
                return Err(CoreError::Other(
                    "Timed out waiting for bootloader status".to_string(),
                ));
            }

            let status = self.transport.read_exact_timeout(1, deadline - now).await?[0];
            return Ok(status);
        }
    }
}

fn sync_status_error(status: u8) -> CoreError {
    match status {
        INVALID => CoreError::Other("Bootloader reports invalid operation".to_string()),
        FAILED => CoreError::Other("Bootloader reports failed operation".to_string()),
        BAD_SILICON_REV => {
            CoreError::Other("Bootloader reports unsupported silicon revision".to_string())
        }
        other => CoreError::Other(format!("Expected OK, got 0x{:02x}", other)),
    }
}

pub async fn update_over_maplink(
    ip: &str,
    firmware_path: &Path,
    target_system: Option<u8>,
    progress: &dyn ArduPilotUpdateProgressHandler,
) -> Result<BootloaderInfo, CoreError> {
    let firmware = ApjFirmware::from_path(firmware_path)?;
    emit(
        progress,
        ip,
        "connecting",
        0.0,
        Some("Starting RTLS update session".to_string()),
    );

    let begin_cmd = format!("ardupilot-update begin {}", target_system.unwrap_or(0));
    let begin_response = send_command(ip, &begin_cmd, Duration::from_secs(8)).await?;
    let begin_json: serde_json::Value = match parse_json_response(&begin_response, ip) {
        Ok(value) => value,
        Err(e) => {
            cleanup_update_session(ip).await;
            return Err(e.into());
        }
    };
    if begin_json.get("success").and_then(|v| v.as_bool()) != Some(true) {
        let message = begin_json
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Failed to start ArduPilot update session");
        cleanup_update_session(ip).await;
        return Err(CoreError::Device(DeviceError::CommandFailed {
            ip: ip.to_string(),
            message: message.to_string(),
        }));
    }

    let result = async {
        emit(
            progress,
            ip,
            "rebooting",
            5.0,
            Some("Waiting for bootloader".to_string()),
        );
        sleep(Duration::from_millis(1600)).await;

        let transport = MapLinkWebSocketTransport::connect(ip).await?;
        let mut bootloader = ArduPilotBootloaderClient::new(transport);

        emit(progress, ip, "syncing", 10.0, None);
        let info = bootloader.identify().await?;

        emit(
            progress,
            ip,
            "checking_board",
            18.0,
            Some(format!(
                "Bootloader board_id={}, firmware board_id={}",
                info.board_id, firmware.metadata.board_id
            )),
        );

        if info.board_id != firmware.metadata.board_id {
            return Err(CoreError::Device(DeviceError::InvalidResponse {
                ip: ip.to_string(),
                message: format!(
                    "Board ID mismatch: bootloader={}, firmware={}",
                    info.board_id, firmware.metadata.board_id
                ),
            }));
        }

        if firmware.metadata.image_size as u32 > info.flash_size {
            return Err(CoreError::Device(DeviceError::InvalidResponse {
                ip: ip.to_string(),
                message: format!(
                    "Firmware image is too large: image={} flash={}",
                    firmware.metadata.image_size, info.flash_size
                ),
            }));
        }

        emit(progress, ip, "erasing", 25.0, None);
        bootloader.erase().await?;

        emit(progress, ip, "flashing", 35.0, None);
        bootloader
            .program(firmware.image(), |done, total| {
                let pct = 35.0 + (done as f32 / total as f32) * 45.0;
                emit(
                    progress,
                    ip,
                    "flashing",
                    pct,
                    Some(format!("{}/{} chunks", done, total)),
                );
            })
            .await?;

        emit(progress, ip, "verifying", 85.0, None);
        let reported_crc = bootloader.get_crc().await?;
        let expected_crc = firmware.crc(info.flash_size);
        if reported_crc != expected_crc {
            return Err(CoreError::Device(DeviceError::InvalidResponse {
                ip: ip.to_string(),
                message: format!(
                    "CRC mismatch: expected=0x{:08x}, got=0x{:08x}",
                    expected_crc, reported_crc
                ),
            }));
        }

        emit(progress, ip, "rebooting", 95.0, None);
        bootloader.reboot().await?;
        emit(progress, ip, "complete", 100.0, None);
        Ok(info)
    }
    .await;

    cleanup_update_session(ip).await;
    result
}

async fn cleanup_update_session(ip: &str) {
    let _ = send_command(ip, "ardupilot-update end", Duration::from_secs(3)).await;
}

fn emit(
    handler: &dyn ArduPilotUpdateProgressHandler,
    ip: &str,
    phase: &str,
    percent: f32,
    detail: Option<String>,
) {
    handler.on_progress(ArduPilotUpdateProgress {
        ip: ip.to_string(),
        phase: phase.to_string(),
        percent,
        detail,
    });
}

fn ardupilot_crc32(bytes: &[u8], mut state: u32) -> u32 {
    for byte in bytes {
        state ^= *byte as u32;
        for _ in 0..8 {
            if state & 1 != 0 {
                state = (state >> 1) ^ 0xedb88320;
            } else {
                state >>= 1;
            }
        }
    }
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct MockTransportState {
        expected_writes: VecDeque<Vec<u8>>,
        reads: VecDeque<Vec<u8>>,
    }

    struct MockTransport {
        state: Arc<Mutex<MockTransportState>>,
        read_buffer: VecDeque<u8>,
    }

    impl MockTransport {
        fn new(
            expected_writes: Vec<Vec<u8>>,
            reads: Vec<Vec<u8>>,
        ) -> (Self, Arc<Mutex<MockTransportState>>) {
            let state = Arc::new(Mutex::new(MockTransportState {
                expected_writes: expected_writes.into(),
                reads: reads.into(),
            }));
            (
                Self {
                    state: state.clone(),
                    read_buffer: VecDeque::new(),
                },
                state,
            )
        }
    }

    impl ArduPilotTransport for MockTransport {
        async fn write(&mut self, data: &[u8]) -> Result<(), CoreError> {
            let expected = self
                .state
                .lock()
                .unwrap()
                .expected_writes
                .pop_front()
                .expect("unexpected write");
            assert_eq!(expected, data);
            Ok(())
        }

        async fn read_exact_timeout(
            &mut self,
            len: usize,
            _timeout_duration: Duration,
        ) -> Result<Vec<u8>, CoreError> {
            while self.read_buffer.len() < len {
                let next = self
                    .state
                    .lock()
                    .unwrap()
                    .reads
                    .pop_front()
                    .ok_or_else(|| CoreError::Other("mock read exhausted".to_string()))?;
                self.read_buffer.extend(next);
            }

            Ok(self.read_buffer.drain(..len).collect())
        }
    }

    #[test]
    fn crc_matches_known_value() {
        assert_eq!(ardupilot_crc32(b"123456789", 0), 0x2dfd2d88);
    }

    #[test]
    fn apj_parser_rejects_invalid_json() {
        let result = ApjFirmware::from_json("{}");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn bootloader_protocol_happy_path_uses_expected_frames() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let crc = 0x78563412_u32;
        let (transport, state) = MockTransport::new(
            vec![
                vec![GET_SYNC, EOC],
                vec![GET_DEVICE, INFO_BL_REV, EOC],
                vec![GET_DEVICE, INFO_BOARD_ID, EOC],
                vec![GET_DEVICE, INFO_BOARD_REV, EOC],
                vec![GET_DEVICE, INFO_FLASH_SIZE, EOC],
                vec![CHIP_ERASE, EOC],
                vec![PROG_MULTI, image.len() as u8, 0x01, 0x02, 0x03, 0x04, EOC],
                vec![GET_CRC, EOC],
                vec![REBOOT, EOC],
            ],
            vec![
                vec![0xff, INSYNC, OK],
                5_u32.to_le_bytes().to_vec(),
                vec![INSYNC, OK],
                1153_u32.to_le_bytes().to_vec(),
                vec![INSYNC, OK],
                7_u32.to_le_bytes().to_vec(),
                vec![INSYNC, OK],
                2_097_152_u32.to_le_bytes().to_vec(),
                vec![INSYNC, OK],
                vec![INSYNC, OK],
                vec![INSYNC, OK],
                crc.to_le_bytes().to_vec(),
                vec![INSYNC, OK],
                vec![INSYNC, OK],
            ],
        );
        let mut client = ArduPilotBootloaderClient::new(transport);

        let info = client.identify().await.unwrap();
        assert_eq!(info.board_id, 1153);
        assert_eq!(info.board_revision, 7);
        assert_eq!(info.flash_size, 2_097_152);

        client.erase().await.unwrap();
        let mut chunks = Vec::new();
        client
            .program(&image, |done, total| chunks.push((done, total)))
            .await
            .unwrap();
        assert_eq!(chunks, vec![(1, 1)]);
        assert_eq!(client.get_crc().await.unwrap(), crc);
        client.reboot().await.unwrap();

        let state = state.lock().unwrap();
        assert!(state.expected_writes.is_empty());
        assert!(state.reads.is_empty());
    }

    #[tokio::test]
    async fn reboot_fails_on_explicit_bootloader_failure_status() {
        let (transport, _state) =
            MockTransport::new(vec![vec![REBOOT, EOC]], vec![vec![INSYNC, FAILED]]);
        let mut client = ArduPilotBootloaderClient::new(transport);

        let err = client.reboot().await.unwrap_err();
        assert!(err.to_string().contains("failed operation"));
    }

    #[tokio::test]
    async fn reboot_tolerates_closed_transport_after_command() {
        let (transport, _state) = MockTransport::new(vec![vec![REBOOT, EOC]], vec![]);
        let mut client = ArduPilotBootloaderClient::new(transport);

        client.reboot().await.unwrap();
    }

    #[test]
    fn begin_response_parser_accepts_prefixed_json() {
        let parsed: serde_json::Value =
            parse_json_response("OK\n{\"success\":true}", "192.168.1.1").unwrap();
        assert_eq!(parsed.get("success").and_then(|v| v.as_bool()), Some(true));
    }
}
