const acceptMap = {
    'Video':     '.mp4,.mov,.webm',
    'Audio':     '.mp3,.wav',
    'Image':     '.jpg,.jpeg,.png',
    'Document':  '.pdf',
    'Text File': '.txt'
};

function showCreateModal() {
    document.getElementById('createModal').classList.add('show');
    document.getElementById('evidence_type').addEventListener('change', function () {
        const fileInput = document.getElementById('evidence_file');
        fileInput.accept = acceptMap[this.value] || '';
        fileInput.value = '';
    });
}

function hideCreateModal() {
    document.getElementById('createModal').classList.remove('show');
    document.getElementById('createForm').reset();
}

function showTransferModal() {
    document.getElementById('transferModal').classList.add('show');
}

function hideTransferModal() {
    document.getElementById('transferModal').classList.remove('show');
    document.getElementById('transferForm').reset();
}

async function createEvidence(event) {
    event.preventDefault();

    const evidenceType = document.getElementById('evidence_type').value;
    const fileInput = document.getElementById('evidence_file');

    const allowedExtensions = {
        'Video':     ['.mp4', '.mov', '.webm'],
        'Audio':     ['.mp3', '.wav'],
        'Image':     ['.jpg', '.jpeg', '.png'],
        'Document':  ['.pdf'],
        'Text File': ['.txt']
    };

    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name.toLowerCase();
        const allowed = allowedExtensions[evidenceType] || [];
        const valid = allowed.some(ext => fileName.endsWith(ext));
        if (!valid) {
            alert(`Invalid file for type "${evidenceType}".\nAllowed: ${allowed.join(', ')}`);
            return;
        }
    }

    const formData = new FormData();
    formData.append('case_number', document.getElementById('case_number').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('evidence_type', evidenceType);

    if (fileInput.files.length > 0) {
        formData.append('evidence_file', fileInput.files[0]);
    }

    try {
        const response = await fetch('/api/evidence/create', {
            method: 'POST',
            body: formData
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            alert('Session expired. Please log in again.');
            return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            window.location.href = `/evidence/${result.evidence_id}`;
        } else {
            alert(result.error || 'Error creating evidence');
        }
    } catch (error) {
        alert('Error creating evidence: ' + error.message);
    }
}

async function transferEvidence(event, evidenceId) {
    event.preventDefault();

    const transferredTo = document.getElementById('transfer_to').value;
    const notes = document.getElementById('transfer_notes').value;

    if (!transferredTo) {
        alert('Please select a user to transfer to');
        return;
    }

    try {
        const response = await fetch(`/api/evidence/${evidenceId}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transferred_to: transferredTo, notes: notes })
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            alert('Session expired. Please log in again.');
            return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            location.reload();
        } else {
            alert(result.error || 'Error transferring evidence');
        }
    } catch (error) {
        alert('Error transferring evidence: ' + error.message);
    }
}

async function verifyIntegrity(evidenceId) {
    const resultDiv = document.getElementById('verifyResult');
    resultDiv.innerHTML = 'Verifying integrity...';
    resultDiv.className = 'verify-result show';

    try {
        const response = await fetch(`/api/evidence/${evidenceId}/verify`, { method: 'POST' });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = 'Session expired. Please log in again.';
            return;
        }

        const result = await response.json();

        if (result.is_valid) {
            resultDiv.className = 'verify-result verify-pass show';
            resultDiv.innerHTML = 'Integrity Check: PASS  -  Hash matches original.';
        } else {
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = 'Integrity Check: FAIL  -  Evidence may have been tampered with.';
        }

        setTimeout(() => location.reload(), 2000);
    } catch (error) {
        resultDiv.className = 'verify-result verify-fail show';
        resultDiv.innerHTML = 'Error: ' + error.message;
    }
}

async function sealEvidence(evidenceId) {
    if (!confirm('Seal this evidence? This action cannot be undone.')) return;

    try {
        const response = await fetch(`/api/evidence/${evidenceId}/seal`, { method: 'POST' });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            alert('Session expired. Please log in again.');
            return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            location.reload();
        } else {
            alert(result.error || 'Error sealing evidence');
        }
    } catch (error) {
        alert('Error sealing evidence: ' + error.message);
    }
}

window.onclick = function(event) {
    const createModal   = document.getElementById('createModal');
    const transferModal = document.getElementById('transferModal');
    const videoModal    = document.getElementById('videoModal');
    if (event.target === createModal)   hideCreateModal();
    if (event.target === transferModal) hideTransferModal();
    if (event.target === videoModal)    hideVideoModal();
};

async function verifyChain(evidenceId) {
    const resultDiv = document.getElementById('chainResult');
    resultDiv.innerHTML = 'Verifying log chain...';
    resultDiv.className = 'verify-result show';

    try {
        const response = await fetch(`/api/evidence/${evidenceId}/verify_chain`, { method: 'POST' });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = 'Session expired. Please log in again.';
            return;
        }

        const result = await response.json();

        if (result.is_valid) {
            resultDiv.className = 'verify-result verify-pass show';
            resultDiv.innerHTML = `Chain Integrity: PASS  - All ${result.total} log entries verified. Chain is intact.`;
        } else {
            const broken = result.entries && result.entries[result.broken_at - 1];
            const action = broken ? broken.action : 'Unknown';
            const by = broken ? broken.performed_by : 'Unknown';
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = `Chain Integrity: FAIL  - Entry ${result.broken_at} of ${result.total} has been tampered with. (Action: "${action}", By: ${by})`;
        }
    } catch (error) {
        resultDiv.className = 'verify-result verify-fail show';
        resultDiv.innerHTML = 'Error: ' + error.message;
    }
}


/* ================================================================
   LIVE EVIDENCE CAPTURE MODULE
   Supports:
     - getUserMedia (rear camera preferred, front-cam fallback)
     - file input fallback (older iOS Safari, etc.)
     - Geolocation watchPosition (high accuracy)
     - Client metadata collection (browser, screen, network, timezone)
     - Submits to existing /api/evidence/create endpoint
   ================================================================ */

let _captureStream  = null;
let _capturedBlob   = null;
let _gpsData        = null;
let _clientMeta     = null;
let _geoWatchId     = null;

/** Parse a human-readable OS string from the userAgent (fallback only). */
function _detectOS(ua) {
    if (/android/i.test(ua)) {
        const v = ua.match(/Android[\s/]([\d.]+)/);
        return v ? `Android ${v[1]}` : 'Android';
    }
    if (/iphone/i.test(ua)) {
        const v = ua.match(/OS\s([\d_]+)/);
        return v ? `iOS ${v[1].replace(/_/g, '.')} (iPhone)` : 'iOS (iPhone)';
    }
    if (/ipad/i.test(ua)) {
        const v = ua.match(/OS\s([\d_]+)/);
        return v ? `iPadOS ${v[1].replace(/_/g, '.')}` : 'iPadOS';
    }
    // Check Windows BEFORE Linux  -  Android UA also contains 'Linux'
    // Note: Chrome on Windows 11 still sends 'Windows NT 10.0'  -  UACH gives real version
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os x/i.test(ua)) return 'macOS';
    // Linux fallback  -  only if not Android (already caught above)
    if (/linux/i.test(ua)) return 'Linux';
    return navigator.platform || 'Unknown';
}

/** Parse device model from Android userAgent string (fallback only). */
function _detectModel(ua) {
    // Modern Chrome sends a reduced UA  -  'K' or empty; UACH gives real model
    // Attempt to extract model from older-style full Android UA
    const m = ua.match(/\(Linux;\s*Android\s*[\d.]+;\s*([^;)]+?)(?:\s+Build|\))/i);
    if (m) {
        const raw = m[1].trim();
        // Ignore generic Chrome reduced-UA placeholders
        if (raw && raw !== 'K' && raw.length > 1) return raw;
    }
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
    return null;
}

/**
 * Enrich metadata with accurate OS + model from UA Client Hints (Chrome 90+, Edge).
 * Falls back gracefully  -  never throws. Runs async in the background.
 */
async function _enrichWithUACH(meta) {
    if (!navigator.userAgentData) return;
    try {
        const hints = await navigator.userAgentData.getHighEntropyValues(
            ['platform', 'platformVersion', 'model', 'mobile', 'architecture']
        );
        const platform = (hints.platform || navigator.userAgentData.platform || '').trim();
        const rawVer   = (hints.platformVersion || '').trim();

        if (platform) {
            if (platform === 'Windows') {
                // UACH returns NT version (10.0.x = W10, 13.x = W11) which is confusing
                // Just keep it as 'Windows' - user knows their own version
                meta.os = 'Windows';
            } else if (platform === 'Android') {
                // UACH gives the real Android version (Chrome froze UA string to 10)
                const major = rawVer ? rawVer.split('.')[0] : '';
                meta.os = major ? `Android ${major}` : 'Android';
            } else if (platform === 'macOS') {
                // UACH version is like '12.6.0' - show major.minor
                const parts = rawVer.split('.');
                const v = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : rawVer;
                meta.os = v ? `macOS ${v}` : 'macOS';
            } else {
                meta.os = rawVer ? `${platform} ${rawVer}` : platform;
            }
        }
        if (hints.model && hints.model.trim() && hints.model.trim() !== 'K')
            meta.deviceModel = hints.model.trim();
        if (hints.mobile !== undefined) meta.isMobile = hints.mobile;
        if (hints.architecture) meta.cpuArchitecture = hints.architecture;
    } catch (_) { /* UACH unsupported or blocked - UA fallback already in place */ }
}

/** Collect all available browser/device metadata at call time. */
function collectClientMetadata() {
    const nav  = window.navigator;
    const ua   = nav.userAgent;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};

    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Local timestamp in user's timezone (not UTC) for accuracy
    const now  = new Date();
    const localStr = now.toLocaleString('en-GB', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }) + ' ' + tz;

    // Network: distinguish connection type clearly so 'Cellular' vs 'WiFi' is accurate
    const connType = (conn.type || '').toLowerCase();
    const effType  = (conn.effectiveType || '').toUpperCase(); // e.g. '4G', '3G'
    let networkLabel = null;
    if (connType === 'wifi' || connType === 'ethernet') {
        networkLabel = connType === 'wifi' ? 'WiFi' : 'Ethernet';
        if (conn.downlink) networkLabel += ` (${conn.downlink} Mbps)`;
    } else if (connType === 'cellular') {
        networkLabel = `Cellular ${effType}`;
    } else if (conn.effectiveType) {
        // type unknown - just show effective bandwidth measurement
        networkLabel = `Network (measured ${effType})`;
    }

    return {
        userAgent:                ua,
        os:                       _detectOS(ua),
        deviceModel:              _detectModel(ua),
        language:                 nav.language,
        screenWidth:              window.screen.width,
        screenHeight:             window.screen.height,
        devicePixelRatio:         window.devicePixelRatio || null,
        screenOrientation:        (screen.orientation && screen.orientation.type) || null,
        colorDepth:               window.screen.colorDepth,
        maxTouchPoints:           nav.maxTouchPoints || 0,
        hardwareConcurrency:      nav.hardwareConcurrency || null,
        deviceMemory:             nav.deviceMemory || null,
        connection_type:          networkLabel || conn.type || null,
        connection_effectiveType: conn.effectiveType || null,
        connection_downlink_mbps: conn.downlink || null,
        timezone:                 tz,
        captureTimestamp:         localStr,
        captureTimestampISO:      now.toISOString()  // keep UTC ISO for certificate hash
    };
}

/** Attach battery info asynchronously to an existing metadata object. */
async function _enrichWithBattery(meta) {
    if (!navigator.getBattery) return;
    try {
        const b = await navigator.getBattery();
        meta.battery_level_pct  = Math.round(b.level * 100);
        meta.battery_charging   = b.charging;
    } catch (_) {}
}

/** Start GPS watchPosition; update pill UI. Pill is always tappable to retry. */
function startGeolocation() {
    const pill = document.getElementById('gpsStatusPill');

    if (!navigator.geolocation) {
        pill.textContent = 'No GPS';
        pill.className = 'gps-pill gps-denied';
        return;
    }

    pill.textContent = 'Fetching GPS...';
    pill.className = 'gps-pill gps-fetching';

    // Clear any existing watch before starting a new one
    if (_geoWatchId !== null) {
        navigator.geolocation.clearWatch(_geoWatchId);
        _geoWatchId = null;
    }

    _geoWatchId = navigator.geolocation.watchPosition(
        pos => {
            _gpsData = {
                latitude:    pos.coords.latitude,
                longitude:   pos.coords.longitude,
                altitude:    pos.coords.altitude,
                accuracy_m:  pos.coords.accuracy,
                heading:     pos.coords.heading,
                speed:       pos.coords.speed,
                gps_timestamp: new Date(pos.timestamp).toISOString()
            };
            const lat = pos.coords.latitude.toFixed(4);
            const lng = pos.coords.longitude.toFixed(4);
            const acc = Math.round(pos.coords.accuracy || 0);
            pill.textContent = `📍 GPS  -  ${lat}, ${lng}`;
            pill.title = `GPS acquired ±${acc}m`;
            pill.className = 'gps-pill gps-acquired';
            const hint = document.getElementById('gpsSettingsHint');
            if (hint) hint.style.display = 'none';
        },
        err => {
            pill.textContent = 'GPS denied';
            pill.className = 'gps-pill gps-denied';
            const hint = document.getElementById('gpsSettingsHint');
            if (hint) hint.style.display = 'inline';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}



/** Open the Live Capture modal and initialise camera + GPS. */
async function showCaptureModal() {
    document.getElementById('captureModal').classList.add('show');
    document.getElementById('captureStep1').style.display = '';
    document.getElementById('captureStep2').style.display = 'none';
    _capturedBlob = null;
    _gpsData = null;

    _clientMeta = collectClientMetadata();
    _enrichWithBattery(_clientMeta);   // async  -  battery level
    _enrichWithUACH(_clientMeta);      // async  -  real OS + model via Client Hints

    // Show device info chip  -  OS instead of raw platform
    const chip = document.getElementById('deviceInfoChip');
    chip.textContent = _clientMeta.os + (_clientMeta.deviceModel ? ` · ${_clientMeta.deviceModel}` : '');

    await startCamera();
    // Delay GPS request so camera popup is resolved first.
    // Firing both simultaneously causes mobile browsers to drop the GPS popup silently.
    setTimeout(startGeolocation, 800);
}

/** Request camera access. Tries rear, then front, then file-input fallback. */
async function startCamera() {
    const video    = document.getElementById('captureVideo');
    const fallback = document.getElementById('captureFileFallback');
    const shutter  = document.getElementById('shutterBtn');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _activateFallback(video, shutter, fallback);
        return;
    }

    // Try rear camera first (environment), fall back to any camera
    const constraints = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { video: { facingMode: 'user' } },
        { video: true }
    ];

    for (const c of constraints) {
        try {
            _captureStream = await navigator.mediaDevices.getUserMedia(c);
            video.srcObject = _captureStream;
            return;
        } catch (_) { /* try next */ }
    }

    // All getUserMedia attempts failed  -  use file input as last resort
    _activateFallback(video, shutter, fallback);
}

/** Show camera-failed overlay. Gallery picker is the PRIMARY action  -  capture always possible. */
function _activateFallback(video, shutter, fallback) {
    video.style.display   = 'none';
    shutter.style.display = 'none';
    const overlay = document.getElementById('cameraFailedOverlay');
    if (overlay) overlay.style.display = '';

    // Re-attach file-input change listener each time (once per activation)
    const freshInput = document.getElementById('captureFileFallback');
    freshInput.value = '';   // reset so 'change' fires even if same file picked
    freshInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        _capturedBlob = file;
        _clientMeta   = collectClientMetadata();
        showPreviewStep();
    }, { once: true });
}

/** Draw current video frame to canvas and convert to JPEG Blob. */
function captureSnapshot() {
    const video  = document.getElementById('captureVideo');
    const canvas = document.getElementById('captureCanvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // Refresh metadata at exact moment of capture; battery + UACH enrich in background
    _clientMeta = collectClientMetadata();
    _enrichWithBattery(_clientMeta);
    _enrichWithUACH(_clientMeta);

    canvas.toBlob(blob => {
        _capturedBlob = blob;
        showPreviewStep();
    }, 'image/jpeg', 0.92);
}

/** Transition to Step 2: preview + metadata strip + form. */
function showPreviewStep() {
    const preview = document.getElementById('capturePreview');
    preview.src = URL.createObjectURL(_capturedBlob);

    // Build metadata strip rows
    const gps  = _gpsData;
    const cli  = _clientMeta;
    const netStr = [cli.connection_type, cli.connection_effectiveType, cli.connection_downlink_mbps ? `${cli.connection_downlink_mbps} Mbps` : null]
        .filter(Boolean).join(' / ') || 'Unknown';
    const battStr = cli.battery_level_pct != null
        ? `${cli.battery_level_pct}% ${cli.battery_charging ? 'Charging' : ''}`
        : null;
    const rows = [
        ['Captured',  cli.captureTimestamp],
        ['Timezone',  cli.timezone],
        ['OS',        cli.os || 'Unknown'],
        cli.deviceModel ? ['Device', cli.deviceModel] : null,
        ['Network',   netStr],
        battStr ? ['Battery', battStr] : null,
        ['GPS',       gps
            ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} (±${Math.round(gps.accuracy_m || 0)}m)`
            : 'Not available'],
        cli.maxTouchPoints > 0 ? ['Touch', `${cli.maxTouchPoints} points`] : null,
        cli.devicePixelRatio > 1 ? ['DPR', `${cli.devicePixelRatio}x`] : null,
    ].filter(Boolean);
    document.getElementById('capturedMetaStrip').innerHTML = rows.map(([k, v]) =>
        `<div class="meta-strip-row">
            <span class="meta-strip-key">${k}</span>
            <span class="meta-strip-val">${v}</span>
         </div>`
    ).join('');

    // Auto-fill description with a forensic summary
    const gpsStr = gps
        ? `GPS: ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
        : 'GPS: N/A';
    document.getElementById('cap_description').value =
        `Live capture  -  ${_clientMeta.captureTimestamp}  -  ${gpsStr}`;

    document.getElementById('captureStep1').style.display = 'none';
    document.getElementById('captureStep2').style.display = '';
    stopCameraStream();      // Camera no longer needed after snapshot
}

/** Go back to the viewfinder to retake the photo. */
function retakeCapture() {
    _capturedBlob = null;
    document.getElementById('captureStep1').style.display = '';
    document.getElementById('captureStep2').style.display = 'none';
    document.getElementById('gpsStatusPill').textContent = 'Fetching GPS...';
    document.getElementById('gpsStatusPill').className = 'gps-pill gps-fetching';
    startCamera();
    startGeolocation();
}

/** Stop camera stream and GPS watch. */
function stopCameraStream() {
    if (_captureStream) {
        _captureStream.getTracks().forEach(t => t.stop());
        _captureStream = null;
    }
    if (_geoWatchId !== null) {
        navigator.geolocation.clearWatch(_geoWatchId);
        _geoWatchId = null;
    }
}

/** Close and fully reset the capture modal. */
function hideCaptureModal() {
    stopCameraStream();
    document.getElementById('captureModal').classList.remove('show');
    const form = document.getElementById('captureForm');
    if (form) form.reset();
    document.getElementById('captureStep1').style.display = '';
    document.getElementById('captureStep2').style.display = 'none';
    const pill = document.getElementById('gpsStatusPill');
    pill.textContent = 'Fetching GPS...';
    pill.className   = 'gps-pill gps-fetching';
    _capturedBlob = null;
    _gpsData      = null;
    _clientMeta   = null;
}

/** Submit captured image + all metadata to /api/evidence/create. */
async function submitLiveCapture(event) {
    event.preventDefault();

    if (!_capturedBlob) {
        alert('No image captured. Please take a photo first.');
        return;
    }

    const submitBtn = document.getElementById('captureSubmitBtn');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Uploading…';

    // Merge client browser metadata with live GPS data
    const metadata = Object.assign({}, _clientMeta, { gps: _gpsData });

    const formData = new FormData();
    formData.append('case_number',   document.getElementById('cap_case_number').value);
    formData.append('description',   document.getElementById('cap_description').value);
    formData.append('evidence_type', document.getElementById('cap_evidence_type').value);
    formData.append('client_metadata', JSON.stringify(metadata));

    // Timestamped filename preserves capture time in filesystem
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    formData.append('evidence_file', _capturedBlob, `live_capture_${ts}.jpg`);

    try {
        const response = await fetch('/api/evidence/create', { method: 'POST', body: formData });

        const ct = response.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) {
            alert('Session expired. Please log in again.');
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Register Evidence';
            return;
        }

        const result = await response.json();
        if (response.ok && result.success) {
            window.location.href = `/evidence/${result.evidence_id}`;
        } else {
            alert(result.error || 'Error creating evidence');
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Register Evidence';
        }
    } catch (err) {
        alert('Upload error: ' + err.message);
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Register Evidence';
    }
}

/* ================================================================
   LIVE VIDEO RECORDING MODULE
   Uses MediaRecorder API. Completely separate state from the
   image-capture module above. Submits to the same
   /api/evidence/create endpoint as a .webm (or .mp4) file.
   ================================================================ */

let _recordStream      = null;
let _recordedChunks    = [];
let _mediaRecorder     = null;
let _recordedBlob      = null;
let _recordGpsData     = null;
let _recordClientMeta  = null;
let _recordGeoWatchId  = null;
let _recordTimerInt    = null;
let _recordSeconds     = 0;
const MAX_REC_SECS     = 300; // 5-minute hard cap

/** Open video modal, start camera + GPS preview. */
async function showVideoModal() {
    document.getElementById('videoModal').classList.add('show');
    document.getElementById('videoStep1').style.display = '';
    document.getElementById('videoStep2').style.display = 'none';
    _recordedBlob   = null;
    _recordGpsData  = null;
    _recordedChunks = [];
    _recordSeconds  = 0;
    resetRecordUI();

    _recordClientMeta = collectClientMetadata();
    _enrichWithBattery(_recordClientMeta);  // async  -  battery level
    _enrichWithUACH(_recordClientMeta);     // async  -  real OS + model via Client Hints

    const chip = document.getElementById('videoDeviceChip');
    if (chip) chip.textContent = _recordClientMeta.os +
        (_recordClientMeta.deviceModel ? ` · ${_recordClientMeta.deviceModel}` : '');

    await startVideoCamera();
    setTimeout(startVideoGeolocation, 800);
}

/** Close and fully reset the video modal. */
function hideVideoModal() {
    stopVideoStream();
    _stopRecordTimer();
    document.getElementById('videoModal').classList.remove('show');
    const form = document.getElementById('videoForm');
    if (form) form.reset();
    document.getElementById('videoStep1').style.display = '';
    document.getElementById('videoStep2').style.display = 'none';
    const pill = document.getElementById('videoGpsPill');
    if (pill) { pill.textContent = 'Fetching GPS...'; pill.className = 'gps-pill gps-fetching'; }
    const timer = document.getElementById('recordTimer');
    if (timer) timer.textContent = '00:00';
    resetRecordUI();
    _recordedBlob  = null;
    _recordGpsData = null;
    _recordClientMeta = null;
    _recordedChunks   = [];
    _recordSeconds    = 0;
}

/** Request camera + audio. Rear camera preferred; falls back progressively.
 *  Detects specific error types and shows actionable messages instead of
 *  silently swallowing errors (mirrors image-capture permission logic). */
async function startVideoCamera() {
    const video  = document.getElementById('videoPreviewLive');
    const recBtn = document.getElementById('recordBtn');
    if (!video) return;

    // Hide failed overlay in case of retry
    const failEl = document.getElementById('videoFailedOverlay');
    if (failEl) failEl.style.display = 'none';
    if (video)  video.style.display  = '';
    if (recBtn) recBtn.style.display = '';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _showVideoFailed(
            'Camera not supported by this browser.',
            'Please use Chrome, Firefox, or Safari on a modern device.'
        );
        return;
    }

    // Progressive fallback: rear+audio → front+audio → any+audio → video-only
    const constraints = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true },
        { video: { facingMode: 'user' }, audio: true },
        { video: true, audio: true },
        { video: true }  // audio-only failure fallback (mic blocked but camera OK)
    ];

    let lastErr = null;
    for (const c of constraints) {
        try {
            _recordStream = await navigator.mediaDevices.getUserMedia(c);
            video.srcObject = _recordStream;
            if (recBtn) recBtn.style.display = '';
            return;  // success
        } catch (err) {
            lastErr = err;
            // Permission denied = no point trying remaining constraints
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') break;
        }
    }

    // Map error type to user-actionable message
    let msg, hint;
    if (!lastErr) { return; }  // shouldn't happen
    switch (lastErr.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            msg  = 'Camera or microphone access was denied.';
            hint = 'Open browser settings, find this site under Camera / Microphone permissions, set both to Allow, then reopen this modal.';
            break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            msg  = 'No camera found on this device.';
            hint = 'Connect a camera or use a device with a built-in camera, then reopen this modal.';
            break;
        case 'NotReadableError':
        case 'TrackStartError':
            msg  = 'Camera is already in use by another app.';
            hint = 'Close other apps or browser tabs using the camera (e.g. video calls), then reopen this modal.';
            break;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            msg  = 'Camera resolution not supported.';
            hint = 'Try closing and reopening this modal to attempt with lower resolution settings.';
            break;
        default:
            msg  = 'Camera error: ' + lastErr.name + '.';
            hint = 'Try reloading the page or using a different browser (Chrome or Firefox recommended).';
    }
    _showVideoFailed(msg, hint);
}

/** Show the camera-failed overlay with a specific message and hint. */
function _showVideoFailed(msg, hint) {
    const video  = document.getElementById('videoPreviewLive');
    const recBtn = document.getElementById('recordBtn');
    const failEl = document.getElementById('videoFailedOverlay');
    const msgEl  = document.getElementById('videoFailedMsg');
    const hintEl = document.getElementById('videoFailedHint');
    if (video)  video.style.display  = 'none';
    if (recBtn) recBtn.style.display = 'none';
    if (failEl) failEl.style.display = '';
    if (msgEl  && msg)  msgEl.textContent  = msg;
    if (hintEl && hint) hintEl.textContent = hint;
}

/** Retry camera after user grants permission (no need to reopen modal). */
async function retryVideoCamera() {
    if (_recordStream) {
        _recordStream.getTracks().forEach(t => t.stop());
        _recordStream = null;
    }
    await startVideoCamera();
}

/** GPS watchPosition for the video modal. */
function startVideoGeolocation() {
    const pill = document.getElementById('videoGpsPill');
    if (!pill) return;

    if (!navigator.geolocation) {
        pill.textContent = 'No GPS';
        pill.className = 'gps-pill gps-denied';
        return;
    }

    pill.textContent = 'Fetching GPS...';
    pill.className   = 'gps-pill gps-fetching';

    if (_recordGeoWatchId !== null) {
        navigator.geolocation.clearWatch(_recordGeoWatchId);
        _recordGeoWatchId = null;
    }

    _recordGeoWatchId = navigator.geolocation.watchPosition(
        pos => {
            _recordGpsData = {
                latitude:      pos.coords.latitude,
                longitude:     pos.coords.longitude,
                altitude:      pos.coords.altitude,
                accuracy_m:    pos.coords.accuracy,
                heading:       pos.coords.heading,
                speed:         pos.coords.speed,
                gps_timestamp: new Date(pos.timestamp).toISOString()
            };
            const lat = pos.coords.latitude.toFixed(4);
            const lng = pos.coords.longitude.toFixed(4);
            const acc = Math.round(pos.coords.accuracy || 0);
            pill.textContent = `GPS - ${lat}, ${lng}`;
            pill.title       = `GPS acquired ±${acc}m`;
            pill.className   = 'gps-pill gps-acquired';
            // Hide hint if GPS was previously denied but now granted
            const hint = document.getElementById('videoGpsSettingsHint');
            if (hint) hint.style.display = 'none';
        },
        err => {
            pill.textContent = 'GPS denied';
            pill.className   = 'gps-pill gps-denied';
            // Show settings hint  -  same pattern as image capture
            const hint = document.getElementById('videoGpsSettingsHint');
            if (hint) hint.style.display = 'inline';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

/** Begin recording. Captures GPS + metadata at record-start (forensic standard). */
function startRecording() {
    if (!_recordStream) {
        alert('Camera not ready. Please wait or reload.');
        return;
    }

    _recordedChunks   = [];
    _recordSeconds    = 0;
    _recordClientMeta = collectClientMetadata();
    _enrichWithBattery(_recordClientMeta); // async, background

    // Pick best supported MIME type
    const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
    ];
    let selectedMime = '';
    for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) { selectedMime = m; break; }
    }

    try {
        _mediaRecorder = new MediaRecorder(_recordStream, selectedMime ? { mimeType: selectedMime } : {});
    } catch (e) {
        _mediaRecorder = new MediaRecorder(_recordStream);
    }

    _mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) _recordedChunks.push(e.data);
    };

    _mediaRecorder.onstop = () => {
        const mime    = _mediaRecorder.mimeType || 'video/webm';
        _recordedBlob = new Blob(_recordedChunks, { type: mime });
        showVideoPreviewStep();
    };

    _mediaRecorder.start(1000); // 1-second timeslice chunks

    // Switch to recording UI
    document.getElementById('recordBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display   = '';
    const recInd = document.getElementById('recordingIndicator');
    if (recInd) recInd.style.display = '';

    // Start elapsed timer
    _recordTimerInt = setInterval(() => {
        _recordSeconds++;
        const m = String(Math.floor(_recordSeconds / 60)).padStart(2, '0');
        const s = String(_recordSeconds % 60).padStart(2, '0');
        const timer = document.getElementById('recordTimer');
        if (timer) timer.textContent = `${m}:${s}`;
        if (_recordSeconds >= MAX_REC_SECS) stopRecording(); // auto-stop at 5 min
    }, 1000);
}

/** Stop recording and transition to preview step. */
function stopRecording() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
        _mediaRecorder.stop();
    }
    _stopRecordTimer();
    resetRecordUI();
}

function _stopRecordTimer() {
    if (_recordTimerInt) { clearInterval(_recordTimerInt); _recordTimerInt = null; }
}

/** Reset record/stop button visibility. */
function resetRecordUI() {
    const r = document.getElementById('recordBtn');
    const s = document.getElementById('stopBtn');
    const i = document.getElementById('recordingIndicator');
    if (r) r.style.display = '';
    if (s) s.style.display = 'none';
    if (i) i.style.display = 'none';
}

/** Show Step 2: recorded video preview + metadata strip. */
function showVideoPreviewStep() {
    const previewVid = document.getElementById('videoPreviewRecorded');
    if (previewVid) previewVid.src = URL.createObjectURL(_recordedBlob);

    const gps = _recordGpsData;
    const cli = _recordClientMeta;
    const netStr = [cli.connection_type, cli.connection_effectiveType,
        cli.connection_downlink_mbps ? `${cli.connection_downlink_mbps} Mbps` : null]
        .filter(Boolean).join(' / ') || 'Unknown';
    const battStr = cli.battery_level_pct != null
        ? `${cli.battery_level_pct}% ${cli.battery_charging ? 'Charging' : ''}`
        : null;
    const durStr = `${String(Math.floor(_recordSeconds / 60)).padStart(2,'0')}:${String(_recordSeconds % 60).padStart(2,'0')}`;

    const rows = [
        ['Recorded At', cli.captureTimestamp],
        ['Duration',    durStr],
        ['Timezone',    cli.timezone],
        ['OS',          cli.os || 'Unknown'],
        cli.deviceModel ? ['Device', cli.deviceModel] : null,
        ['Network',     netStr],
        battStr ? ['Battery', battStr] : null,
        ['GPS at Start', gps
            ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} (±${Math.round(gps.accuracy_m || 0)}m)`
            : 'Not available'],
    ].filter(Boolean);

    const strip = document.getElementById('videoMetaStrip');
    if (strip) strip.innerHTML = rows.map(([k, v]) =>
        `<div class="meta-strip-row">
            <span class="meta-strip-key">${k}</span>
            <span class="meta-strip-val">${v}</span>
         </div>`
    ).join('');

    const gpsStr = gps
        ? `GPS: ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
        : 'GPS: N/A';
    const descEl = document.getElementById('vid_description');
    if (descEl) descEl.value =
        `Live video  -  ${cli.captureTimestamp}  -  Duration: ${durStr}  -  ${gpsStr}`;

    document.getElementById('videoStep1').style.display = 'none';
    document.getElementById('videoStep2').style.display = '';

    // Release camera  -  no longer needed after recording
    if (_recordStream) {
        _recordStream.getTracks().forEach(t => t.stop());
        _recordStream = null;
    }
    if (_recordGeoWatchId !== null) {
        navigator.geolocation.clearWatch(_recordGeoWatchId);
        _recordGeoWatchId = null;
    }
}

/** Go back to Step 1 to re-record. */
function retakeVideo() {
    _recordedBlob   = null;
    _recordedChunks = [];
    _recordSeconds  = 0;
    document.getElementById('videoStep1').style.display = '';
    document.getElementById('videoStep2').style.display = 'none';
    const pill = document.getElementById('videoGpsPill');
    if (pill) { pill.textContent = 'Fetching GPS...'; pill.className = 'gps-pill gps-fetching'; }
    const timer = document.getElementById('recordTimer');
    if (timer) timer.textContent = '00:00';
    resetRecordUI();
    startVideoCamera();
    startVideoGeolocation();
}

/** Stop all video/audio tracks and GPS watch. */
function stopVideoStream() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
        try { _mediaRecorder.stop(); } catch (e) {}
    }
    if (_recordStream) {
        _recordStream.getTracks().forEach(t => t.stop());
        _recordStream = null;
    }
    if (_recordGeoWatchId !== null) {
        navigator.geolocation.clearWatch(_recordGeoWatchId);
        _recordGeoWatchId = null;
    }
}

/** Upload recorded video blob + metadata to /api/evidence/create. */
async function submitVideoCapture(event) {
    event.preventDefault();

    if (!_recordedBlob) {
        alert('No video recorded. Please record first.');
        return;
    }

    const submitBtn = document.getElementById('videoSubmitBtn');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Uploading…';

    const metadata = Object.assign({}, _recordClientMeta, {
        gps:                   _recordGpsData,
        recordDurationSeconds: _recordSeconds,
        captureMode:           'live_video_recording'
    });

    const ext = (_recordedBlob.type || '').includes('mp4') ? 'mp4' : 'webm';
    const ts  = new Date().toISOString().replace(/[:.]/g, '-');

    const formData = new FormData();
    formData.append('case_number',    document.getElementById('vid_case_number').value);
    formData.append('description',    document.getElementById('vid_description').value);
    formData.append('evidence_type',  'Video');
    formData.append('client_metadata', JSON.stringify(metadata));
    formData.append('evidence_file',  _recordedBlob, `live_video_${ts}.${ext}`);

    try {
        const response = await fetch('/api/evidence/create', { method: 'POST', body: formData });
        const ct = response.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) {
            alert('Session expired. Please log in again.');
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Register Evidence';
            return;
        }
        const result = await response.json();
        if (response.ok && result.success) {
            window.location.href = `/evidence/${result.evidence_id}`;
        } else {
            alert(result.error || 'Error creating evidence');
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Register Evidence';
        }
    } catch (err) {
        alert('Upload error: ' + err.message);
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Register Evidence';
    }
}
