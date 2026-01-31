//! OTA firmware upload functionality.

use std::time::Duration;

use bytes::Bytes;
use reqwest::multipart;
use reqwest::Client;

use crate::error::{CoreError, DeviceError};

/// Trait for receiving OTA progress updates.
///
/// Implement this trait to receive progress callbacks during firmware uploads.
/// The CLI can use `indicatif` progress bars, while Tauri can emit events.
pub trait OtaProgressHandler: Send + Sync {
    fn on_progress(&self, ip: &str, bytes_sent: u64, total_bytes: u64);
    fn on_complete(&self, ip: &str);
    fn on_error(&self, ip: &str, error: &str);
}

/// No-op progress handler for when progress tracking isn't needed.
pub struct NoopProgress;

impl OtaProgressHandler for NoopProgress {
    fn on_progress(&self, _ip: &str, _bytes_sent: u64, _total_bytes: u64) {}
    fn on_complete(&self, _ip: &str) {}
    fn on_error(&self, _ip: &str, _error: &str) {}
}

/// Upload firmware data to a device via HTTP multipart POST.
pub async fn upload_firmware(ip: &str, data: Vec<u8>, filename: &str) -> Result<(), CoreError> {
    let client = build_client()?;
    upload_firmware_data(&client, ip, Bytes::from(data), filename).await
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
    let data = Bytes::from(data);
    let total_bytes = data.len() as u64;
    let client = match build_client() {
        Ok(c) => c,
        Err(e) => {
            let msg = e.to_string();
            return ips
                .iter()
                .cloned()
                .map(|ip| (ip, Err(CoreError::Other(msg.clone()))))
                .collect();
        }
    };
    let filename = filename.to_string();

    let results: Vec<_> = stream::iter(ips.iter().cloned())
        .map(|ip| {
            let data = data.clone();
            let name = filename.clone();
            let client = client.clone();
            async move {
                progress.on_progress(&ip, 0, total_bytes);
                let result = upload_firmware_data(&client, &ip, data, &name).await;
                match &result {
                    Ok(()) => {
                        progress.on_progress(&ip, total_bytes, total_bytes);
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

fn build_client() -> Result<Client, CoreError> {
    Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| CoreError::Other(format!("HTTP client error: {}", e)))
}

/// Upload firmware data (already loaded) to a single device.
async fn upload_firmware_data(
    client: &Client,
    ip: &str,
    data: Bytes,
    file_name: &str,
) -> Result<(), CoreError> {
    let part = multipart::Part::stream(data)
        .file_name(file_name.to_string())
        .mime_str("application/octet-stream")
        .map_err(|e| CoreError::Other(format!("Failed to create multipart: {}", e)))?;

    let form = multipart::Form::new().part("firmware", part);

    let url = format!("http://{}/update", ip);

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| CoreError::Other(format!("HTTP request to {} failed: {}", ip, e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CoreError::Device(DeviceError::OtaFailed {
            ip: ip.to_string(),
            message: format!("HTTP {}: {}", status, body),
        }));
    }

    Ok(())
}
