# Matrix UI — Heat Transfer App

A dual-platform instrument controller for heat transfer lab apparatus. Runs as an **Electron desktop app** on Windows or as an **Express web server** for Android tablets.

Connects to hardware via COM port (115200 baud), parses 56-byte sensor packets in real time, and provides full control over fan speed, heater mode/temperature, and cooler state.

**Latest Release: [v1.3.1](https://github.com/MuhammdAbdullah/Heat-Transfer/releases/latest)**

---

## Quick Start

### End Users

1. Download `Heat Transfer App Setup 1.3.1.exe` from [Releases](https://github.com/MuhammdAbdullah/Heat-Transfer/releases)
2. Run the installer and follow the setup wizard
3. The app auto-connects to the device on launch and checks for updates

### Developers

```bash
git clone https://github.com/MuhammdAbdullah/Matrix-UI-Heat-Transfer.git
cd "Matrix-UI-Heat-Transfer"
npm install
npm start
```

---

## Commands

| Command | Description |
|---|---|
| `npm start` | Run Electron desktop app |
| `npm run dev` | Run with DevTools open |
| `npm run web` | Run Express web server on port 3000 (tablet mode) |
| `npm run web-dev` | Run web server with nodemon (auto-restart) |
| `npm run build` | Build for all platforms |
| `npm run build-win` | Build Windows NSIS installer → `dist/` |
| `npm run rebuild-hid` | Rebuild node-hid for Electron (requires VS Build Tools) |

---

## Features

### Device Communication
- Auto-detects and connects to hardware (VID: `0x12BF`, PID: `0x010C`) at 115200 baud
- Hot-plug detection — automatically reconnects when device is plugged back in
- Validates 56-byte packets (`0x55 0x55` header / `0xAA 0xAA` footer)
- Safety shutdown on app close: fan off, heater off, cooler on, temp reset to 20°C

### Real-Time Monitoring
- 8 temperature sensors (T1–T8), radial heater temp, linear heater temp
- Live power (W) and air speed (m/s) readings
- Graphs auto-clear when the device reconnects after a disconnect

### Device Control
- Fan speed slider: 0–100% with presets (0%, 50%, 100%)
- Heater temperature: 20–70°C
- Heater mode: Off / Radial / Linear
- Left Cooler toggle

### Data Visualization & Export
- Live Chart.js graph with 12 datasets, pop-out window, and print support
- Temperature vs. Distance graph with configurable spatial inputs
- **CSV continuous export** — Start/Stop controls, 3-decimal precision, timestamped filenames
- **Snapshot** — one click appends a single timestamped row to a CSV; path remembered after first save

### Educational Modules
- Five interactive lab experiments (Lab 1–5) with 3D model viewer (Three.js + GLTFLoader)
- Curriculum viewer with guided content
- Multilingual: English, French, German, Spanish, Dutch, Arabic
- Language preference saved and applied across all lab sheets

### Admin Panel (`Ctrl+Shift+A`)
- PID tuning (Proportional, Integral, Derivative)
- Raw packet inspector
- USB HID bootloader for firmware updates (Intel HEX + CRC verification)

---

## Hardware Protocol

### Incoming — 56-byte sensor packet

```
[0x55, 0x55, T1_H, T1_L, T2_H, T2_L, ..., 0xAA, 0xAA]
```

Bytes 3–54 carry T1–T8, radial heater, linear heater, power, and air speed as 16-bit big-endian pairs.

### Outgoing — 4-byte control packet

```
[fan_speed (0–100), heater_mode (0=Off/1=Radial/2=Linear), heater_temp (20–70), cooler_state (0/1)]
```

### Snapshot CSV columns

`date`, `time`, `timestamp_iso`, `T1`–`T8`, `radial_heater_temp`, `linear_heater_temp`, `power_w`, `air_speed_mps`, `fan_percent`, `heater_mode`, `heater_slider_value`, `cooler_state` — all numerics at 3 decimal places.

---

## File Structure

```
Matrix-UI-Heat-Transfer/
├── main.js              # Electron main process — serial, HID, IPC, windows
├── preload.js           # Context bridge (contextIsolation: true)
├── renderer.js          # All real-time UI logic and packet parsing
├── admin-panel.js       # Admin panel controls
├── server.js            # Express web server (tablet mode)
├── renderer-web.js      # Web version renderer
├── index.html           # Primary desktop interface
├── index-web.html       # Tablet/web interface
├── admin.html           # Admin panel
├── chart.html           # Pop-out chart window
├── curriculum.html      # Educational content viewer
├── lab1.html–lab5.html  # Interactive lab experiments
├── splash.html          # Startup splash screen
├── package.json
├── CLAUDE.md            # Claude Code guidance
├── CHANGELOG.md         # Version history
├── README-WEB.md        # Web/tablet mode documentation
├── INSTALL_HID_SUPPORT.md
└── assets/              # Icons, images, fonts, 3D models, JS libs
    ├── Tunnel.glb       # 3D tunnel model (Three.js)
    └── libs/            # Three.js, Chart.js, GLTFLoader, etc.
```

---

## Build & Distribution

- **Platform:** Windows (NSIS installer)
- **App ID:** `com.thermo.heat-transfer-app`
- **Output:** `dist/`
- **Auto-update:** Published to [MuhammdAbdullah/Heat-Transfer](https://github.com/MuhammdAbdullah/Heat-Transfer) GitHub releases via `electron-updater`

```bash
npm run build-win
```

> After changing the Electron version, run `npm run rebuild-hid` to recompile `node-hid` against the new Electron headers.

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `electron` | 38.x | Desktop shell |
| `serialport` | 12.x | COM port communication |
| `node-hid` | 3.x | USB HID bootloader |
| `chart.js` | 4.x | Real-time graphing |
| `three` | 0.181.x | 3D model viewer in lab modules |
| `express` | 4.x | Web server for tablet mode |
| `electron-updater` | 6.x | Auto-update from GitHub releases |
| `electron-builder` | 25.x | App packaging (dev) |
| `nodemon` | 3.x | Web server auto-reload (dev) |

---

## Security

- `contextIsolation: true`, `nodeIntegration: false` in all renderer windows
- All renderer↔main communication via `preload.js` context bridge (~27 IPC handlers)
- Content Security Policy applied to prevent XSS

---

## Troubleshooting

**"No ports found"** — Check USB connection; verify VID `0x12BF` / PID `0x010C` in Device Manager.

**"Connection failed"** — Ensure no other app holds the COM port; check baud rate (115200).

**"Invalid packet"** — Confirm device sends 56-byte packets with correct header/footer bytes.

**Bootloader not detected** — Device must be in bootloader mode (PID: `0xA1`). See [INSTALL_HID_SUPPORT.md](INSTALL_HID_SUPPORT.md).

**Update check fails** — Check internet connection; download manually from [Releases](https://github.com/MuhammdAbdullah/Heat-Transfer/releases) if needed.

---

## Version History

See [CHANGELOG.md](CHANGELOG.md) for full history. **Current: v1.3.1**

---

## Support

Bug reports and feature requests: [GitHub Issues](https://github.com/MuhammdAbdullah/Heat-Transfer/issues)

HID driver setup: [INSTALL_HID_SUPPORT.md](INSTALL_HID_SUPPORT.md)
