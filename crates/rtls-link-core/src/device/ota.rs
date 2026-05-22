//! OTA firmware upload functionality.

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::error::{CoreError, DeviceError};

const CONNECT_TIMEOUT_SECS: u64 = 10;
const UPLOAD_TIMEOUT_SECS: u64 = 120;
const WRITE_TIMEOUT_SECS: u64 = 20;
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
    upload_firmware_data(ip, data, filename, None, None).await
}

/// Upload firmware data to a device and report transfer progress.
pub async fn upload_firmware_with_progress<P: OtaProgressHandler>(
    ip: &str,
    data: Vec<u8>,
    filename: &str,
    progress: &P,
) -> Result<(), CoreError> {
    upload_firmware_data(ip, data, filename, Some(progress), None).await
}

/// Upload firmware data to a device and allow cooperative cancellation.
pub async fn upload_firmware_with_progress_and_cancel<P: OtaProgressHandler>(
    ip: &str,
    data: Vec<u8>,
    filename: &str,
    progress: &P,
    cancel: Arc<AtomicBool>,
) -> Result<(), CoreError> {
    upload_firmware_data(ip, data, filename, Some(progress), Some(cancel.as_ref())).await
}

/// Upload firmware to multiple devices concurrently.
pub async fn upload_firmware_bulk<P: OtaProgressHandler>(
    ips: &[String],
    data: Vec<u8>,
    filename: &str,
    concurrency: usize,
    progress: &P,
) -> Vec<(String, Result<(), CoreError>)> {
    upload_firmware_bulk_with_cancel(ips, data, filename, concurrency, progress, HashMap::new())
        .await
}

/// Upload firmware to multiple devices concurrently with optional per-device cancellation.
pub async fn upload_firmware_bulk_with_cancel<P: OtaProgressHandler>(
    ips: &[String],
    data: Vec<u8>,
    filename: &str,
    concurrency: usize,
    progress: &P,
    cancel_flags: HashMap<String, Arc<AtomicBool>>,
) -> Vec<(String, Result<(), CoreError>)> {
    use futures::stream::{self, StreamExt};

    let concurrency = concurrency.max(1);
    let filename = filename.to_string();
    let cancel_flags = Arc::new(cancel_flags);

    let results: Vec<_> = stream::iter(ips.iter().cloned())
        .map(|ip| {
            let data = data.clone();
            let name = filename.clone();
            let cancel = cancel_flags.get(&ip).cloned();
            async move {
                let result =
                    upload_firmware_data(&ip, data, &name, Some(progress), cancel.as_deref()).await;
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
    cancel: Option<&AtomicBool>,
) -> Result<(), CoreError> {
    check_cancelled(ip, cancel)?;

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
        check_cancelled(ip, cancel)?;
        write_all_with_timeout(
            &mut stream,
            request_headers.as_bytes(),
            ip,
            "request headers",
        )
        .await?;
        write_all_with_timeout(&mut stream, prefix.as_bytes(), ip, "multipart header").await?;

        let total = data.len() as u64;
        let mut sent = 0u64;
        if let Some(handler) = progress {
            handler.on_progress(ip, 0, total);
        }

        for chunk in data.chunks(UPLOAD_CHUNK_SIZE) {
            check_cancelled(ip, cancel)?;
            write_all_with_timeout(&mut stream, chunk, ip, "firmware chunk").await?;
            sent += chunk.len() as u64;
            if let Some(handler) = progress {
                handler.on_progress(ip, sent, total);
            }
            tokio::task::yield_now().await;
        }

        check_cancelled(ip, cancel)?;
        write_all_with_timeout(&mut stream, suffix.as_bytes(), ip, "multipart footer").await?;
        flush_with_timeout(&mut stream, ip).await
    })
    .await
    .map_err(|_| CoreError::Other(format!("Timed out uploading firmware to {}", ip)))??;

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

fn check_cancelled(ip: &str, cancel: Option<&AtomicBool>) -> Result<(), CoreError> {
    if matches!(cancel, Some(flag) if flag.load(Ordering::Relaxed)) {
        return Err(CoreError::Other(format!(
            "Firmware upload to {} canceled",
            ip
        )));
    }
    Ok(())
}

async fn write_all_with_timeout(
    stream: &mut TcpStream,
    bytes: &[u8],
    ip: &str,
    phase: &str,
) -> Result<(), CoreError> {
    timeout(
        Duration::from_secs(WRITE_TIMEOUT_SECS),
        stream.write_all(bytes),
    )
    .await
    .map_err(|_| CoreError::Other(format!("Timed out writing {} to {}", phase, ip)))?
    .map_err(|e| {
        CoreError::Other(format!(
            "HTTP upload to {} failed during {}: {}",
            ip, phase, e
        ))
    })
}

async fn flush_with_timeout(stream: &mut TcpStream, ip: &str) -> Result<(), CoreError> {
    timeout(Duration::from_secs(WRITE_TIMEOUT_SECS), stream.flush())
        .await
        .map_err(|_| CoreError::Other(format!("Timed out finalizing upload to {}", ip)))?
        .map_err(|e| CoreError::Other(format!("HTTP upload to {} failed during flush: {}", ip, e)))
}

fn split_host_port(ip: &str) -> (&str, u16) {
    if let Some((host, port)) = ip.rsplit_once(':') {
        if let Ok(port) = port.parse::<u16>() {
            return (host, port);
        }
    }
    (ip, 80)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_cancelled_allows_active_upload() {
        let cancel = AtomicBool::new(false);
        assert!(check_cancelled("192.168.0.10", Some(&cancel)).is_ok());
        assert!(check_cancelled("192.168.0.10", None).is_ok());
    }

    #[test]
    fn check_cancelled_reports_canceled_upload() {
        let cancel = AtomicBool::new(true);
        let error = check_cancelled("192.168.0.10", Some(&cancel)).unwrap_err();
        match error {
            CoreError::Other(message) => assert!(message.contains("192.168.0.10")),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn split_host_port_uses_default_port_for_plain_ip() {
        assert_eq!(split_host_port("192.168.0.10"), ("192.168.0.10", 80));
    }

    #[test]
    fn split_host_port_accepts_explicit_port() {
        assert_eq!(split_host_port("192.168.0.10:8080"), ("192.168.0.10", 8080));
    }
}
