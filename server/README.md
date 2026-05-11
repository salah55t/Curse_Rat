# CURSE RAT — C2 Server

The server is the central nervous system of CURSE RAT. It handles the web dashboard, manages multiple TCP listeners, and orchestrates the payload building process.

---

## 📂 File Explanations
- **`server.js`**: The main entry point. Starts the Express web server (Port 3000) and manages dynamic Socket.io communication and TCP listener instances.
- **`builder.js`**: The advanced payload engine. Automates APK decompilation, Smali patching (connection details, notifications), package relocation, and rebuilding/signing.
- **`build_config.json`**: Temporary storage for builder configurations sent from the dashboard.
- **`debug.keystore`**: Used by the builder to sign patched APKs.
- **`base.apk`**: The template Android application used as the foundation for all builds.
- **`Downloads/`**: Stores all data exfiltrated from clients (Camera captures, Mic recordings, Files).
- **`output/`**: Stores the final, ready-to-deploy `Curse.apk`.
- **`public/`**: Contains the THOR Cyber Dashboard frontend.

---

## 🚀 Execution
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Launch Server**:
   ```bash
   node server.js
   ```
3. **Access UI**: Open `http://localhost:3000` in your browser.

## 🛠️ Requirements
- **Node.js**: v16 or higher.
- **Apktool**: Must be installed and available in your PATH.
- **Java JDK 11**: Required for signing (jarsigner).
- **Zipalign**: Part of Android Build Tools, required for APK optimization.
