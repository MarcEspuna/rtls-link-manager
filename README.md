# RTLS-Link Manager

Web-based configuration and monitoring tool for RTLS-Link devices.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

RTLS-Link Manager is a full-stack web application for managing RTLS-Link devices - ESP32S3 microcontrollers with DW1000 UWB modules that perform Time Difference of Arrival (TDoA) localization for minidrones.

The tool provides:
- Automatic device discovery on the network
- Real-time device status monitoring
- Configuration management for WiFi, UWB, and anchor networks
- Bulk operations for multi-device control

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RTLS-Link System                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────────────────┐   │
│  │   Minidrone     │ ◄─UWB─► │     RTLS-Link Anchors      │   │
│  │   (Tag Mode)    │         │  (ESP32S3 + DW1000 × 4-6)   │   │
│  └─────────────────┘         └──────────────┬──────────────┘   │
│                                             │                   │
│                                        WiFi/UDP                 │
│                                             │                   │
│                              ┌──────────────▼──────────────┐   │
│                              │   RTLS-Link Manager (Web)   │   │
│                              │  ┌────────┐    ┌────────┐   │   │
│                              │  │ React  │◄──►│Fastify │   │   │
│                              │  │   UI   │    │ Server │   │   │
│                              │  └────────┘    └────────┘   │   │
│                              └─────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Auto Device Discovery** - UDP-based discovery automatically finds RTLS-Link devices on the network
- **Real-time Monitoring** - Live device status with online/offline indicators
- **Web-based Configuration** - Intuitive UI for WiFi, UWB, and anchor setup
- **Bulk Operations** - Toggle LEDs, start UWB, or reboot multiple devices at once
- **Named Configurations** - Save, load, and switch between configuration presets
- **Anchor Network Management** - Define up to 6 anchors with precise 3D coordinates

## Prerequisites

- Node.js 18+
- npm 10+

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (UI + Server)
npm run dev
```

Access the web interface at `http://localhost:5173`

### Production Build

```bash
npm run build
NODE_ENV=production npm start
```

Access at `http://localhost:3000`

## Project Structure

```
rtls-link-manager/
├── package.json              # Root workspace config
├── tsconfig.json             # TypeScript configuration
├── server/                   # Fastify backend
│   ├── package.json
│   └── src/
│       ├── index.ts          # Server entry point (port 3000)
│       ├── routes/
│       │   └── devices.ts    # Device API endpoints
│       └── services/
│           └── discovery.ts  # UDP device discovery
├── ui/                       # React frontend
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx          # React entry point
│       ├── App.tsx           # Main application component
│       ├── components/
│       │   ├── ConfigPanel/  # Device configuration UI
│       │   ├── DeviceGrid/   # Device list display
│       │   ├── Controls/     # Bulk action controls
│       │   └── common/       # Shared UI components
│       └── hooks/
│           └── useDeviceWebSocket.ts  # Device communication
└── shared/                   # Shared types and utilities
    ├── types.ts              # TypeScript interfaces
    ├── commands.ts           # Command builders
    ├── config.ts             # Configuration validation
    └── anchors.ts            # Anchor data transformations
```

## Configuration Options

### UWB Operation Modes

| Mode | Value | Description |
|------|-------|-------------|
| TWR Anchor | 0 | Two-Way Ranging anchor (responds to tags) |
| TWR Tag | 1 | Two-Way Ranging tag (queries anchors) |
| Calibration | 2 | Calibration mode for anchor setup |
| TDoA Anchor | 3 | Time Difference of Arrival anchor |
| TDoA Tag | 4 | Time Difference of Arrival tag |

### WiFi Configuration

- **AP Mode** - Device broadcasts its own network
- **Station Mode** - Device connects to existing network

### Anchor Network

Configure up to 6 anchors with:
- **ID** - Unique identifier (0-99)
- **X, Y, Z** - 3D coordinates in meters

### Geo-Reference

- **Origin** - Latitude/Longitude/Altitude reference point
- **Rotation** - North rotation offset in degrees

## Development

### Commands

```bash
# Development mode (hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Start production server
npm start
```

### Network Ports

| Service | Port | Description |
|---------|------|-------------|
| Fastify Server | 3000 | HTTP API and static files |
| Vite Dev Server | 5173 | Development UI with HMR |
| Device Discovery | 3333 | UDP broadcast listening |
| Device WebSocket | 80 | Device communication (ws://{ip}/ws) |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/devices | List discovered devices |
| GET | /api/devices/:ip | Get single device details |
| DELETE | /api/devices | Clear device cache |

## Troubleshooting

### Devices not discovered

- Verify devices and manager are on the same network
- Check that UDP port 3333 is not blocked by firewall
- Ensure device discovery is enabled in device WiFi settings

### WebSocket connection fails

- Confirm device IP is reachable from manager host
- Check that device web server is enabled
- Verify no firewall blocking port 80

### Configuration not saving

- Check browser console for error messages
- Verify device is online (green status indicator)
- Try reloading the device configuration

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
