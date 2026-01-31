//! Framework-agnostic discovery service.
//!
//! Uses SO_REUSEPORT to allow concurrent operation with other listeners.

use crate::types::Device;
use socket2::{Domain, Protocol, Socket, Type};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::timeout;

use super::heartbeat::{parse_heartbeat, prune_stale_devices};

/// Default UDP discovery port
pub const DISCOVERY_PORT: u16 = 3333;

/// Timeout for UDP receive - ensures pruning runs even without incoming packets
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(2);

/// Create a UDP socket with SO_REUSEPORT for concurrent operation.
pub fn create_reusable_socket(port: u16) -> Result<std::net::UdpSocket, std::io::Error> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;

    socket.set_reuse_address(true)?;

    #[cfg(unix)]
    socket.set_reuse_port(true)?;

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    socket.bind(&addr.into())?;

    socket.set_nonblocking(true)?;

    Ok(socket.into())
}

/// Framework-agnostic discovery service.
pub struct DiscoveryService {
    socket: UdpSocket,
    devices: HashMap<String, (Device, Instant)>,
}

impl DiscoveryService {
    /// Create a new discovery service bound to the given port.
    pub async fn new(port: u16) -> Result<Self, std::io::Error> {
        let std_socket = create_reusable_socket(port)?;
        let socket = UdpSocket::from_std(std_socket)?;
        println!("UDP discovery listening on port {}", port);

        Ok(Self {
            socket,
            devices: HashMap::new(),
        })
    }

    /// Run the discovery service loop, calling `on_update` whenever devices change.
    pub async fn run<F>(&mut self, mut on_update: F) -> Result<(), std::io::Error>
    where
        F: FnMut(&[Device]),
    {
        let mut buf = vec![0u8; 2048];

        loop {
            let recv_result = timeout(RECEIVE_TIMEOUT, self.socket.recv_from(&mut buf)).await;

            match recv_result {
                Ok(Ok((len, addr))) => {
                    let ip = addr.ip().to_string();
                    if let Ok(device) = parse_heartbeat(&buf[..len], ip) {
                        self.devices
                            .insert(device.ip.clone(), (device, Instant::now()));
                    }
                }
                Ok(Err(ref e)) => {
                    eprintln!("UDP receive error: {}", e);
                }
                Err(_) => {
                    // Timeout - continue to prune
                }
            }

            let before_prune = self.devices.len();
            prune_stale_devices(&mut self.devices);
            let after_prune = self.devices.len();

            if before_prune != after_prune || matches!(recv_result, Ok(Ok(_))) {
                let mut device_list: Vec<Device> =
                    self.devices.values().map(|(dev, _)| dev.clone()).collect();
                device_list.sort_by(|a, b| a.ip.cmp(&b.ip));
                on_update(&device_list);
            }
        }
    }

    /// Discover devices for a given duration and return the result.
    pub async fn discover_once(
        port: u16,
        duration: Duration,
    ) -> Result<Vec<Device>, std::io::Error> {
        let std_socket = create_reusable_socket(port)?;
        let socket = UdpSocket::from_std(std_socket)?;

        let mut devices: HashMap<String, Device> = HashMap::new();
        let mut buf = vec![0u8; 2048];
        let start = Instant::now();

        loop {
            if start.elapsed() >= duration {
                break;
            }

            let recv_timeout = Duration::from_millis(500);
            match timeout(recv_timeout, socket.recv_from(&mut buf)).await {
                Ok(Ok((len, addr))) => {
                    if let Ok(device) = parse_heartbeat(&buf[..len], addr.ip().to_string()) {
                        devices.insert(device.ip.clone(), device);
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("UDP receive error: {}", e);
                }
                Err(_) => {
                    // Timeout - continue
                }
            }
        }

        let mut device_list: Vec<Device> = devices.into_values().collect();
        device_list.sort_by(|a, b| a.ip.cmp(&b.ip));

        Ok(device_list)
    }
}
