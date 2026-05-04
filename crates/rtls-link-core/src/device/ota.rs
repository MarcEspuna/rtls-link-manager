//! OTA firmware upload functionality.

use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::error::{CoreError, DeviceError};

const CONNECT_TIMEOUT_SECS: u64 = 10;
const UPLOAD_TIMEOUT_SECS: u64 = 120;
const RESPONSE_TIMEOUT_SECS: u64 = 10;
const UPLOAD_CHUNK_SIZE: usize = 4096;

/// Trait for receiving OTA progress updates.
///
/// Implement this trait to receive progress callbacks during firmware uploads.
/// The CLI can use `indicatif` progress bars, while Tauri can emit events.
pub trait OtaProgressHandler: Send + Sync {
    fn on_progress(&self, ip: &str, bytes_sent: u64, total_bytes: u64);
    fn on_complete(&self, ip: &str);
    fn on_error(&self, ip: &str, error: &str);
}

/// Upload firmware data to a device via HTTP multipart POST.
pub async fn upload_firmware(ip: &str, data: Vec<u8>, filename: &str) -> Result<(), CoreError> {
    upload_firmware_data(ip, data, filename, None).await
}

/// Upload firmware data to a device and report transfer progress.
pub async fn upload_firmware_with_progress<P: OtaProgressHandler>(
    ip: &str,
    data: Vec<u8>,
    filename: &str,
    progress: &P,
) -> Result<(), CoreError> {
    upload_firmware_data(ip, data, filename, Some(progress)).await
}

/// Upload firmware to multiple devices concurrently.
pub async fn upload_firmware_bulk<P: OtaProgressHandler>(
    ips: &[String],
    data: Vec<u8>,
    filename: &str,
    concurrency: usize,
    progress: &P,
) -> Vec<(String, Result<(), CoreError>)> {
    use futures::stream::{self, StreamExt};

    let concurrency = concurrency.max(1);
    let filename = filename.to_string();

    let results: Vec<_> = stream::iter(ips.iter().cloned())
        .map(|ip| {
            let data = data.clone();
            let name = filename.clone();
            async move {
                let result = upload_firmware_data(&ip, data, &name, Some(progress)).await;
                match &result {
                    Ok(()) => {
                        progress.on_complete(&ip);
                    }
                    Err(e) => {
                        progress.on_error(&ip, &e.to_string());
                    }
                }
                (ip, result)
            }
        })
        .buffer_unordered(concurrency)
        .collect()
        .await;

    results
}

/// Upload firmware data (already loaded) to a single device.
async fn upload_firmware_data(
    ip: &str,
    data: Vec<u8>,
    file_name: &str,
    progress: Option<&dyn OtaProgressHandler>,
) -> Result<(), CoreError> {
    let (host, port) = split_host_port(ip);
    let address = format!("{}:{}", host, port);
    let boundary = "----rtls-link-ota-boundary";
    let prefix = format!(
        "--{}\r\nContent-Disposition: form-data; name=\"firmware\"; filename=\"{}\"\r\nContent-Type: application/octet-stream\r\n\r\n",
        boundary, file_name
    );
    let suffix = format!("\r\n--{}--\r\n", boundary);
    let content_length = prefix.len() + data.len() + suffix.len();
    let request_headers = format!(
        "POST /update HTTP/1.1\r\nHost: {}\r\nAccept: */*\r\nContent-Type: multipart/form-data; boundary={}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        ip, boundary, content_length
    );

    let mut stream = timeout(
        Duration::from_secs(CONNECT_TIMEOUT_SECS),
        TcpStream::connect(&address),
    )
    .await
    .map_err(|_| CoreError::Other(format!("Timed out connecting to {}", ip)))?
    .map_err(|e| CoreError::Other(format!("Failed to connect to {}: {}", ip, e)))?;

    timeout(Duration::from_secs(UPLOAD_TIMEOUT_SECS), async {
        stream.write_all(request_headers.as_bytes()).await?;
        stream.write_all(prefix.as_bytes()).await?;

        let total = data.len() as u64;
        let mut sent = 0u64;
        if let Some(handler) = progress {
            handler.on_progress(ip, 0, total);
        }

        for chunk in data.chunks(UPLOAD_CHUNK_SIZE) {
            stream.write_all(chunk).await?;
            sent += chunk.len() as u64;
            if let Some(handler) = progress {
                handler.on_progress(ip, sent, total);
            }
            tokio::task::yield_now().await;
        }

        stream.write_all(suffix.as_bytes()).await?;
        stream.flush().await
    })
    .await
    .map_err(|_| CoreError::Other(format!("Timed out uploading firmware to {}", ip)))?
    .map_err(|e: std::io::Error| {
        CoreError::Other(format!("HTTP upload to {} failed: {}", ip, e))
    })?;

    let mut response = Vec::new();
    match timeout(
        Duration::from_secs(RESPONSE_TIMEOUT_SECS),
        stream.read_to_end(&mut response),
    )
    .await
    {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            return if response.is_empty() {
                Ok(())
            } else {
                Err(CoreError::Other(format!(
                    "Failed reading OTA response from {}: {}",
                    ip, e
                )))
            };
        }
        Err(_) => {
            return Ok(());
        }
    }

    // The full request body was accepted; older firmware may reboot before the
    // HTTP response is flushed.
    if response.is_empty() {
        return Ok(());
    }

    let response_text = String::from_utf8_lossy(&response);
    let status_line = response_text.lines().next().unwrap_or_default();
    let success = status_line.contains(" 200 ") || status_line.ends_with(" 200");
    if !success {
        return Err(CoreError::Device(DeviceError::OtaFailed {
            ip: ip.to_string(),
            message: response_text.to_string(),
        }));
    }

    Ok(())
}

fn split_host_port(ip: &str) -> (&str, u16) {
    if let Some((host, port)) = ip.rsplit_once(':') {
        if let Ok(port) = port.parse::<u16>() {
            return (host, port);
        }
    }
    (ip, 80)
}
