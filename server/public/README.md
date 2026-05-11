# CURSE RAT — THOR Cyber Dashboard

This directory contains the high-fidelity frontend of the CURSE RAT C2 server. It is built as a **Single Page Application (SPA)** using a modular iframe-switching architecture.

---

## 🏗️ Architecture
- **`index.html`**: The main container. Features the CURSE RAT vertical branding, the interactive 3D Globe, real-time telemetry gauges, and the global navigation sidebar.
- **`UI/`**: Modular sub-pages loaded dynamically:
    - **`clients.html`**: The command center. Provides a live list of connected devices and interfaces for all RAT modules (Camera, Mic, Files, etc.).
    - **`build.html`**: The Advanced Payload Builder interface.
    - **`deploy.html`**: Quick deployment tools.
    - **`logs.html`**: System event tracking (Under Construction).
    - **`settings.html`**: Global server settings (Under Construction).
- **`client.js`**: Handles the heavy lifting for the main dashboard (Socket.io listeners, Telemetry updates, Globe rotation).
- **`style.css`**: Defines the "Cyber/Dark" aesthetic, including glowing effects and custom layouts.

---

## ⚡ Features
- **Real-Time Updates**: No page reloads required. Data flows seamlessly via Socket.io.
- **Interactive Telemetry**: Visualized RAM/CPU usage and network throughput.
- **Device Management**: One-click access to remote device functions.
