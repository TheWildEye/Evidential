// Modal Functions
function showCreateModal() {
    document.getElementById('createModal').classList.add('show');
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

// Create Evidence
async function createEvidence(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append('case_number', document.getElementById('case_number').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('evidence_type', document.getElementById('evidence_type').value);

    // Add file if present
    const fileInput = document.getElementById('evidence_file');
    if (fileInput.files.length > 0) {
        formData.append('evidence_file', fileInput.files[0]);
    }

    try {
        const response = await fetch('/api/evidence/create', {
            method: 'POST',
            body: formData  // Don't set Content-Type, browser will set it with boundary
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Received non-JSON response:', text);
            alert('Server error: Expected JSON but received HTML. Check if you are logged in.');
            return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            window.location.href = `/evidence/${result.evidence_id}`;
        } else {
            alert(result.error || result.message || 'Error creating evidence');
        }
    } catch (error) {
        console.error('Error creating evidence:', error);
        alert('Error creating evidence: ' + error.message);
    }
}

// Transfer Evidence
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transferred_to: transferredTo,
                notes: notes
            })
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Received non-JSON response:', text);
            alert('Server error: Expected JSON but received HTML. Check if you are logged in.');
            return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            location.reload();
        } else {
            alert(result.error || result.message || 'Error transferring evidence');
        }
    } catch (error) {
        console.error('Error transferring evidence:', error);
        alert('Error transferring evidence: ' + error.message);
    }
}

// Verify Integrity
async function verifyIntegrity(evidenceId) {
    const resultDiv = document.getElementById('verifyResult');
    resultDiv.innerHTML = 'Verifying integrity...';
    resultDiv.className = 'verify-result show';

    try {
        const response = await fetch(`/api/evidence/${evidenceId}/verify`, {
            method: 'POST'
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Received non-JSON response:', text);
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = 'Server error: Expected JSON but received HTML. Check if you are logged in.';
            return;
        }

        const result = await response.json();

        if (result.is_valid) {
            resultDiv.className = 'verify-result verify-pass show';
            resultDiv.innerHTML = 'INTEGRITY CHECK PASSED - Evidence hash matches original';
        } else {
            resultDiv.className = 'verify-result verify-fail show';
            resultDiv.innerHTML = 'INTEGRITY CHECK FAILED - Evidence may have been tampered with!';
        }

        // Reload to update timeline
        setTimeout(() => location.reload(), 2000);
    } catch (error) {
        console.error('Error verifying integrity:', error);
        resultDiv.className = 'verify-result verify-fail show';
        resultDiv.innerHTML = 'Error verifying integrity: ' + error.message;
    }
}

// Seal Evidence
async function sealEvidence(evidenceId) {
    if (!confirm('Are you sure you want to seal this evidence? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/evidence/${evidenceId}/seal`, {
            method: 'POST'
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Received non-JSON response:', text);
            alert('Server error: Expected JSON but received HTML. Check if you are logged in.');
            return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            location.reload();
        } else {
            alert(result.error || result.message || 'Error sealing evidence');
        }
    } catch (error) {
        console.error('Error sealing evidence:', error);
        alert('Error sealing evidence: ' + error.message);
    }
}

// Close modals on outside click
window.onclick = function (event) {
    const createModal = document.getElementById('createModal');
    const transferModal = document.getElementById('transferModal');

    if (event.target === createModal) {
        hideCreateModal();
    }
    if (event.target === transferModal) {
        hideTransferModal();
    }
}

// File tampering functions
function enableFileEdit() {
    document.getElementById('fileContentDisplay').style.display = 'none';
    document.getElementById('fileEditMode').style.display = 'block';
    document.getElementById('editFileBtn').style.display = 'none';
}

function cancelFileEdit() {
    document.getElementById('fileContentDisplay').style.display = 'block';
    document.getElementById('fileEditMode').style.display = 'none';
    document.getElementById('editFileBtn').style.display = 'block';
}

async function saveFileEdit(evidenceId) {
    const newContent = document.getElementById('fileContentEdit').value;
    try {
        const response = await fetch('/api/evidence/' + evidenceId + '/update_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            location.reload();  // Just reload, no popup
        } else {
            alert('Error: ' + (result.error || 'Failed to save'));
        }
    } catch (error) {
        alert('Error saving file: ' + error.message);
    }
}
