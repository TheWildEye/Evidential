const acceptMap = {
    'Video':     '.mp4,.mov',
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
        'Video':     ['.mp4', '.mov'],
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
            resultDiv.innerHTML = 'Integrity Check: PASS — Hash matches original.';
        } else {
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = 'Integrity Check: FAIL — Evidence may have been tampered with.';
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
    const createModal = document.getElementById('createModal');
    const transferModal = document.getElementById('transferModal');
    if (event.target === createModal) hideCreateModal();
    if (event.target === transferModal) hideTransferModal();
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
            resultDiv.innerHTML = `Chain Integrity: PASS &mdash; All ${result.total} log entries verified. Chain is intact.`;
        } else {
            const broken = result.entries && result.entries[result.broken_at - 1];
            const action = broken ? broken.action : 'Unknown';
            const by = broken ? broken.performed_by : 'Unknown';
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = `Chain Integrity: FAIL &mdash; Entry ${result.broken_at} of ${result.total} has been tampered with. (Action: "${action}", By: ${by})`;
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

/** Collect all available browser/device metadata at call time. */
function collectClientMetadata() {
    const nav  = window.navigator;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
    return {
        userAgent:              nav.userAgent,
        platform:               nav.platform,
        language:               nav.language,
        screenWidth:            window.screen.width,
        screenHeight:           window.screen.height,
        colorDepth:             window.screen.colorDepth,
        hardwareConcurrency:    nav.hardwareConcurrency  || null,
        deviceMemory:           nav.deviceMemory         || null,
        connection_type:        conn.type                || null,
        connection_effectiveType: conn.effectiveType     || null,
        timezone:               Intl.DateTimeFormat().resolvedOptions().timeZone,
        captureTimestamp:       new Date().toISOString()
    };
}

/** Start GPS watchPosition; update pill UI. Pill is always tappable to retry. */
function startGeolocation() {
    const pill = document.getElementById('gpsStatusPill');

    if (!navigator.geolocation) {
        pill.textContent = '⚠️ No GPS';
        pill.className = 'gps-pill gps-denied';
        return;
    }

    pill.textContent = '📍 Fetching…';
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
            pill.textContent = `📍 ${lat}, ${lng}`;
            pill.title = `GPS acquired ±${acc}m`;
            pill.className = 'gps-pill gps-acquired';
            // Hide retry button once GPS is acquired
            const retryBtn = document.getElementById('retryGpsBtn');
            if (retryBtn) retryBtn.style.display = 'none';
        },
        err => {
            pill.textContent = '⚠️ GPS denied';
            pill.className = 'gps-pill gps-denied';
            // Show explicit retry button so user knows what to do
            const retryBtn = document.getElementById('retryGpsBtn');
            if (retryBtn) retryBtn.style.display = 'inline-flex';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

/**
 * Re-request GPS on demand (called when user taps the pill).
 * Always retries — unlimited taps allowed. GPS is OPTIONAL for image capture.
 */
function retryGPS() {
    // Always just restart geolocation — no blocking on permission state.
    // Even if 'denied', some browsers will re-prompt on re-call.
    // Image capture is never gated on GPS.
    startGeolocation();
}

/** Open the Live Capture modal and initialise camera + GPS. */
async function showCaptureModal() {
    document.getElementById('captureModal').classList.add('show');
    document.getElementById('captureStep1').style.display = '';
    document.getElementById('captureStep2').style.display = 'none';
    _capturedBlob = null;
    _gpsData = null;

    // Collect baseline client metadata immediately on open
    _clientMeta = collectClientMetadata();

    // Show device info chip
    const chip = document.getElementById('deviceInfoChip');
    const memStr = navigator.deviceMemory ? ` · ${navigator.deviceMemory}GB` : '';
    chip.textContent = (navigator.platform || 'Unknown') + memStr;

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
            // Camera succeeded — hide the retry camera button if visible
            const retryCamBtn = document.getElementById('retryCameraBtn');
            if (retryCamBtn) retryCamBtn.style.display = 'none';
            return;
        } catch (_) { /* try next */ }
    }

    // All getUserMedia attempts failed — use file input as last resort
    _activateFallback(video, shutter, fallback);
}

/** Show camera-failed overlay. Gallery picker is the PRIMARY action — capture always possible. */
function _activateFallback(video, shutter, fallback) {
    video.style.display   = 'none';
    shutter.style.display = 'none';
    const overlay = document.getElementById('cameraFailedOverlay');
    if (overlay) overlay.style.display = '';
    // Show the retry camera button in controls bar
    const retryCamBtn = document.getElementById('retryCameraBtn');
    if (retryCamBtn) retryCamBtn.style.display = 'inline-flex';

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

/** Retry camera access — re-triggers browser permission popup. Unlimited retries. */
async function retryCamera() {
    const overlay = document.getElementById('cameraFailedOverlay');
    if (overlay) overlay.style.display = 'none';
    const video   = document.getElementById('captureVideo');
    const shutter = document.getElementById('shutterBtn');
    video.style.display   = '';
    shutter.style.display = '';

    if (_captureStream) {
        _captureStream.getTracks().forEach(t => t.stop());
        _captureStream = null;
    }

    // Reset the fail message in case it was changed by a previous blocked attempt
    const msg = document.querySelector('.cam-fail-msg');
    if (msg) msg.textContent = 'Camera access was denied or unavailable';

    // Always just try again — no blocking on Permissions API
    // If still denied, _activateFallback will re-show the overlay with gallery option
    await startCamera();
}

/** Draw current video frame to canvas and convert to JPEG Blob. */
function captureSnapshot() {
    const video  = document.getElementById('captureVideo');
    const canvas = document.getElementById('captureCanvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // Refresh metadata timestamp at the exact moment of capture
    _clientMeta = collectClientMetadata();

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
    const rows = [
        ['📅 Captured',  _clientMeta.captureTimestamp],
        ['🌐 Timezone',  _clientMeta.timezone],
        ['📡 Network',   _clientMeta.connection_effectiveType || _clientMeta.connection_type || 'Unknown'],
        ['📍 GPS',       gps
            ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} (±${Math.round(gps.accuracy_m || 0)}m)`
            : 'Not available'],
        ['💻 Platform',  _clientMeta.platform || 'Unknown'],
    ];
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
        `Live capture — ${_clientMeta.captureTimestamp} — ${gpsStr}`;

    document.getElementById('captureStep1').style.display = 'none';
    document.getElementById('captureStep2').style.display = '';
    stopCameraStream();      // Camera no longer needed after snapshot
}

/** Go back to the viewfinder to retake the photo. */
function retakeCapture() {
    _capturedBlob = null;
    document.getElementById('captureStep1').style.display = '';
    document.getElementById('captureStep2').style.display = 'none';
    document.getElementById('gpsStatusPill').textContent = '📍 Fetching GPS…';
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
    pill.textContent = '📍 Fetching GPS…';
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
