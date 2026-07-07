# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run Electron desktop app
npm run dev        # Run with DevTools open
npm run web        # Run Express web server on port 3000 (Android tablet mode)
npm run web-dev    # Run web server with nodemon (auto-restart)
npm run build      # Build for all platforms
npm run build-win  # Build Windows NSIS installer → dist/
npm run rebuild-hid # Rebuild node-hid for Electron (requires VS Build Tools)
```

There is no test framework. Python utilities for bulk config updates:
- `replace_limits.py` / `replace_limits_120.py` — regex-based bulk replacement of limit values across HTML/JS files.

## Architecture

This is a dual-platform heat transfer lab instrument controller: an **Electron desktop app** (Windows primary) and an **Express web server** for Android tablets (`server.js` + `renderer-web.js` + `index-web.html`).

### Process Model

```
Hardware (COM port, 115200 baud)
    ↓ 56-byte packets
main.js  ←→  SerialPort / node-hid
    ↓ IPC (contextBridge)
preload.js  (exposes electronAPI + Chart.js to renderer)
    ↓
renderer.js  →  index.html / chart.html / admin.html / lab*.html
```

**`main.js`** — Electron main process and IPC hub. Handles: serial port lifecycle (auto-detect, 115200 baud), USB HID bootloader firmware updates (Intel HEX + CRC), multi-window management (admin panel, pop-out charts, curriculum viewer, 5 lab windows), CSV file I/O, auto-updates via `electron-updater` (publishes to GitHub releases), and hardware safety shutdown on app close.

**`preload.js`** — Context bridge with `nodeIntegration: false` / `contextIsolation: true`. Exposes ~27 IPC handlers as `window.electronAPI`. All renderer→main communication goes through here.

**`renderer.js`** (4,183 lines) — All real-time UI logic: parsing incoming 56-byte packets (header `0x55 0x55`, footer `0xAA 0xAA`), 8 temperature sensors (T1–T8), radial/linear heater temps, power, and air speed. Drives Chart.js with 12 datasets. Sends 4-byte control packets (fan speed 0–100%, heater mode Off/Radial/Linear, heater temp 20–70°C, cooler toggle). Manages CSV snapshot and continuous export, responsive scaling, and temperature-vs-distance graphing.

### UI Files

| File | Purpose |
|---|---|
| `index.html` | Primary instrument interface (glassmorphic, rem-based responsive layout) |
| `admin.html` | PID tuning, firmware bootloader, raw packet inspector |
| `chart.html` | Pop-out Chart.js graphing window |
| `curriculum.html` | Educational content viewer |
| `lab1.html`–`lab5.html` | Interactive lab experiments with 3D model viewer (Three.js + GLTFLoader), multilingual (6 languages) |
| `splash.html` | Startup splash screen |

### Serial Protocol

- **Incoming:** 56-byte packets — `[0x55, 0x55, T1_H, T1_L, T2_H, T2_L, ..., footer 0xAA, 0xAA]`
- **Outgoing (control):** 4-byte packets — `[fan_speed, heater_mode, heater_temp, cooler_state]`
- **Firmware update:** USB HID with Intel HEX records and CRC verification

### Responsive Scaling

The UI scales dynamically by adjusting `document.documentElement.style.fontSize` (root rem). See `RESPONSIVE_SCALING_GUIDE.md` for details. All sizing in `index.html` uses `rem` units.

### Build & Distribution

- `appId`: `com.thermo.heat-transfer-app`
- Output: `dist/` (NSIS Windows installer)
- Auto-update metadata published to GitHub releases (`MuhammdAbdullah/Heat-Transfer`)
- `electron-builder` file globs include all HTML files, `assets/**`, and `node_modules/**`

### Key Dependencies

- `electron` 38.x — desktop shell
- `serialport` 12.x — COM port communication
- `node-hid` 3.x — USB HID bootloader (requires `npm run rebuild-hid` after Electron version changes)
- `chart.js` 4.x — real-time graphing (loaded via preload, not bundled separately)
- `three.js` 0.181.x — 3D model viewer in lab modules
- `electron-updater` 6.x — auto-update from GitHub releases
- `express` 4.x — web server for tablet mode
