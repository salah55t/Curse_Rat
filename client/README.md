# CURSE RAT — Android Client (Source)

This directory contains the Java source code for the CURSE RAT Android application. It is structured as a standard Android Studio (Gradle) project.

---

## 🛠️ Requirements
- **Java JDK 11**: Essential for project compilation and Smali compatibility.
- **Android SDK**: v34 or higher.
- **Gradle**: 6.5+ (Wrapper included).

---

## 🏗️ Development & Compilation
To compile the debug version of the client APK:

1. **Clean the project**:
   ```bash
   ./gradlew clean
   ```
2. **Build Debug APK**:
   ```bash
   ./gradlew assembleDebug
   ```
3. **Locate Build Output**:
   The generated APK will be found in:
   `app/build/outputs/apk/debug/app-debug.apk`

---

## 🔧 Core Components
- **`MainService.java`**: The primary foreground service that handles persistent connection and background task execution.
- **`ConnectionManager.java`**: Manages Socket.io/TCP communication and command dispatching.
- **`CameraManager.java`**: Handles remote camera streaming with built-in hardware frame throttling.
- **`KeylogManager.java`**: Implements accessibility-based keylogging.
- **`FileManager.java`**: Handles remote file system navigation and exfiltration.

---

## ⚠️ Important Note
The `HOST` and `PORT` fields in `ConnectionManager.java` are purposely non-final. This allows the server-side **Advanced Builder** to patch them directly in Smali after decompilation without requiring a full recompilation from source.
