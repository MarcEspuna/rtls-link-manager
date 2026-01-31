//! WebSocket client for device communication.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

use crate::error::{CoreError, DeviceError};
use crate::protocol::commands::is_json_command;
use crate::protocol::response::is_error_response;

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
    if is_json_command(command) {
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

/// Persistent WebSocket connection to a single device.
pub struct DeviceConnection {
    ip: String,
    timeout: Duration,
    ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
}

impl DeviceConnection {
    /// Create a new persistent connection to a device.
    pub async fn connect(ip: &str, cmd_timeout: Duration) -> Result<Self, CoreError> {
        let url = format!("ws://{}/ws", ip);

        // Connect with timeout
        let connect_timeout = Duration::from_secs(5);
        let (ws_stream, _) = timeout(connect_timeout, connect_async(&url))
            .await
            .map_err(|_| CoreError::Other(format!("Connection timeout to {}", ip)))?
            .map_err(|e| CoreError::Other(format!("WebSocket connect to {} failed: {}", url, e)))?;

        Ok(Self {
            ip: ip.to_string(),
            timeout: cmd_timeout,
            ws_stream,
        })
    }

    /// Send a command and wait for a raw response.
    pub async fn send_raw(&mut self, command: &str) -> Result<String, CoreError> {
        let ip_string = self.ip.clone();
        let command_string = command.to_string();

        // Send command
        self.ws_stream
            .send(Message::Text(command_string.clone()))
            .await
            .map_err(|e| CoreError::Other(format!("WebSocket send error: {}", e)))?;

        // Wait for response with timeout
        let response = timeout(self.timeout, async {
            while let Some(msg) = self.ws_stream.next().await {
                match msg {
                    Ok(Message::Text(text)) => return Ok(text),
                    Ok(Message::Close(_)) => break,
                    Ok(_) => continue,
                    Err(e) => return Err(CoreError::Other(format!("WebSocket error: {}", e))),
                }
            }

            Err(CoreError::Device(DeviceError::InvalidResponse {
                ip: ip_string,
                message: format!("No response received for command '{}'", command_string),
            }))
        })
        .await
        .map_err(|_| CoreError::Other(format!("Command to {} timed out", self.ip)))??;

        // Check for error response
        if let Some(error_msg) = is_error_response(&response) {
            return Err(CoreError::Device(DeviceError::CommandFailed {
                ip: self.ip.clone(),
                message: error_msg,
            }));
        }

        Ok(response)
    }

    /// Send a command and return a parsed response (raw + optional JSON).
    pub async fn send(&mut self, command: &str) -> Result<DeviceCommandResponse, CoreError> {
        let raw = self.send_raw(command).await?;
        parse_command_response(command, raw, &self.ip)
    }

    /// Send multiple commands sequentially over a single WebSocket connection.
    pub async fn send_batch(
        &mut self,
        commands: &[String],
    ) -> Result<Vec<DeviceCommandResponse>, CoreError> {
        let mut responses = Vec::with_capacity(commands.len());

        for cmd in commands {
            let response = self.send(cmd).await?;
            responses.push(response);
        }

        Ok(responses)
    }
}

/// Send a command to a device and wait for response.
///
/// Opens a fresh WebSocket connection, sends the command, waits for response, and closes.
pub async fn send_command(
    ip: &str,
    command: &str,
    cmd_timeout: Duration,
) -> Result<String, CoreError> {
    let url = format!("ws://{}/ws", ip);
    let ip_string = ip.to_string();
    let command_string = command.to_string();

    // Connect with timeout
    let connect_timeout = Duration::from_secs(5);
    let (ws_stream, _) = timeout(connect_timeout, connect_async(&url))
        .await
        .map_err(|_| CoreError::Other(format!("Connection timeout to {}", ip)))?
        .map_err(|e| CoreError::Other(format!("WebSocket connect to {} failed: {}", url, e)))?;

    let (mut write, mut read) = ws_stream.split();

    // Send command
    write
        .send(Message::Text(command.to_string()))
        .await
        .map_err(|e| CoreError::Other(format!("WebSocket send error: {}", e)))?;

    // Wait for response with timeout
    let response = timeout(cmd_timeout, async {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    return Ok(text);
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => continue,
                Err(e) => return Err(CoreError::Other(format!("WebSocket error: {}", e))),
            }
        }

        Err(CoreError::Device(DeviceError::InvalidResponse {
            ip: ip_string,
            message: format!("No response received for command '{}'", command_string),
        }))
    })
    .await
    .map_err(|_| CoreError::Other(format!("Command to {} timed out", ip)))??;

    // Check for error response
    if let Some(error_msg) = is_error_response(&response) {
        return Err(CoreError::Device(DeviceError::CommandFailed {
            ip: ip.to_string(),
            message: error_msg,
        }));
    }

    Ok(response)
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

/// Send a command to a device with retry logic
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

/// Batch command sender with concurrency control
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

    /// Send a command to multiple devices concurrently
    pub async fn send_to_all(
        &self,
        ips: &[String],
        command: &str,
    ) -> Vec<(String, Result<String, CoreError>)> {
        use futures::stream::{self, StreamExt};

        let results: Vec<_> = stream::iter(ips.iter().cloned())
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
            .await;

        results
    }
}
